import * as THREE from 'three';

export const RENDER_LAYERS=Object.freeze({shared:0,fish:1,aboveWater:2,belowWater:3});

// Render once after the scene graph has been updated. The water's nested renders
// reuse those same world matrices; camera and shadow matrices remain automatic.
export function renderFrame(renderer,scene,camera) {
  const automatic=scene.matrixWorldAutoUpdate;
  if(automatic)scene.updateMatrixWorld();
  scene.matrixWorldAutoUpdate=false;
  try {renderer.render(scene,camera);}
  finally {scene.matrixWorldAutoUpdate=automatic;}
}

export function enableMainSceneLayers(camera) {
  camera.layers.enable(RENDER_LAYERS.aboveWater);camera.layers.enable(RENDER_LAYERS.belowWater);
}

// Transform the complete local AABB, including the full possible CPU wind
// displacement, through every instance matrix. This is a conservative interval,
// not a visibility estimate based on an object's centre or current animation pose.
export function worldHeightRange(object) {
  if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
  const box=object.geometry.boundingBox,margin=object.userData.renderMotionMargin??{x:0,y:0,z:0};
  const cx=(box.min.x+box.max.x)*.5,cy=(box.min.y+box.max.y)*.5,cz=(box.min.z+box.max.z)*.5;
  const ex=(box.max.x-box.min.x)*.5+margin.x,ey=(box.max.y-box.min.y)*.5+margin.y,ez=(box.max.z-box.min.z)*.5+margin.z;
  let min=Infinity,max=-Infinity;
  const instance=new THREE.Matrix4(),world=new THREE.Matrix4();
  const count=object.isInstancedMesh?object.count:1;
  for(let i=0;i<count;i++) {
    if(object.isInstancedMesh){object.getMatrixAt(i,instance);world.multiplyMatrices(object.matrixWorld,instance);}
    else world.copy(object.matrixWorld);
    const m=world.elements,y=m[1]*cx+m[5]*cy+m[9]*cz+m[13],radius=Math.abs(m[1])*ex+Math.abs(m[5])*ey+Math.abs(m[9])*ez;
    min=Math.min(min,y-radius);max=Math.max(max,y+radius);
  }
  return {min,max};
}

export function partitionWaterPasses(roots,{waterLevel=-.15,margin=.02}={}) {
  const records=[];
  function visit(object,moving=false) {
    moving ||= Boolean(object.userData.dynamic);
    if(object.isMesh&&object.layers.mask===1) {
      const materials=Array.isArray(object.material)?object.material:[object.material];
      const uncertain=moving||object.isSkinnedMesh||object.geometry.morphAttributes.position?.length||object.userData.deforming||materials.some(material=>material.displacementMap)||
        (object.userData.deformingGeometry&&!object.userData.renderMotionMargin);
      let layer=RENDER_LAYERS.shared,range=null;
      if(!uncertain) {
        range=worldHeightRange(object);
        if(range.min>waterLevel+margin)layer=RENDER_LAYERS.aboveWater;
        else if(range.max<waterLevel-margin)layer=RENDER_LAYERS.belowWater;
      }
      records.push({object,originalMask:object.layers.mask,layer,range});
      object.layers.set(layer);
    }
    for(const child of object.children)visit(child,moving);
  }
  for(const root of roots) {
    root.updateWorldMatrix(true,true);
    let moving=false;for(let parent=root.parent;parent;parent=parent.parent)moving ||= Boolean(parent.userData.dynamic);
    visit(root,moving);
  }
  return {
    records,
    apply(){for(const record of records)record.object.layers.set(record.layer);},
    restore(){for(const record of records)record.object.layers.mask=record.originalMask;},
    stats(){return {aboveWater:records.filter(r=>r.layer===RENDER_LAYERS.aboveWater).length,belowWater:records.filter(r=>r.layer===RENDER_LAYERS.belowWater).length,shared:records.filter(r=>r.layer===RENDER_LAYERS.shared).length,clipMargin:margin,geometryRemoved:0};},
  };
}
