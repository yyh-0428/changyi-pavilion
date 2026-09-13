import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addPavilionCraft, miteredFrameRailGeometry } from '../src/pavilion-craft.js';
import { finishSurfaces } from '../src/surface-finishing.js';
import { applyLighting } from '../src/lighting.js';

function craftFixture() {
  const root=new THREE.Group(),v=(x,y,z)=>new THREE.Vector3(x,y,z);
  const mats=Object.fromEntries(['wood','darkWood','stone','brass'].map(name=>[name,new THREE.MeshStandardMaterial({name})]));
  const endgrain=new THREE.MeshStandardMaterial({name:'木端面'});
  const mesh=(geometry,material,position)=>{const object=new THREE.Mesh(geometry,material);if(position)object.position.copy(position);root.add(object);return object;};
  const box=(w,h,d,x,y,z,material)=>mesh(new THREE.BoxGeometry(w,h,d),material,v(x,y,z));
  const cylinder=(rt,rb,h,x,y,z,material,segments=24)=>mesh(new THREE.CylinderGeometry(rt,rb,h,segments),material,v(x,y,z));
  const beam=(a,b,w,h,material)=>{const object=mesh(new THREE.BoxGeometry(w,h,a.distanceTo(b)),material,a.clone().lerp(b,.5));object.quaternion.setFromUnitVectors(v(0,0,1),b.clone().sub(a).normalize());return object;};
  const corners=Array.from({length:6},(_,i)=>v(Math.cos(i*Math.PI/3)*3.14,0,Math.sin(i*Math.PI/3)*3.14));
  const counts=addPavilionCraft({mesh,box,beam,cylinder,mats,endgrain,corners});
  const seats=[];
  for(let i=0;i<6;i++)if(i!==1){const a=corners[i].clone().multiplyScalar(.86),b=corners[(i+1)%6].clone().multiplyScalar(.86);a.y=b.y=1.16;seats.push(beam(a,b,.38,.1,mats.darkWood));}
  root.updateMatrixWorld(true);return {root,counts,seats};
}

test('both overview cameras keep the pavilion clear while distant shores retain mist',()=>{
  for(const theme of ['sunset','moonlight']) {
    const scene=new THREE.Scene(),sun=new THREE.DirectionalLight(),fill=new THREE.DirectionalLight();
    applyLighting(theme,{scene,sun,fill});assert.equal(scene.fog.isFog,true);
    for(const [position,target]of [[[19,16,32],[.2,1.7,5.4]],[[11,19,48],[1,2,5.8]]]) {
      const camera=new THREE.PerspectiveCamera();camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld();
      for(const x of [-5,5])for(const z of [-5,5])for(const y of [0,8.6]) {
        const depth=-new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse).z;
        assert.equal(THREE.MathUtils.smoothstep(depth,scene.fog.near,scene.fog.far),0);
      }
    }
    assert.ok(THREE.MathUtils.smoothstep(120,scene.fog.near,scene.fog.far)>.2);
  }
});

test('mitred frame pieces are closed, outward solids and keep the lettering opening clear',()=>{
  for(const length of [1.67,.56]) {
    const g=miteredFrameRailGeometry(length),p=g.attributes.position,edges=new Map();let volume=0;
    const id=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>n.toFixed(6)).join(',');
    for(let i=0;i<g.index.count;i+=3) {
      const ids=[0,1,2].map(j=>g.index.getX(i+j)),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j));
      assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-18);volume+=a.dot(b.clone().cross(c))/6;
      for(let j=0;j<3;j++){const pair=[id(ids[j]),id(ids[(j+1)%3])],key=[...pair].sort().join('|'),edge=edges.get(key)??[0,0];edge[0]++;edge[1]+=pair[0]<pair[1]?1:-1;edges.set(key,edge);}
    }
    assert.ok(volume>0);for(const edge of edges.values())assert.deepEqual(edge,[2,0]);
    for(const value of g.attributes.uv.array)assert.ok(Number.isFinite(value));
    g.dispose();
  }
  const {root}=craftFixture(),frame=root.children.filter(object=>object.name==='匾额·攒角倒棱边框');
  for(const x of [-.774,0,.774])for(const y of [-.239,0,.239]) {
    const ray=new THREE.Raycaster(new THREE.Vector3(x,3.95+y,3),new THREE.Vector3(0,0,-1));
    assert.equal(ray.intersectObjects(frame).length,0,'original lettering must remain unobstructed');
  }
});

test('bench legs meet the paving and bearers connect them to all five seats',()=>{
  const {root,counts,seats}=craftFixture();
  assert.equal(counts.benchLegs,20);assert.equal(counts.handrailCaps,5);
  const legs=root.children.filter(object=>object.name==='坐凳·落地榫腿'),bearers=root.children.filter(object=>object.name==='坐凳·穿带承托');
  const newTriangles=root.children.filter(object=>object.userData.pavilionDetailV10).reduce((sum,object)=>sum+object.geometry.index.count/3,0);
  assert.ok(newTriangles<5000,'all new timber shares a small geometry budget');
  for(const leg of legs) {
    const bounds=new THREE.Box3().setFromObject(leg);assert.ok(Math.abs(bounds.min.y-.682)<1e-6);
    const support=bearers.find(object=>new THREE.Box3().setFromObject(object).intersectsBox(bounds));assert.ok(support);
    const hit=new THREE.Raycaster(new THREE.Vector3(leg.position.x,1.09,leg.position.z),new THREE.Vector3(0,1,0)).intersectObjects(seats)[0];assert.ok(hit);
    assert.ok(new THREE.Box3().setFromObject(support).max.y>=hit.point.y);
  }
  for(const object of root.children.filter(object=>object.userData.pavilionDetailV10)) {
    for(const attribute of Object.values(object.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
  }
});

test('new craft surface seeds leave existing material colours and texture offsets unchanged',()=>{
  function sample(withNew) {
    const root=new THREE.Group(),mat=new THREE.MeshStandardMaterial({name:'wood'});
    const first=new THREE.Mesh(new THREE.BoxGeometry(),mat),last=first.clone();last.geometry=first.geometry.clone();root.add(first);
    if(withNew){const added=first.clone();added.geometry=first.geometry.clone();added.userData.surfaceSeed=100000;root.add(added);}
    root.add(last);finishSurfaces(root);return [first,last].map(object=>({uv:[...object.geometry.attributes.uv.array],colour:[...object.geometry.attributes.color.array]}));
  }
  assert.deepEqual(sample(false),sample(true));
});
