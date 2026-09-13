import * as THREE from 'three';
import { beveledBoxGeometry, miterHexBeam } from './architecture-geometry.js';
import { timberUV } from './surface-finishing.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

// A closed, chamfered rail with 45-degree ends. The outer edge is the longer
// edge; four rotated copies meet around the lettering without overlapping bars.
export function miteredFrameRailGeometry(length, width=.028, depth=.030) {
  const geometry=beveledBoxGeometry(length,width,depth,.002);
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)*(1-(width-2*p.getY(i))/length));
  geometry.computeVertexNormals();return timberUV(geometry,'x');
}

export function addPavilionCraft({ mesh, box, beam, cylinder, tube, mats, endgrain, corners }) {
  const counts = { ashlarBlocks: 0, timberPegs: 0, bracketKeys: 0, miteredFrameRails: 0, benchLegs: 0, benchBearers: 0, benchAprons: 0, benchStretchers: 0, benchBackSupports: 0, handrailCaps: 0, beamMouldings: 0 };
  // Recessed beds remain between separate, chamfered ashlar faces.
  for (const [radius, y, h, blocks] of [[4.045, .32, .302, 7], [4.211, .03, .22, 8]]) {
    for (let side = 0; side < 6; side++) {
      const a = v(Math.cos(side * Math.PI / 3) * radius, y, Math.sin(side * Math.PI / 3) * radius);
      const b = v(Math.cos((side + 1) * Math.PI / 3) * radius, y, Math.sin((side + 1) * Math.PI / 3) * radius);
      for (let j = 0; j < blocks; j++) {
        const start = a.clone().lerp(b, (j + .012) / blocks), end = a.clone().lerp(b, (j + .988) / blocks);
        beam(start, end, .045, h, mats.stone).name = '台基·独立灰石砌块'; counts.ashlarBlocks++;
      }
    }
  }
  // Timber pegs are flush with the surface; grain on their ends is radial.
  for (let i = 0; i < 6; i++) {
    const p = corners[i], next = corners[(i + 1) % 6];
    const radial = p.clone().normalize();
    for (const y of [3.66, 4.02]) {
      const radius = y > 3.9 ? .153 : .158;
      const center = p.clone().addScaledVector(radial, radius); center.y = y;
      const peg = cylinder(.016, .016, .006, ...center.toArray(), endgrain, 12);
      peg.quaternion.setFromUnitVectors(v(0, 1, 0), radial); peg.name = '木柱·透榫木销'; counts.timberPegs++;
    }
    for (let tier = 0; tier < 3; tier++) {
      const armY = 4.34 + tier * .18, length = .56 + tier * .22;
      for (const sign of [-1, 1]) {
        const tip = p.clone().addScaledVector(radial, sign * (length * .5 - .015)); tip.y = armY + .014;
        const key = box(.026, .044, .09, ...tip.toArray(), endgrain);
        key.rotation.y = -i * Math.PI / 3; key.name = '斗拱·出榫端头'; counts.bracketKeys++;
      }
    }
    if (i !== 1) {
      const a = p.clone().multiplyScalar(.86), b = next.clone().multiplyScalar(.86), along = b.clone().sub(a).normalize();
      const normal = v(along.z, 0, -along.x);
      // Split seat planks are separated by a fine recessed join at the top.
      for (const offset of [-.093, .093]) {
        const start = a.clone().addScaledVector(normal, offset); start.y = 1.2175;
        const end = b.clone().addScaledVector(normal, offset); end.y = 1.2175;
        const plank = beam(start, end, .177, .018, mats.darkWood);
        miterHexBeam(plank.geometry, a.distanceTo(b), offset); plank.name = '坐凳·双拼木板';
      }
      for (const t of [.10, .90]) {
        const seat = a.clone().lerp(b, t); seat.y = 1.2278;
        cylinder(.008, .008, .002, ...seat.toArray(), endgrain, 8).name = '坐凳·木销';
      }
    }
  }
  // Raised frame around the original lettering, preserving the supplied atlas.
  for (const sign of [-1, 1]) {
    const horizontal=mesh(miteredFrameRailGeometry(1.67),mats.darkWood,v(0,3.95+sign*.266,2.866));
    horizontal.rotation.z=sign>0?0:Math.PI;horizontal.name='匾额·攒角倒棱边框';
    const vertical=mesh(miteredFrameRailGeometry(.560),mats.darkWood,v(sign*.821,3.95,2.866));
    vertical.rotation.z=-sign*Math.PI/2;vertical.name='匾额·攒角倒棱边框';counts.miteredFrameRails+=2;
    for (const x of [-.78, .78]) {
      const pin = cylinder(.010, .010, .005, x, 3.95 + sign * .222, 2.885, mats.brass, 10);
      pin.rotation.x = Math.PI / 2; pin.name = '匾框·旧铜钉';
    }
  }
  let detailIndex=0;
  const added=(geometry,material,position,name)=>{
    const object=mesh(geometry,material,position);object.name=name;
    // New timber does not shift the surface seeds of existing trees and masonry.
    object.userData.surfaceSeed=100000+detailIndex++;object.userData.pavilionDetailV10=true;
    return object;
  };
  const dressedBeam=(a,b,width,height,material,name)=>{
    const geometry=timberUV(beveledBoxGeometry(width,height,a.distanceTo(b),Math.min(.004,width*.12,height*.12)),'z');
    const object=added(geometry,material,a.clone().lerp(b,.5),name);
    object.quaternion.setFromUnitVectors(v(0,0,1),b.clone().sub(a).normalize());return object;
  };
  for(let i=0;i<6;i++) {
    const p=corners[i],q=corners[(i+1)%6],along=q.clone().sub(p).normalize(),outward=v(along.z,0,-along.x);
    // Fine timber mouldings lie against the outer face of the existing ring beam.
    for(const y of [4.154,4.386]) {
      const a=p.clone().lerp(q,.075).addScaledVector(outward,.121);a.y=y;
      const b=p.clone().lerp(q,.925).addScaledVector(outward,.121);b.y=y;
      dressedBeam(a,b,.016,.022,mats.darkWood,'额枋·细木线脚');counts.beamMouldings++;
    }
    if(i===1)continue; // Keep the complete entrance bay open.
    const capA=p.clone().lerp(q,.044),capB=p.clone().lerp(q,.956);capA.y=capB.y=1.626;
    dressedBeam(capA,capB,.139,.030,mats.wood,'栏杆·倒圆压顶');counts.handrailCaps++;
    const a=p.clone().multiplyScalar(.86),b=q.clone().multiplyScalar(.86);
    const point=(t,offset,y)=>{const pos=a.clone().lerp(b,t).addScaledVector(outward,offset);pos.y=y;return pos;};
    for(const t of [.13,.50,.87]) {
      const top=p.clone().lerp(q,t).addScaledVector(outward,-.025);top.y=1.546;
      dressedBeam(point(t,.164,1.205),top,.040,.052,mats.darkWood,'坐凳·靠背联结撑');counts.benchBackSupports++;
    }
    // The existing seat underside is y=1.110; the paving surface is y=.683.
    // Bearers overlap both the seat and its four legs by a small fitting allowance.
    for(const t of [.13,.87]) {
      dressedBeam(point(t,-.166,1.082),point(t,.166,1.082),.066,.060,mats.darkWood,'坐凳·穿带承托');counts.benchBearers++;
      for(const offset of [-.120,.120]) {
        const leg=timberUV(beveledBoxGeometry(.056,.398,.056,.003),'y');
        const object=added(leg,mats.darkWood,point(t,offset,.881),'坐凳·落地榫腿');
        object.rotation.y=-Math.atan2(along.z,along.x);counts.benchLegs++;
      }
    }
    for(const sign of [-1,1]) {
      dressedBeam(point(.12,sign*.148,1.061),point(.88,sign*.148,1.061),.032,.106,mats.darkWood,'坐凳·收边牙条');counts.benchAprons++;
      dressedBeam(point(.13,sign*.120,.846),point(.87,sign*.120,.846),.030,.035,mats.darkWood,'坐凳·下部横枨');counts.benchStretchers++;
    }
  }
  return counts;
}
