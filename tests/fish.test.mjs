import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import * as THREE from 'three';
import { FishSimulation, FIXED_STEP } from '../src/fish-simulation.js';
import { createFishGeometry, deformFishPoint } from '../src/fish-geometry.js';
import { createFishSchool } from '../src/fish-school.js';
import { createLake } from '../src/lake.js';

test('120 fish remain separate and underwater for two simulated minutes',()=>{
  const sim=new FishSimulation();let minimum=Infinity,maxMove=0;
  for(let step=0;step<7200;step++) {
    sim.step();const report=sim.audit();minimum=Math.min(minimum,report.minimumGap);
    assert.ok(report.minimumGap>=-.00001,`body overlap at step ${step}`);
    assert.ok(report.minimumShore>0&&report.minimumSurface>0&&report.minimumBottom>0,`habitat penetration at ${step}`);
    assert.ok(report.maxSpeed<.75);
    for(let i=0;i<sim.count;i++)maxMove=Math.max(maxMove,Math.hypot(sim.x[i]-sim.px[i],sim.y[i]-sim.py[i],sim.z[i]-sim.pz[i]));
  }
  assert.ok(maxMove<.025,'no position jumps during normal swimming');
  assert.ok(minimum>.005,'retain a visible safety margin beyond the enclosing sphere');
});

test('head-on fish turn or slow before crossing; coincident recovery is finite',()=>{
  const sim=new FishSimulation({count:2});
  sim.x.set([8,10]);sim.z.set([0,0]);sim.y.set([-.95,-.95]);sim.yaw.set([0,Math.PI]);
  sim.vx.set([.45,-.45]);sim.vz.fill(0);sim.goalX.set([13,7.8]);sim.goalZ.fill(0);sim.goalTime.fill(999);
  for(let i=0;i<1200;i++){sim.step();assert.ok(sim.audit().minimumGap>-.00001);}
  sim.x.fill(9);sim.y.fill(-1);sim.z.fill(0);sim.vx.fill(0);sim.vz.fill(0);sim.step();
  assert.ok(sim.audit().minimumGap>0);assert.ok(sim.writeSnapshot().every(Number.isFinite));
});

test('fixed-step trajectories match across frame rates and long pauses stay bounded',()=>{
  const a=new FishSimulation({count:24}),b=new FishSimulation({count:24});
  for(let i=0;i<180;i++)a.advance(1/30);
  for(let i=0;i<864;i++)b.advance(1/144);
  assert.equal(a.steps,b.steps);assert.deepEqual(a.writeSnapshot(),b.writeSnapshot());
  const before=a.steps;a.advance(30);assert.equal(a.steps-before,4);assert.ok(a.diagnostics.droppedTime>29);
});

test('both fish detail levels have valid surfaces, outward bodies and safe animated bounds',()=>{
  const out=new Float64Array(3);
  for(const detail of ['high','low']) {
    const g=createFishGeometry(detail),p=g.attributes.position,n=g.attributes.normal,part=g.attributes.fishPart;
    assert.ok(g.userData.triangles<(detail==='high'?5000:1800));
    let bodyVolume=0;
    for(let i=0;i<g.index.count;i+=3) {
      const ids=[0,1,2].map(j=>g.index.getX(i+j)),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j));
      assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-19,`degenerate triangle ${i} in ${detail}`);
      if(part.getX(ids[0])===0)bodyVolume+=a.dot(b.clone().cross(c))/6;
    }
    assert.ok(bodyVolume>0,'body normals point outwards');
    for(let i=0;i<p.count;i++) {
      assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);
      for(let phase=0;phase<Math.PI*2;phase+=Math.PI/4)for(const turn of [-1.05,1.05]) {
        deformFishPoint(p.getX(i),p.getY(i),p.getZ(i),part.getX(i),phase,.6,turn,out);
        assert.ok(Math.hypot(out[0],out[1]*1.08,out[2]*1.10)<.68,'every fin and tail stays within its collision envelope');
      }
    }
    g.dispose();
  }
});

test('worker transfer recycling never detaches a snapshot still used for rendering',async()=>{
  const previousWorker=globalThis.Worker;
  class BrowserWorker {
    constructor(url){this.worker=new NodeWorker(new URL('./fixtures/fish-worker-host.mjs',import.meta.url),{workerData:{moduleURL:url.href}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
    postMessage(data,transfer){this.worker.postMessage(data,transfer);}
    terminate(){this.worker.terminate();}
  }
  globalThis.Worker=BrowserWorker;
  const school=createFishSchool({count:24}),camera=new THREE.PerspectiveCamera();camera.position.set(9,5,10);
  try {
    for(let frame=0;frame<100;frame++) {
      school.update(FIXED_STEP,camera);
      for(const mesh of school.root.children)assert.ok(mesh.instanceMatrix.array.slice(0,mesh.count*16).every(Number.isFinite));
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    const stats=school.stats();assert.equal(stats.worker,true);assert.ok(stats.steps>30);assert.equal(stats.near+stats.far,24);assert.ok(stats.drawCalls<=4,'two LODs, each with opaque skin and translucent fins');
  } finally {school.dispose();globalThis.Worker=previousWorker;}
});

test('fish render only in refraction and nested pass state recovers after errors',async()=>{
  const load=THREE.TextureLoader.prototype.loadAsync,globals=['innerWidth','innerHeight','devicePixelRatio'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
  THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();
  globalThis.innerWidth=1280;globalThis.innerHeight=800;globalThis.devicePixelRatio=1;
  try {
    let target=null,fail=false;const visits=[],fish=new THREE.Group();
    const renderer={capabilities:{getMaxAnisotropy:()=>4},getRenderTarget:()=>target,setRenderTarget:value=>{target=value;},xr:{enabled:true},shadowMap:{autoUpdate:true},state:{buffers:{depth:{setMask(){}}}},render(scene,camera){const fishIncluded=fish.visible&&fish.layers.test(camera.layers);visits.push({fish:fishIncluded,refraction:camera.userData.refractor===true});if(fail&&fishIncluded)throw new Error('simulated draw failure');}};
    const lake=await createLake({renderer,mobile:false,reducedMotion:false,sun:new THREE.DirectionalLight()});
    lake.setSubmergedObjects([fish]);assert.equal(fish.visible,true);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(9,6,12);camera.lookAt(4,-1,7);camera.updateMatrixWorld();lake.water.updateMatrixWorld();
    lake.water.onBeforeRender(renderer,scene,camera);
    assert.deepEqual(visits,[{fish:false,refraction:false},{fish:true,refraction:true}]);
    assert.equal(fish.visible,true);assert.equal(lake.water.visible,true);assert.equal(target,null);
    fail=true;assert.throws(()=>lake.water.onBeforeRender(renderer,scene,camera),/draw failure/);
    assert.equal(fish.visible,true);assert.equal(lake.water.visible,true);assert.equal(target,null);assert.equal(renderer.xr.enabled,true);assert.equal(renderer.shadowMap.autoUpdate,true);
  } finally {
    THREE.TextureLoader.prototype.loadAsync=load;
    for(const [key,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
