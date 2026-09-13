import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { hollowSpoutGeometry, irisPetalGeometry, createGardenLeafSurface } from '../src/garden-geometry.js';
import { masonryUV } from '../src/moon-gate.js';
import { beveledBoxGeometry } from '../src/architecture-geometry.js';
import { installCanvas } from '../scripts/node-canvas.mjs';
import { captureScene, exportScene } from '../src/export-scene.js';
import { loadImage } from '@napi-rs/canvas';
import { applyLighting } from '../src/lighting.js';

test('both light presets keep the bridge and moon gate inside the shadow volume', () => {
  for(const theme of ['sunset','moonlight']) {
    const sun=new THREE.DirectionalLight(),fill=new THREE.DirectionalLight();sun.castShadow=true;
    applyLighting(theme,{sun,fill});
    for(const x of [-8.5,9.5])for(const y of [-.9,9])for(const z of [-7,20]) {
      const p=new THREE.Vector3(x,y,z).project(sun.shadow.camera);
      assert.ok(Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))<1,`${theme}: ${x}, ${y}, ${z}`);
    }
  }
});

test('teapot spout is a closed ceramic shell with a genuinely open, aligned mouth', () => {
  const geometry=hollowSpoutGeometry(),p=geometry.attributes.position,n=geometry.attributes.normal,edges=new Map();
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>x.toFixed(6)).join(',');
  let volume=0;
  for(let i=0;i<geometry.index.count;i+=3) {
    const ids=[0,1,2].map(j=>geometry.index.getX(i+j));
    const [a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j));
    const cross=b.clone().sub(a).cross(c.clone().sub(a));
    assert.ok(cross.lengthSq()>1e-20);
    const normal=ids.reduce((v,j)=>v.add(new THREE.Vector3().fromBufferAttribute(n,j)),new THREE.Vector3());
    assert.ok(cross.dot(normal)>0,'surface winding follows its physical normal');
    volume+=a.dot(b.clone().cross(c))/6;
    for(let j=0;j<3;j++){const a=key(ids[j]),b=key(ids[(j+1)%3]),k=[a,b].sort().join('|'),e=edges.get(k)??[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(k,e);}
  }
  assert.ok(volume>0);
  for(const edge of edges.values())assert.deepEqual(edge,[2,0]);
  const {point,tangent,innerRadius,outerRadius}=geometry.userData.mouth;
  const direction=new THREE.Vector3(...tangent).normalize(),mouth=new THREE.Vector3(...point);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld();
  const origin=mouth.clone().addScaledVector(direction,.008);
  assert.equal(new THREE.Raycaster(origin,direction.clone().negate(),0,.020).intersectObject(mesh).length,0,'no painted disk closes the mouth');
  origin.z+=(innerRadius+outerRadius)/2;
  assert.ok(new THREE.Raycaster(origin,direction.clone().negate(),0,.020).intersectObject(mesh).length>0,'rim has actual wall thickness');
});

test('iris petals are curved, have nonzero triangle area, and finite unit normals', () => {
  for(const upright of [false,true]) {
    const geo=irisPetalGeometry(upright),p=geo.attributes.position,n=geo.attributes.normal;
    geo.computeBoundingBox();assert.ok(geo.boundingBox.max.y-geo.boundingBox.min.y>.06);
    for(let i=0;i<geo.index.count;i+=3) {
      const [a,b,c]=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,geo.index.getX(i+j)));
      assert.ok(b.sub(a).cross(c.sub(a)).lengthSq()>1e-16);
    }
    for(let i=0;i<n.count;i++)assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6);
  }
});

test('masonry projection gives top faces and bevels noncollapsed texture coordinates', () => {
  const g=masonryUV(beveledBoxGeometry(.37,.12,.424,.004)),uv=g.attributes.uv;
  for(let i=0;i<g.index.count;i+=3) {
    const [a,b,c]=[0,1,2].map(j=>g.index.getX(i+j));
    const area=(uv.getX(b)-uv.getX(a))*(uv.getY(c)-uv.getY(a))-(uv.getX(c)-uv.getX(a))*(uv.getY(b)-uv.getY(a));
    assert.ok(Math.abs(area)>1e-9);
  }
});

test('generated canvas pixels survive binary export with visible colour and alpha', async () => {
  installCanvas();
  const surface=createGardenLeafSurface(),root=new THREE.Group();root.userData.detailCounts={};
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({...surface})));
  const binary=Buffer.from(await exportScene(captureScene(root,{includeContext:false}))),jsonLength=binary.readUInt32LE(12);
  const gltf=JSON.parse(binary.subarray(20,20+jsonLength)),dataStart=28+jsonLength;
  for(const image of gltf.images) {
    const view=gltf.bufferViews[image.bufferView],start=dataStart+(view.byteOffset??0);
    const decoded=await loadImage(binary.subarray(start,start+view.byteLength));
    const canvas=document.createElement('canvas');canvas.width=decoded.width;canvas.height=decoded.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(decoded,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let opaque=0,min=255,max=0;
    for(let i=0;i<pixels.length;i+=4){opaque+=pixels[i+3]>250?1:0;min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);}
    assert.equal(opaque,canvas.width*canvas.height,'a native data() method must never become an empty image');
    assert.ok(max-min>5,'the texture contains actual detail');
  }
});
