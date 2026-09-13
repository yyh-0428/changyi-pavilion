import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { joinedLatticeGeometry } from '../src/architecture-geometry.js';
import { createFishGeometry } from '../src/fish-geometry.js';
import { createFishMaterial } from '../src/fish-material.js';

test('lattice crossing is one closed solid with no internal split faces',()=>{
  const g=joinedLatticeGeometry(.424,.505),p=g.attributes.position,edges=new Map();
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>x.toFixed(6)).join(',');
  for(let i=0;i<(g.index?.count??p.count);i+=3){const ids=[0,1,2].map(j=>g.index?g.index.getX(i+j):i+j);for(let j=0;j<3;j++){
    const a=key(ids[j]),b=key(ids[(j+1)%3]),k=[a,b].sort().join('|'),edge=edges.get(k)??[0,0];edge[0]++;edge[1]+=a<b?1:-1;edges.set(k,edge);
  }}
  for(const edge of edges.values())assert.deepEqual(edge,[2,0]);g.dispose();
});

test('fish dorsal seam is smooth and the mouth has measurable recessed depth',()=>{
  for(const detail of ['high','low']){
    const g=createFishGeometry(detail),rows=detail==='high'?44:22,sides=detail==='high'?28:16,n=g.attributes.normal;
    for(let row=1;row<rows;row++){
      const a=new THREE.Vector3().fromBufferAttribute(n,row*(sides+1)),b=new THREE.Vector3().fromBufferAttribute(n,row*(sides+1)+sides);
      assert.ok(a.distanceTo(b)<1e-7);
    }
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.updateMatrixWorld();
    const hit=new THREE.Raycaster(new THREE.Vector3(.8,-.032,0),new THREE.Vector3(-1,0,0)).intersectObject(m)[0];
    assert.ok(hit && hit.point.x < .59 && hit.point.x > .57,'open mouth leads to the interior, not a front disk');
    assert.equal(g.attributes.fishPart.getX(hit.face.a),10);g.dispose();
  }
});

test('opaque skin and transparent fin groups cover all triangles without duplicates',()=>{
  const {material,finMaterial}=createFishMaterial();
  assert.equal(material.transparent,false);assert.equal(material.depthWrite,true);
  assert.equal(finMaterial.transparent,true);assert.equal(finMaterial.depthWrite,false);
  assert.equal(finMaterial.side,THREE.DoubleSide);
  for(const detail of ['high','low']){
    const g=createFishGeometry(detail);assert.equal(g.groups.length,2);
    assert.equal(g.groups[0].start,0);assert.equal(g.groups[1].start,g.groups[0].count);
    assert.equal(g.groups[0].count+g.groups[1].count,g.index.count);
    for(const group of g.groups)for(let i=group.start;i<group.start+group.count;i++){
      const part=g.attributes.fishPart.getX(g.index.getX(i));assert.equal(part>=1&&part<=7,group.materialIndex===1);
    }
    g.dispose();
  }
  material.dispose();finMaterial.dispose();
});
