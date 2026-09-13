import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RENDER_LAYERS,enableMainSceneLayers,partitionWaterPasses,renderFrame,worldHeightRange } from '../src/render-pipeline.js';
import { createLake } from '../src/lake.js';

function cube(y,height=.2) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,height,.2),new THREE.MeshStandardMaterial());
  mesh.position.y=y;return mesh;
}
function setGlobal(t,name,value) {
  const before=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  t.after(()=>{if(before)Object.defineProperty(globalThis,name,before);else delete globalThis[name];});
}
async function lakeFixture(t) {
  t.mock.method(THREE.TextureLoader.prototype,'loadAsync',async()=>new THREE.Texture());
  for(const [key,value] of Object.entries({innerWidth:1440,innerHeight:900,devicePixelRatio:1}))setGlobal(t,key,value);
  let target=null;
  const renderer={capabilities:{getMaxAnisotropy:()=>4},getRenderTarget:()=>target,setRenderTarget:value=>{target=value;},xr:{enabled:false},shadowMap:{autoUpdate:true},state:{buffers:{depth:{setMask(){}}}},render(){}};
  const lake=await createLake({renderer,mobile:false,reducedMotion:false,sun:new THREE.DirectionalLight()});
  return {lake,renderer};
}

test('only complete, static objects beyond the water clip guard change passes',()=>{
  const root=new THREE.Group(),above=cube(1),below=cube(-1),crossing=cube(-.15),guard=cube(-.13,.01);
  const moving=new THREE.Group(),movingChild=cube(2);moving.userData.dynamic=true;moving.add(movingChild);
  const deformed=cube(2);deformed.userData.deformingGeometry=true;
  const displaced=cube(2);displaced.material.displacementMap=new THREE.Texture();
  const morphed=cube(2);morphed.geometry.morphAttributes.position=[morphed.geometry.attributes.position.clone()];
  const fish=cube(-1);fish.layers.set(RENDER_LAYERS.fish);
  root.add(above,below,crossing,guard,moving,deformed,displaced,morphed,fish);root.updateMatrixWorld(true);
  const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const before=meshes.map(o=>({geometry:o.geometry,material:o.material,matrix:[...o.matrixWorld.elements],visible:o.visible,cast:o.castShadow,receive:o.receiveShadow}));
  const partition=partitionWaterPasses([root]);
  assert.equal(above.layers.mask,1<<RENDER_LAYERS.aboveWater);assert.equal(below.layers.mask,1<<RENDER_LAYERS.belowWater);
  for(const object of [crossing,guard,movingChild,deformed,displaced,morphed])assert.equal(object.layers.mask,1);
  assert.equal(fish.layers.mask,1<<RENDER_LAYERS.fish);
  const camera=new THREE.PerspectiveCamera();enableMainSceneLayers(camera);
  for(const object of meshes)assert.equal(object.layers.test(camera.layers),object!==fish,'main view retains every original object');
  assert.deepEqual(meshes.map(o=>({geometry:o.geometry,material:o.material,matrix:[...o.matrixWorld.elements],visible:o.visible,cast:o.castShadow,receive:o.receiveShadow})),before);
  partition.restore();for(const object of meshes.filter(o=>o!==fish))assert.equal(object.layers.mask,1);
  partition.apply();assert.equal(above.layers.mask,4);
});

test('wind interval contains all vertices of rotated and scaled instances at every extreme',()=>{
  const root=new THREE.Group();root.rotation.set(.21,.64,-.28);root.scale.set(1.1,.9,1.6);root.position.set(2,.4,-3);
  const grass=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.3,.08),new THREE.MeshStandardMaterial(),3);
  grass.userData.renderMotionMargin={x:.026,y:0,z:.013};root.add(grass);
  const dummy=new THREE.Object3D();
  for(let i=0;i<3;i++){
    dummy.position.set(i,-.2+i*.17,i*.3);dummy.rotation.set(.1*i,.72*i,-.23*i);dummy.scale.set(.8+i*.12,.6+i*.3,1.4-i*.2);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);
  }
  root.updateMatrixWorld(true);
  const range=worldHeightRange(grass),local=new THREE.Matrix4(),world=new THREE.Matrix4(),p=grass.geometry.attributes.position;
  for(let i=0;i<grass.count;i++){
    grass.getMatrixAt(i,local);world.multiplyMatrices(grass.matrixWorld,local);
    for(let j=0;j<p.count;j++)for(const x of [-.026,.026])for(const z of [-.013,.013]){
      const point=new THREE.Vector3(p.getX(j)+x,p.getY(j),p.getZ(j)+z).applyMatrix4(world);
      assert.ok(point.y>=range.min-1e-8&&point.y<=range.max+1e-8);
    }
  }
});

test('main and both real water cameras keep their visible side and the fish layer',async t=>{
  const {lake,renderer}=await lakeFixture(t),scene=new THREE.Scene(),root=new THREE.Group();
  const above=cube(1),below=cube(-1),crossing=cube(-.15),fish=cube(-1);
  root.add(above,below,crossing);scene.add(root,fish,lake.water);lake.setSubmergedObjects([fish]);partitionWaterPasses([root]);
  const camera=new THREE.PerspectiveCamera(39,1.6,.1,800);enableMainSceneLayers(camera);camera.position.set(4,5,8);camera.lookAt(0,0,0);camera.updateMatrixWorld();scene.updateMatrixWorld(true);
  const passes=[];
  renderer.render=(scene,view)=>passes.push({refraction:view.userData.refractor===true,objects:[above,below,crossing,fish].map(o=>o.layers.test(view.layers))});
  lake.water.onBeforeRender(renderer,scene,camera);
  assert.deepEqual(passes,[{refraction:false,objects:[true,false,true,false]},{refraction:true,objects:[false,true,true,true]}]);
  assert.deepEqual([above,below,crossing,fish].map(o=>o.layers.test(camera.layers)),[true,true,true,false]);
  assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(lake.water.visible,true);
});

test('three render passes share one matrix traversal with identical animated transforms',()=>{
  const scene=new THREE.Scene(),parent=new THREE.Group(),child=cube(1),light=new THREE.PointLight();
  parent.add(child);scene.add(parent,light);
  let updates=0;const original=scene.updateMatrixWorld;
  scene.updateMatrixWorld=function(...args){updates++;return original.apply(this,args);};
  function capture(usePipeline){
    updates=0;parent.position.set(.4,.7,-.2);parent.rotation.z=.018;light.position.set(3,2,1);let nesting=0;const matrices=[];
    const renderer={render(scene,camera){
      if(scene.matrixWorldAutoUpdate)scene.updateMatrixWorld();
      matrices.push([[...child.matrixWorld.elements],[...light.matrixWorld.elements]]);
      if(!nesting){nesting++;this.render(scene,camera);this.render(scene,camera);nesting--;}
    }};
    if(usePipeline)renderFrame(renderer,scene,new THREE.PerspectiveCamera());else renderer.render(scene,new THREE.PerspectiveCamera());
    return {updates,matrices};
  }
  const baseline=capture(false),optimized=capture(true);
  assert.equal(baseline.updates,3);assert.equal(optimized.updates,1);assert.deepEqual(optimized.matrices,baseline.matrices);
  assert.equal(scene.matrixWorldAutoUpdate,true);
  assert.throws(()=>renderFrame({render(){throw new Error('draw failed');}},scene,{}));assert.equal(scene.matrixWorldAutoUpdate,true);
  scene.matrixWorldAutoUpdate=false;updates=0;renderFrame({render(){}},scene,{});assert.equal(updates,0);assert.equal(scene.matrixWorldAutoUpdate,false);
});

test('HDR precompile includes the fish camera and restores the active target on errors',async t=>{
  const {lake,renderer}=await lakeFixture(t),scene=new THREE.Scene(),screenTarget={name:'previous target'};
  renderer.setRenderTarget(screenTarget);let compiled=0;
  renderer.compileAsync=async (source,camera)=>{
    compiled++;assert.equal(source,scene);assert.equal(camera.layers.isEnabled(RENDER_LAYERS.fish),true);
    assert.equal(renderer.getRenderTarget().texture.type,THREE.HalfFloatType);
  };
  await lake.prepare(renderer,scene);assert.equal(compiled,1);assert.equal(renderer.getRenderTarget(),screenTarget);
  renderer.compileAsync=async()=>{throw new Error('compile failed');};
  await assert.rejects(lake.prepare(renderer,scene),/compile failed/);assert.equal(renderer.getRenderTarget(),screenTarget);
});
