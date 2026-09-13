// CPU submission audit using Three's real virtual cameras and frustum tests.
// This does not create a browser, measure GPU time, or export model files.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { installCanvas,loadPlaqueMap,loadMaterialImages } from './node-canvas.mjs';
import { buildPavilion } from '../src/model.js';
import { createLake,createLakebed } from '../src/lake.js';
import { createTerrain } from '../src/scene-context.js';
import { createFishSchool } from '../src/fish-school.js';
import { applyLighting,MOON_POSITION } from '../src/lighting.js';
import { RENDER_LAYERS,enableMainSceneLayers,partitionWaterPasses } from '../src/render-pipeline.js';

installCanvas();
const root=resolve(new URL('..',import.meta.url).pathname),hash=value=>createHash('sha256').update(value).digest('hex');
const baselineArg=process.argv.find(arg=>arg.startsWith('--baseline='))?.slice(11);
const [plaqueMap,surfaceImages]=await Promise.all([loadPlaqueMap(),loadMaterialImages()]);
const textureHashes=new WeakMap();
function textureHash(texture) {
  if(textureHashes.has(texture))return textureHashes.get(texture);
  const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const value=hash(Buffer.concat([Buffer.from(ctx.getImageData(0,0,canvas.width,canvas.height).data.buffer),Buffer.from(JSON.stringify({
    width:image.width,height:image.height,wrapS:texture.wrapS,wrapT:texture.wrapT,repeat:texture.repeat.toArray(),offset:texture.offset.toArray(),
    rotation:texture.rotation,center:texture.center.toArray(),flipY:texture.flipY,colorSpace:texture.colorSpace,anisotropy:texture.anisotropy,
    minFilter:texture.minFilter,magFilter:texture.magFilter,generateMipmaps:texture.generateMipmaps,
  }))]));textureHashes.set(texture,value);return value;
}
function materialHash(material) {
  const textureIds=new Map();for(const value of Object.values(material))if(value?.isTexture)textureIds.set(value.uuid,textureHash(value));
  // Pixels are hashed above; prefill texture references to avoid image encoding.
  const json=material.toJSON({textures:Object.fromEntries([...textureIds.keys()].map(uuid=>[uuid,{uuid}])),images:{}});delete json.uuid;delete json.metadata;
  return hash(JSON.stringify(json,(key,value)=>typeof value==='string'&&textureIds.has(value)?textureIds.get(value):value)+material.onBeforeCompile.toString()+material.customProgramCacheKey());
}
function displayFingerprint(model) {
  model.root.updateMatrixWorld(true);const materials=new Map(),result=[];
  model.root.traverse(object=>{
    const item={name:object.name,type:object.type,visible:object.visible,castShadow:object.castShadow,receiveShadow:object.receiveShadow,
      matrix:[...object.matrixWorld.elements],frustumCulled:object.frustumCulled,renderOrder:object.renderOrder};
    if(object.isMesh){
      const geometry=object.geometry,h=createHash('sha256');
      for(const [key,attribute] of Object.entries({...geometry.attributes,index:geometry.index}).sort(([a],[b])=>a.localeCompare(b))){
        if(!attribute)continue;h.update(JSON.stringify([key,attribute.array.constructor.name,attribute.itemSize,attribute.normalized]));
        h.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
      }
      for(const attribute of [object.instanceMatrix,object.instanceColor])if(attribute)h.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
      item.geometry=h.digest('hex');item.count=object.count??1;item.drawRange=geometry.drawRange;item.groups=geometry.groups;
      const materialList=Array.isArray(object.material)?object.material:[object.material];
      item.materials=materialList.map(material=>{if(!materials.has(material))materials.set(material,materialHash(material));return materials.get(material);});
    }
    result.push(item);
  });
  return hash(JSON.stringify({objects:result,lightPositions:model.lightPositions.map(p=>p.toArray())}));
}

const model=buildPavilion({plaqueMap,surfaceImages}),displayComparison=[];
let unchangedSources=[];
if(baselineArg) {
  const baselinePath=resolve(baselineArg),baselineModule=await import(pathToFileURL(resolve(baselinePath,'src/model.js')));
  const baseline=baselineModule.buildPavilion({plaqueMap,surfaceImages});
  for(const time of [null,0,.7,2.1,8.6]) {
    if(time!==null){baseline.update(time);model.update(time);}
    const before=displayFingerprint(baseline),after=displayFingerprint(model);
    assert.equal(after,before,`V10 display data differs at time ${time}`);
    displayComparison.push({time,baseline:before,optimized:after,equal:true});
  }
  assert.deepEqual(model.root.userData.geometryMetrics,baseline.root.userData.geometryMetrics);
  for(const filename of ['fish-school.js','fish-geometry.js','fish-material.js','fish-simulation.js','fish-worker.js','fish-habitat.js','lighting.js','model-optimization.js','surface-materials.js','surface-finishing.js','roof-geometry.js','pavilion-craft.js','moon-gate.js','garden-details.js','style.css']){
    const [before,after]=await Promise.all([readFile(resolve(baselinePath,'src',filename)),readFile(resolve(root,'src',filename))]);
    assert.ok(before.equals(after),`${filename} changed`);unchangedSources.push({file:`src/${filename}`,sha256:hash(after)});
  }
}

// Build the same two water targets with the actual Reflector/Refractor objects;
// image loading and draw calls are intercepted, GLSL sources are untouched.
Object.assign(globalThis,{innerWidth:1440,innerHeight:900,devicePixelRatio:1});
THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();
const scene=new THREE.Scene(),sun=new THREE.DirectionalLight(),fill=new THREE.DirectionalLight(),hemisphere=new THREE.HemisphereLight();
sun.castShadow=true;Object.assign(sun.shadow.camera,{left:-14,right:14,top:16,bottom:-12,near:1,far:55});
const lamps=model.lightPositions.map(p=>{const light=new THREE.PointLight('#ffbd70',.4,5.5,2);light.position.copy(p);return light;});
scene.add(model.root,sun,fill,hemisphere,...lamps);
const sky=new Sky();sky.scale.setScalar(4500);scene.add(sky);
const moon=new THREE.Mesh(new THREE.SphereGeometry(1.8,32,24),new THREE.MeshBasicMaterial());moon.position.set(...MOON_POSITION);scene.add(moon);
const starPositions=[];
for(let i=0;i<1150;i++){const a=i*2.399963,e=.1+((i*83)%997)/997*1.45;starPositions.push(Math.cos(a)*Math.cos(e)*260,Math.sin(e)*260,Math.sin(a)*Math.cos(e)*260);}
const stars=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3)),new THREE.PointsMaterial());scene.add(stars);
let target=null,passes=[];
const renderer={capabilities:{getMaxAnisotropy:()=>8},getRenderTarget:()=>target,setRenderTarget:value=>{target=value;},xr:{enabled:false},shadowMap:{autoUpdate:true},state:{buffers:{depth:{setMask(){}}}},render(scene,camera){
  if(scene.matrixWorldAutoUpdate)scene.updateMatrixWorld();
  if(camera.parent===null&&camera.matrixWorldAutoUpdate)camera.updateMatrixWorld();
  const pass=camera.userData.refractor?'refraction':'reflection';passes.push(countPass(camera,pass));
}};
const lake=await createLake({renderer,mobile:false,reducedMotion:false,sun}),lakebed=createLakebed(),terrain=createTerrain();
scene.add(lake.water,lakebed,terrain);
// Classification is conservative even if a caller builds it at an animated pose.
const partition=partitionWaterPasses([model.root,lakebed,terrain]);
const beforeLayers=displayFingerprint(model);partition.restore();assert.equal(displayFingerprint(model),beforeLayers);partition.apply();
const recordById=new Map(partition.records.map(record=>[record.object.id,record]));
function countPass(camera,name,shadowFrustum=null) {
  const frustum=shadowFrustum??new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  let calls=0,triangles=0,points=0;const objects=[];
  scene.traverseVisible(object=>{
    if(!(object.isMesh||object.isPoints)||!object.layers.test(camera.layers)||(shadowFrustum&&!object.castShadow))return;
    if(object.frustumCulled&&!frustum.intersectsObject(object))return;
    const geometry=object.geometry,materials=Array.isArray(object.material)?object.material:[object.material];
    const groups=Array.isArray(object.material)?geometry.groups:[{start:0,count:Infinity,materialIndex:0}];
    for(const group of groups) {
      const material=materials[group.materialIndex];if(!material?.visible)continue;
      const start=Math.max(geometry.drawRange.start,group.start),end=Math.min(geometry.drawRange.start+geometry.drawRange.count,group.start+group.count,geometry.index?.count??geometry.attributes.position.count);
      const count=Math.max(0,end-start)*(object.isInstancedMesh?object.count:1);if(!count)continue;
      const doublePass=!shadowFrustum&&material.transparent&&material.side===THREE.DoubleSide&&!material.forceSinglePass?2:1;
      calls+=doublePass;if(object.isPoints)points+=count;else triangles+=count/3*doublePass;
    }
    objects.push(object.id);
  });
  return {name,calls,triangles,points,objects,nearPlane:frustum.planes[5].toArray?frustum.planes[5].toArray():[...frustum.planes[5].normal.toArray(),frustum.planes[5].constant]};
}
function summarize(passes){return Object.fromEntries(passes.map(({name,calls,triangles,points})=>[name,{calls,triangles,points}]));}
const views={overview:[[19,16,32],[.2,1.7,5.4]],architecture:[[8.5,10.1,11],[0,5.25,0]],inside:[[3.5,3.15,7.2],[0,2.5,.1]],blossom:[[-11,6.1,8.4],[-3,3.4,-.3]],garden:[[11,6.8,23],[1,2.3,6.5]],moonGate:[[10.65,3.42,24.5],[4.7,1.68,16.3]],tea:[[.45,2.35,.58],[-.66,1.52,-.7]],fish:[[10.8,5.8,12.4],[7.2,-.8,5.3]]};
const submissionComparison=[];let minimumClipSeparation=Infinity;
for(const mobile of [false,true]) {
  const school=createFishSchool({mobile,workerEnabled:false});scene.add(school.root);lake.setSubmergedObjects([school.root]);
  for(const theme of ['sunset','moonlight']) {
    sky.visible=theme==='sunset';moon.visible=stars.visible=!sky.visible;applyLighting(theme,{sun,fill,hemisphere,lamps,scene,lanternMaterial:model.lanternMaterial});
    school.setTheme(theme==='moonlight');scene.updateMatrixWorld(true);sun.shadow.updateMatrices(sun);
    for(const [view,[position,target]] of Object.entries(views)) {
      const width=mobile?390:1440,height=mobile?844:900,camera=new THREE.PerspectiveCamera(39,width/height,.1,800);enableMainSceneLayers(camera);
      const aim=new THREE.Vector3(...target);camera.position.set(...position);
      if(mobile){if(view==='overview'){camera.position.set(11,19,48);aim.set(1,2,5.8);}else if(view==='fish')camera.position.set(10.7,6.8,12);else camera.position.sub(aim).multiplyScalar(1.65).add(aim);}
      camera.lookAt(aim);if(view!=='fish')camera.setViewOffset(width,height,mobile?0:-width*.1,mobile?-height*.045:0,width,height);camera.updateMatrixWorld();school.update(0,camera);scene.updateMatrixWorld(true);
      function sample(optimized){
        if(optimized)partition.apply();else partition.restore();passes=[];
        lake.water.onBeforeRender(renderer,scene,camera);
        passes.push(countPass(camera,'main'),countPass(camera,'shadows',sun.shadow.getFrustum()));return passes;
      }
      const baseline=sample(false),optimized=sample(true);
      assert.deepEqual(optimized.find(p=>p.name==='main').objects,baseline.find(p=>p.name==='main').objects);
      assert.deepEqual(optimized.find(p=>p.name==='shadows').objects,baseline.find(p=>p.name==='shadows').objects);
      for(const pass of optimized.filter(p=>p.name==='reflection'||p.name==='refraction')){
        const previous=baseline.find(p=>p.name===pass.name),removed=previous.objects.filter(id=>!pass.objects.includes(id));
        assert.ok(pass.objects.every(id=>previous.objects.includes(id)));
        for(const id of removed){
          const record=recordById.get(id);assert.ok(record?.range);const [nx,ny,nz,c]=pass.nearPlane;
          assert.ok(Math.abs(nx)<1e-9&&Math.abs(nz)<1e-9,'water clipping plane must be horizontal');
          const nearestDistance=(ny>0?record.range.max:record.range.min)*ny+c;
          assert.ok(nearestDistance<-.02+1e-8,`${record.object.name} contributes to ${pass.name}`);minimumClipSeparation=Math.min(minimumClipSeparation,-nearestDistance);
        }
      }
      const oldTriangles=baseline.reduce((n,p)=>n+p.triangles,0),newTriangles=optimized.reduce((n,p)=>n+p.triangles,0);
      submissionComparison.push({mobile,theme,view,fish:school.stats().near+school.stats().far,baseline:summarize(baseline),optimized:summarize(optimized),
        triangleReduction:oldTriangles-newTriangles,triangleReductionPercent:100*(oldTriangles-newTriangles)/oldTriangles});
    }
  }
  scene.remove(school.root);school.dispose();
}
const report={revision:11,baselineRevision:10,scope:'CPU submission counts using Three.js virtual cameras, clipping frusta, layers and draw ranges; includes main, water and directional shadows. No GPU or FPS measurement.',
  geometry:model.root.userData.geometryMetrics,partition:partition.stats(),sceneMatrixTraversals:{baseline:3,optimized:1},displayComparison,unchangedSources,
  submissionPose:{modelTimeSeconds:baselineArg?8.6:null,fishTimeSeconds:0},minimumClipSeparation,submissionComparison,browserMeasured:false,glbExported:false};
await writeFile(resolve(root,'docs/PERFORMANCE_AUDIT_V11.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({geometry:report.geometry,partition:report.partition,displaySamples:displayComparison.length,minimumClipSeparation,views:submissionComparison.length,
  overview:submissionComparison.filter(item=>item.theme==='sunset'&&item.view==='overview'),file:'docs/PERFORMANCE_AUDIT_V11.json'},null,2));
