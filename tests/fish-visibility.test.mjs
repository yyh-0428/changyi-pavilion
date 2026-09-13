import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFishSchool } from '../src/fish-school.js';
import { createLake } from '../src/lake.js';

function setGlobal(t,name,value) {
  const before=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  t.after(()=>{if(before)Object.defineProperty(globalThis,name,before);else delete globalThis[name];});
}

test('fish are populated on the first frame even when the worker never replies',t=>{
  let now=0,terminated=false;
  t.mock.method(performance,'now',()=>now);
  setGlobal(t,'Worker',class {
    postMessage(){}
    terminate(){terminated=true;}
  });
  const school=createFishSchool({count:24}),camera=new THREE.PerspectiveCamera();
  camera.position.set(9,5,10);
  try {
    school.update(0,camera);
    assert.equal(school.stats().near+school.stats().far,24,'a slow worker must not leave an empty pond');
    now=2100;school.update(0,camera);
    assert.equal(terminated,true,'an unresponsive worker is replaced even with reduced motion');
    school.update(1/30,camera);
    assert.equal(school.stats().worker,false);
    assert.ok(school.stats().steps>0,'fish continue swimming locally');
    assert.equal(school.stats().near+school.stats().far,24);
  } finally {school.dispose();}
});

test('fish remain renderable during worker decoding errors and postMessage failures',t=>{
  let worker,failPost=false;
  setGlobal(t,'Worker',class {
    constructor(){worker=this;}
    postMessage(){if(failPost)throw new Error('worker channel closed');}
    terminate(){}
  });
  const camera=new THREE.PerspectiveCamera();
  for(const failure of ['messageerror','postMessage']) {
    const school=createFishSchool({count:24});
    try {
      school.update(0,camera);
      if(failure==='messageerror')worker.onmessageerror?.({});
      else {
        worker.onmessage({data:{time:0,buffer:new Float32Array(24*12).buffer,stepMs:0,steps:0}});
        failPost=true;
      }
      school.update(1/30,camera);school.update(1/30,camera);
      assert.equal(school.stats().worker,false,failure);
      assert.equal(school.stats().near+school.stats().far,24);
      for(const mesh of school.root.children)assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));
    } finally {school.dispose();failPost=false;}
  }
});

test('the real refraction camera includes fish while overview and reflection exclude them',async t=>{
  t.mock.method(THREE.TextureLoader.prototype,'loadAsync',async()=>new THREE.Texture());
  for(const [key,value] of Object.entries({innerWidth:1440,innerHeight:900,devicePixelRatio:1}))setGlobal(t,key,value);
  let target=null;const passes=[];
  const renderer={capabilities:{getMaxAnisotropy:()=>4},getRenderTarget:()=>target,setRenderTarget:value=>{target=value;},xr:{enabled:false},shadowMap:{autoUpdate:true},state:{buffers:{depth:{setMask(){}}}},render(scene,camera){
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const fish=[];scene.traverseVisible(object=>{if(object.isInstancedMesh&&object.layers.test(camera.layers)&&frustum.intersectsObject(object))fish.push(object);});
    passes.push({refraction:camera.userData.refractor===true,count:fish.reduce((n,mesh)=>n+mesh.count,0)});
  }};
  const lake=await createLake({renderer,mobile:false,reducedMotion:false,sun:new THREE.DirectionalLight()});
  const scene=new THREE.Scene(),school=createFishSchool({workerEnabled:false}),camera=new THREE.PerspectiveCamera(39,1440/900,.1,800);
  camera.position.set(9.1,6.8,13.6);camera.lookAt(4.4,-.65,7.2);camera.setViewOffset(1440,900,-144,0,1440,900);camera.updateMatrixWorld();
  school.update(0,camera);scene.add(lake.water,school.root);lake.setSubmergedObjects([school.root]);scene.updateMatrixWorld(true);
  try {
    lake.water.onBeforeRender(renderer,scene,camera);
    assert.deepEqual(passes,[{refraction:false,count:0},{refraction:true,count:120}]);
    renderer.render(scene,camera);assert.equal(passes.at(-1).count,0,'fish are not drawn twice');
  } finally {school.dispose();}
});
