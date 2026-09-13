// Geometry QA only: authored geometry/albedo, simplified lighting, no live lake.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {installCanvas,loadPlaqueMap,loadMaterialImages} from './node-canvas.mjs';
import {buildPavilion} from '../src/model.js';
installCanvas();
const output=path.resolve(process.argv[2]??'../detail-preview-work');await mkdir(output,{recursive:true});
const model=buildPavilion({plaqueMap:await loadPlaqueMap(),surfaceImages:await loadMaterialImages()});model.update(0);model.root.updateMatrixWorld(true);
const meshes=[],materials=[],materialIDs=new Map(),writes=[];
function binary(name,array){writes.push(writeFile(path.join(output,name),Buffer.from(array.buffer)));return name;}
model.root.traverse(o=>{
  if(!o.isMesh || !o.visible)return;
  const mat=o.material;if(Array.isArray(mat))throw new Error('Unexpected model material array');
  if(!materialIDs.has(mat)){
    const id=materials.length;materialIDs.set(mat,id);
    let texture=null;
    if(mat.map){const image=mat.map.image,c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);texture=`map-${id}.png`;writes.push(writeFile(path.join(output,texture),c.toBuffer('image/png')));mat.map.updateMatrix();}
    materials.push({color:mat.color.toArray(),opacity:mat.opacity,transparent:mat.transparent,doubleSided:mat.side===THREE.DoubleSide,texture,flipY:mat.map?.flipY,uvMatrix:mat.map?.matrix.toArray(),emissive:mat.emissive?.clone().multiplyScalar(mat.emissiveIntensity).toArray()??[0,0,0]});
  }
  const id=meshes.length,g=o.geometry,attrs={};
  for(const [name,size] of [['position',3],['normal',3],['uv',2],['color',3]]){
    const source=g.attributes[name],arr=new Float32Array(g.attributes.position.count*size);
    for(let i=0;i<g.attributes.position.count;i++)for(let j=0;j<size;j++)arr[i*size+j]=source?source.getComponent(i,j):name==='color'?1:0;
    attrs[name]=binary(`${id}-${name}.bin`,arr);
  }
  const count=o.isInstancedMesh?o.count:1,matrices=new Float32Array(count*16),colors=new Float32Array(count*3).fill(1),m=new THREE.Matrix4(),c=new THREE.Color();
  for(let i=0;i<count;i++){
    if(o.isInstancedMesh){o.getMatrixAt(i,m);m.premultiply(o.matrixWorld);}else m.copy(o.matrixWorld);
    matrices.set(m.elements,i*16);if(o.instanceColor){o.getColorAt(i,c);colors.set(c.toArray(),i*3);}
  }
  const index=new Uint32Array(g.index?.array??Array.from({length:g.attributes.position.count},(_,i)=>i));
  meshes.push({name:o.name,material:materialIDs.get(mat),attrs,index:binary(`${id}-index.bin`,index),matrix:binary(`${id}-matrix.bin`,matrices),instanceColor:binary(`${id}-tint.bin`,colors),count});
});
await Promise.all(writes);
const views={
  'railing-outside-v12':[[6,2.65,3.7],[2.15,1.40,1.10]],
  'railing-inside-v12':[[.0,1.85,.1],[2.25,1.15,1.35]],
  'grass-bank-v12':[[-3.5,1.45,18.9],[-4.5,.0,22.0]],
  'grass-island-v12':[[7.5,1.65,-4.1],[4.9,.05,-1.9]],
};
for(const [name,[position,target]]of Object.entries(views)){
  const camera=new THREE.PerspectiveCamera(42,1440/960,.025,100);camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld();
  views[name]={camera:position,view:camera.matrixWorldInverse.toArray(),projection:camera.projectionMatrix.toArray()};
}
await writeFile(path.join(output,'scene.json'),JSON.stringify({materials,meshes,views,metrics:model.root.userData.geometryMetrics,grass:model.root.userData.detailCounts.grass}));
console.log(JSON.stringify({output,meshes:meshes.length,metrics:model.root.userData.geometryMetrics}));
