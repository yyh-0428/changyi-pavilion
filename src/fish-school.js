import * as THREE from 'three';
import { createFishGeometry } from './fish-geometry.js';
import { createFishMaterial } from './fish-material.js';
import { FISH_STRIDE, FIXED_STEP, FishSimulation } from './fish-simulation.js';

const clamp=THREE.MathUtils.clamp;
const wrappedLerp=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;

export function createFishSchool({mobile=false,workerEnabled=true,count=mobile?96:120}={}) {
  const root=new THREE.Group();root.name='锦鳞·自由游动鱼群';
  root.userData={dynamic:true,fishCount:count,physics:'fixed-step predictive steering with conservative non-penetration constraints'};
  const {material,finMaterial,uniforms}=createFishMaterial();
  const levels=['high','low'].map(detail=>{
    const geometry=createFishGeometry(detail);
    geometry.setAttribute('fishMotion',new THREE.InstancedBufferAttribute(new Float32Array(count*4),4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('fishAppearance',new THREE.InstancedBufferAttribute(new Float32Array(count*4),4).setUsage(THREE.DynamicDrawUsage));
    const mesh=new THREE.InstancedMesh(geometry,[material,finMaterial],count);mesh.name=`锦鲤·${detail==='high'?'近景':'远景'}批次`;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count=0;mesh.castShadow=false;mesh.receiveShadow=true;
    // Bounding volume encloses the swimming habitat and every deformed tail.
    mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,-1,0),25);
    root.add(mesh);return mesh;
  });
  const lod=new Uint8Array(count);lod.fill(1);
  let worker=null,fallback=null,busy=false,pendingDelta=0,localTime=0,previous=null,current=null,recycle=null,disposed=false,requestStarted=0;
  let stepMs=0,maxStepMs=0,steps=0;
  function accept(data) {
    if(disposed)return;
    busy=false;stepMs=data.stepMs;maxStepMs=Math.max(maxStepMs,stepMs);steps=data.steps;
    if(current&&data.time<=current.time){recycle=data.buffer;return;}
    const unused=previous&&previous!==current?previous.values.buffer:null;
    if(!current){localTime=data.time;pendingDelta=0;}
    else if(localTime-data.time>.10)localTime=data.time+FIXED_STEP;
    previous=current;current={time:data.time,values:new Float32Array(data.buffer)};
    if(unused)recycle=unused;
    if(!previous)previous=current;
  }
  function useFallback() {
    if(disposed)return;
    worker?.terminate();worker=null;busy=false;
    fallback=new FishSimulation({count});
    // A worker failure retains the last positions, velocities and gait as closely
    // as possible, so recovery does not respawn the fish in a different patch.
    if(current) {
      for(let i=0;i<count;i++) {
        const at=i*FISH_STRIDE,s=current.values;
        fallback.x[i]=s[at];fallback.y[i]=s[at+1];fallback.z[i]=s[at+2];fallback.yaw[i]=s[at+3];fallback.pitch[i]=s[at+4];fallback.phase[i]=s[at+5];fallback.turn[i]=s[at+7];
        fallback.vx[i]=Math.cos(s[at+3])*s[at+6];fallback.vz[i]=Math.sin(s[at+3])*s[at+6];
      }
      fallback.time=current.time;
    } else accept({time:0,buffer:fallback.writeSnapshot().buffer,stepMs:0,steps:0});
    pendingDelta=0;
  }
  function send(message,transfer=[]) {
    busy=true;requestStarted=performance.now();
    try {worker.postMessage(message,transfer);}
    catch {useFallback();}
  }
  // A complete first snapshot is cheap to seed and must not depend on a worker
  // script loading successfully. Even reduced-motion visitors see fish at once.
  useFallback();
  if(workerEnabled&&typeof Worker!=='undefined') {
    try {
      const activeWorker=new Worker(new URL('./fish-worker.js',import.meta.url),{type:'module'});
      worker=activeWorker;fallback=null;
      worker.onmessage=event=>{if(worker===activeWorker)accept(event.data);};
      worker.onerror=worker.onmessageerror=()=>{if(worker===activeWorker)useFallback();};
      send({type:'init',options:{count}});
    } catch {useFallback();}
  }

  function update(delta,camera) {
    if(disposed)return;
    // Check wall time, not animation time: also recovers when motion is paused.
    if(worker&&busy&&performance.now()-requestStarted>2000)useFallback();
    localTime+=delta;pendingDelta=Math.min(pendingDelta+delta,4*FIXED_STEP);
    if(worker&&!busy&&pendingDelta>=FIXED_STEP) {
      const message={type:'step',delta:pendingDelta,buffer:recycle};const transfer=recycle?[recycle]:[];
      recycle=null;pendingDelta=0;send(message,transfer);
    } else if(fallback&&pendingDelta>=FIXED_STEP) {
      const start=performance.now();fallback.advance(pendingDelta);pendingDelta=0;
      const data=fallback.writeSnapshot(recycle);recycle=null;
      accept({time:fallback.time,buffer:data.buffer,stepMs:performance.now()-start,steps:fallback.steps});
    }
    if(!current)return;
    const a=previous.values,b=current.values;
    const interval=current.time-previous.time;
    // Interpolate physics snapshots; never extrapolate through a collision wall.
    const alpha=interval>1e-8?clamp((localTime-FIXED_STEP-previous.time)/interval,0,1):1;
    levels.forEach(mesh=>{mesh.count=0;});
    for(let i=0;i<count;i++) {
      const at=i*FISH_STRIDE,x=THREE.MathUtils.lerp(a[at],b[at],alpha),y=THREE.MathUtils.lerp(a[at+1],b[at+1],alpha),z=THREE.MathUtils.lerp(a[at+2],b[at+2],alpha);
      const yaw=wrappedLerp(a[at+3],b[at+3],alpha),pitch=THREE.MathUtils.lerp(a[at+4],b[at+4],alpha),phase=wrappedLerp(a[at+5],b[at+5],alpha),speed=THREE.MathUtils.lerp(a[at+6],b[at+6],alpha),turn=THREE.MathUtils.lerp(a[at+7],b[at+7],alpha);
      const distance=Math.hypot(camera.position.x-x,camera.position.y-y,camera.position.z-z);
      // Hysteresis prevents detail from flickering at a distance boundary.
      if(lod[i]===1&&distance<10.5)lod[i]=0;else if(lod[i]===0&&distance>12.5)lod[i]=1;
      const mesh=levels[lod[i]],slot=mesh.count++,matrix=mesh.instanceMatrix.array,offset=slot*16;
      const scale=b[at+8],width=b[at+9],height=b[at+10],cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
      const bank=clamp(-turn*.075,-.085,.085),cb=Math.cos(bank),sb=Math.sin(bank);
      // +X is forward. The basis remains orthonormal before individual shape scaling.
      const ux=-cy*sp,uy=cp,uz=-sy*sp,sx=-sy,sz=cy;
      matrix[offset]=cy*cp*scale;matrix[offset+1]=sp*scale;matrix[offset+2]=sy*cp*scale;matrix[offset+3]=0;
      matrix[offset+4]=(ux*cb+sx*sb)*scale*height;matrix[offset+5]=uy*cb*scale*height;matrix[offset+6]=(uz*cb+sz*sb)*scale*height;matrix[offset+7]=0;
      matrix[offset+8]=(sx*cb-ux*sb)*scale*width;matrix[offset+9]=-uy*sb*scale*width;matrix[offset+10]=(sz*cb-uz*sb)*scale*width;matrix[offset+11]=0;
      matrix[offset+12]=x;matrix[offset+13]=y;matrix[offset+14]=z;matrix[offset+15]=1;
      const motion=mesh.geometry.attributes.fishMotion.array,appearance=mesh.geometry.attributes.fishAppearance.array,base=slot*4;
      motion[base]=phase;motion[base+1]=speed;motion[base+2]=turn;motion[base+3]=0;
      appearance[base]=i*17.731+9.2;appearance[base+1]=i%10<6?0:i%10<9?1:2;appearance[base+2]=(i*37%101)/101;appearance[base+3]=0;
    }
    for(const mesh of levels) {
      if(mesh.count)for(const attribute of [mesh.instanceMatrix,mesh.geometry.attributes.fishMotion,mesh.geometry.attributes.fishAppearance]) {
        attribute.clearUpdateRanges();attribute.addUpdateRange(0,mesh.count*attribute.itemSize);attribute.needsUpdate=true;
      }
      mesh.visible=mesh.count>0;
    }
    uniforms.uFishTime.value=localTime;
  }
  return {
    root,update,
    setTheme(night){uniforms.uFishNight.value=night?1:0;},
    stats:()=>({count,ready:Boolean(current),worker:Boolean(worker),fixedHz:60,near:levels[0].count,far:levels[1].count,drawCalls:levels.filter(mesh=>mesh.count>0).length*2,triangles:levels.reduce((n,mesh)=>n+mesh.count*mesh.geometry.userData.triangles,0),stepMs,maxStepMs,steps,snapshotLag:current?Math.max(0,localTime-current.time):0,renderPass:'refraction-only'}),
    dispose(){disposed=true;worker?.terminate();levels.forEach(mesh=>mesh.geometry.dispose());material.dispose();finMaterial.dispose();root.removeFromParent();},
  };
}
