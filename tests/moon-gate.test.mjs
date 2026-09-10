import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MOON_GATE, moonBrickGeometry } from '../src/moon-gate.js';
import { createSurface } from '../src/surface-materials.js';
import { installCanvas } from '../scripts/node-canvas.mjs';

test('radial gate stones are closed solids with valid UV area, including the ground cuts', () => {
  const angle = Math.asin(MOON_GATE.centerY / MOON_GATE.radius), span = Math.PI + angle * 2;
  for (let brick = 0; brick < MOON_GATE.bricks; brick++) {
    const geometry = moonBrickGeometry(-angle + brick / MOON_GATE.bricks * span + .0063, -angle + (brick + 1) / MOON_GATE.bricks * span - .0063);
    const { position: p, uv } = geometry.attributes, edges = new Map();
    const key = i => [p.getX(i), p.getY(i), p.getZ(i)].map(n => n.toFixed(6)).join(',');
    let volume = 0;
    for (let i = 0; i < p.count; i += 3) {
      const [a,b,c] = [0,1,2].map(j => new THREE.Vector3().fromBufferAttribute(p,i+j));
      assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-17, `brick ${brick}: area`);
      volume += a.dot(b.clone().cross(c)) / 6;
      const uvArea = (uv.getX(i+1)-uv.getX(i))*(uv.getY(i+2)-uv.getY(i))-(uv.getX(i+2)-uv.getX(i))*(uv.getY(i+1)-uv.getY(i));
      assert.ok(Number.isFinite(uvArea) && Math.abs(uvArea) > 1e-10, `brick ${brick}: UVs must not collapse on the reveal or bevel`);
      for (let j = 0; j < 3; j++) {
        const from=key(i+j),to=key(i+(j+1)%3),edgeKey=[from,to].sort().join('|'),edge=edges.get(edgeKey)??[0,0];
        edge[0]++;edge[1]+=from<to?1:-1;edges.set(edgeKey,edge);
      }
    }
    assert.ok(volume > 0, `brick ${brick}: outward winding`);
    for (const edge of edges.values()) assert.deepEqual(edge,[2,0],`brick ${brick}: watertight`);
    for (let i=0;i<p.count;i++) {
      assert.ok(p.getY(i) >= -.00001, 'no brick protrudes under the walking surface');
      assert.ok(Math.hypot(p.getX(i),p.getY(i)-MOON_GATE.centerY) > MOON_GATE.radius-.001, 'original clear opening survives the chamfer');
    }
  }
});

test('gate brick and fine lime carry independent PBR maps without baked shadows', () => {
  installCanvas();
  for (const kind of ['gateBrick','gateLime']) {
    const surface=createSurface(kind);
    assert.equal(surface.map.colorSpace,THREE.SRGBColorSpace);
    assert.equal(surface.normalMap.colorSpace,THREE.NoColorSpace);
    assert.equal(surface.roughnessMap.colorSpace,THREE.NoColorSpace);
    const {width,height}=surface.normalMap.image;
    const pixels=surface.normalMap.image.getContext('2d').getImageData(0,0,width,height).data;
    let relief=0;
    for (let i=0;i<pixels.length;i+=4) {
      const x=pixels[i]/127.5-1,y=pixels[i+1]/127.5-1,z=pixels[i+2]/127.5-1;
      assert.ok(Math.abs(Math.hypot(x,y,z)-1)<.014 && z>.65);
      if(Math.abs(x)+Math.abs(y)>.02) relief++;
    }
    assert.ok(relief>100, 'microtexture is present');
  }
});
