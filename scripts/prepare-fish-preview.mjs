// Native rendering diagnostics. Produces small shader/vertex buffers, never GLB.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { WebGLProgram } from 'three/src/renderers/webgl/WebGLProgram.js';
import { createFishSchool } from '../src/fish-school.js';
import { createLakebed } from '../src/lake.js';
import { createMeadowMaterial } from '../src/meadow-rendering.js';

const args=process.argv.slice(2),shadersOnly=args.includes('--shaders-only');
const output=path.resolve(args.find(arg=>!arg.startsWith('--'))??'../fish-preview-work');await mkdir(output,{recursive:true});
function shaders(material,{production=false,water=false,vertexColors=false,instanced,instancedColors=false,vertexShader,fragmentShader}={}) {
  const shader={uniforms:{},vertexShader:vertexShader??THREE.ShaderLib.physical.vertexShader,fragmentShader:fragmentShader??THREE.ShaderLib.physical.fragmentShader};
  material?.onBeforeCompile(shader,{});
  const gl={VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,createProgram:()=>({}),createShader:type=>({type}),shaderSource:(s,source)=>{s.source=source;},compileShader(){},attachShader(){},linkProgram(){},bindAttribLocation(){}};
  const parameters={vertexShader:shader.vertexShader,fragmentShader:shader.fragmentShader,shaderType:water?'ShaderMaterial':'MeshPhysicalMaterial',shaderName:'FishDiagnostic',defines:water?{}:{STANDARD:'',PHYSICAL:''},precision:'highp',instancing:instanced??(!water&&!vertexColors),instancingColor:instancedColors,doubleSided:material?.side===THREE.DoubleSide,clearcoat:material?.clearcoat>0,opaque:!material?.transparent,vertexColors,
    envMap:production,envMapMode:THREE.CubeUVReflectionMapping,envMapCubeUVHeight:256,combine:THREE.MultiplyOperation,
    shadowMapEnabled:production,shadowMapType:THREE.PCFSoftShadowMap,useFog:production,fog:production,fogExp2:false,
    numDirLights:water?0:2,numPointLights:production?6:0,numHemiLights:water?0:1,numSpotLights:0,numSpotLightMaps:0,numSpotLightShadows:0,numSpotLightShadowsWithMaps:0,numDirLightShadows:production?1:0,numPointLightShadows:0,numRectAreaLights:0,numLightProbes:0,numClippingPlanes:0,numClipIntersection:0,
    toneMapping:water?THREE.ACESFilmicToneMapping:THREE.NoToneMapping,outputColorSpace:water?THREE.SRGBColorSpace:THREE.LinearSRGBColorSpace,rendererExtensionParallelShaderCompile:false};
  const program=new WebGLProgram({getContext:()=>gl},'fish-diagnostic',parameters,{});
  return {vertex:program.vertexShader.source,fragment:program.fragmentShader.source};
}
async function saveShader(name,shader){await writeFile(path.join(output,name+'.vert'),shader.vertex);await writeFile(path.join(output,name+'.frag'),shader.fragment);}
async function saveGeometry(name,g){
  const attrs={};for(const [key,attribute]of Object.entries(g.attributes)){
    if(attribute.isInstancedBufferAttribute)continue;
    const array=new Float32Array(attribute.array);await writeFile(path.join(output,`${name}-${key}.bin`),Buffer.from(array.buffer));attrs[key]={size:attribute.itemSize,count:attribute.count};
  }
  const index=new Uint32Array(g.index.array);await writeFile(path.join(output,`${name}-index.bin`),Buffer.from(index.buffer));return {attrs,indices:index.length,groups:g.groups};
}
const camera=new THREE.PerspectiveCamera(39,1440/900,.1,200);camera.position.set(9.1,6.8,13.6);camera.lookAt(4.4,-.65,7.2);camera.updateMatrixWorld();
const school=createFishSchool({workerEnabled:false,count:120});school.update(0,camera);
const [skin,fins]=school.root.children[0].material;
await saveShader('fish',shaders(skin));await saveShader('fish-production',shaders(skin,{production:true}));
await saveShader('fish-fins',shaders(fins));await saveShader('fish-fins-production',shaders(fins,{production:true}));
const bed=createLakebed();await saveShader('bed',shaders(null,{vertexColors:true}));
const lakeSource=await readFile(new URL('../src/lake.js',import.meta.url),'utf8');
const vs=lakeSource.match(/const vertexShader = \/\* glsl \*\/`([\s\S]*?)`;/)[1],fs=lakeSource.match(/const fragmentShader = \/\* glsl \*\/`([\s\S]*?)`;/)[1];
await saveShader('water',shaders(null,{water:true,vertexShader:vs,fragmentShader:fs}));
const meadow = createMeadowMaterial();
await saveShader('meadow', shaders(meadow.material, { vertexColors: true, instanced: true, instancedColors: true }));
await saveShader('meadow-production', shaders(meadow.material, { production: true, vertexColors: true, instanced: true, instancedColors: true }));
meadow.material.dispose();
if(shadersOnly) {
  school.dispose();bed.geometry.dispose();bed.material.dispose();
  console.log(JSON.stringify({output,shaderPrograms:8,glbExported:false,framesGenerated:0}));
  process.exit(0);
}
const water=new THREE.PlaneGeometry(80,80,80,80);water.rotateX(-Math.PI/2);water.translate(0,-.15,0);
const geometries={high:await saveGeometry('high',school.root.children[0].geometry),low:await saveGeometry('low',school.root.children[1].geometry),bed:await saveGeometry('bed',bed.geometry),water:await saveGeometry('water',water)};
const frames=[],fps=24,frameCount=192;
for(let frame=0;frame<frameCount;frame++) {
  school.update(1/fps,camera);
  const record={time:(frame+1)/fps,levels:[]};
  for(const [level,mesh]of school.root.children.entries()) {
    const packed=new Float32Array(mesh.count*24),mat=mesh.instanceMatrix.array,motion=mesh.geometry.attributes.fishMotion.array,appearance=mesh.geometry.attributes.fishAppearance.array;
    for(let i=0;i<mesh.count;i++){packed.set(mat.subarray(i*16,i*16+16),i*24);packed.set(motion.subarray(i*4,i*4+4),i*24+16);packed.set(appearance.subarray(i*4,i*4+4),i*24+20);}
    const filename=`frame-${frame}-${level}.bin`;await writeFile(path.join(output,filename),Buffer.from(packed.buffer));record.levels.push({file:filename,count:mesh.count});
  }
  frames.push(record);
}
const metadata={width:1440,height:900,fps,frameCount,camera:camera.position.toArray(),view:camera.matrixWorldInverse.toArray(),projection:camera.projectionMatrix.toArray(),inverseProjection:camera.projectionMatrixInverse.toArray(),cameraWorld:camera.matrixWorld.toArray(),geometries,frames,stats:school.stats()};
await writeFile(path.join(output,'scene.json'),JSON.stringify(metadata));school.dispose();
console.log(JSON.stringify({output,frameCount,stats:metadata.stats,glbExported:false}));
