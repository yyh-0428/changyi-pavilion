import * as THREE from 'three';
import { meadowNoise } from './detail-geometry.js';
import { detailRandom } from './surface-finishing.js';

export const MEADOW_SPACING = .098;

// Use the actual polygon, including inward scallops between shoreline samples.
// An ellipse underfilled outward lobes and put some roots beyond inward ones.
export function polygonClearance(x, z, points) {
  let inside = false, distance2 = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i], dx = b.x-a.x, dz = b.z-a.z;
    const t = THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz || 1), 0, 1);
    distance2 = Math.min(distance2, (x-a.x-t*dx)**2+(z-a.z-t*dz)**2);
    if ((a.z>z)!==(b.z>z) && x < (b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x) inside = !inside;
  }
  return Math.sqrt(distance2) * (inside ? 1 : -1);
}

export function pathClearance(x, z, points) {
  let distance2 = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i], dx = b.x-a.x, dz = b.z-a.z;
    const t = THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz || 1), 0, 1);
    distance2 = Math.min(distance2, (x-a.x-t*dx)**2+(z-a.z-t*dz)**2);
  }
  return Math.sqrt(distance2);
}

export function createMeadowSampler({ islandOutline, shoreOutline, pathPoints, surfaceHeight }) {
  return (x, z, island) => {
    const edge = polygonClearance(x,z,island ? islandOutline : shoreOutline);
    let height=island?-.045:-.070;
    if (edge < .055) {
      if(edge<-.26 || !surfaceHeight)return null;
      height=surfaceHeight(x,z,island);
      if(!Number.isFinite(height) || height<-.118)return null;
    }
    let walk;
    if (island) {
      const hex = Math.max(Math.abs(x*Math.sqrt(3)/2+z*.5),Math.abs(z),Math.abs(x*Math.sqrt(3)/2-z*.5));
      // The ashlar face and stair/bridge footprints, with room for blade tips.
      if (hex < 3.73 || (Math.abs(x)<1.32 && z>2.9)) return null;
      if (Math.hypot(x+5.05,z+1.2)<.29 || Math.hypot(x-4.8,z+2.25)<.22) return null;
      walk = hex-3.67;
    } else {
      walk = pathClearance(x,z,pathPoints);
      if (walk < .985) return null;
      const gx=(x-4.7)*Math.cos(.57)-(z-16.3)*Math.sin(.57), gz=(x-4.7)*Math.sin(.57)+(z-16.3)*Math.cos(.57);
      if (Math.abs(gx)<2.51 && Math.abs(gz)<.40) return null;
      if (Math.hypot(x+3,z-14.5)<.28 || [-1.48,1.51].some(lx=>Math.hypot(x-lx,z-11.8)<.34)) return null;
    }
    return { edge, walk, height };
  };
}

export function createMeadowLayout(options) {
  const sample=createMeadowSampler(options), placements=[];
  const counts={island:0,arrival:0,bankEdges:0,blades:0,minimumPathClearance:Infinity,spacing:MEADOW_SPACING,distribution:'jittered cells following actual land outlines'};
  for (const island of [true,false]) {
    const outline=island?options.islandOutline:options.shoreOutline;
    const margin=options.surfaceHeight ? .28 : 0;
    const minX=Math.min(...outline.map(p=>p.x))-margin, maxX=Math.max(...outline.map(p=>p.x))+margin;
    const minZ=Math.min(...outline.map(p=>p.z))-margin, maxZ=Math.max(...outline.map(p=>p.z))+margin;
    for (let ix=Math.floor(minX/MEADOW_SPACING);ix<=Math.ceil(maxX/MEADOW_SPACING);ix++) {
      for (let iz=Math.floor(minZ/MEADOW_SPACING);iz<=Math.ceil(maxZ/MEADOW_SPACING);iz++) {
        const id=(ix+200)*1024+iz+200+(island?0:1000000), random=channel=>detailRandom(id,channel);
        const cx=(ix+.5)*MEADOW_SPACING, cz=(iz+.5)*MEADOW_SPACING;
        let x=cx+(random(1)-.5)*MEADOW_SPACING*.64, z=cz+(random(2)-.5)*MEADOW_SPACING*.64;
        let site=sample(x,z,island);
        if(!site){x=cx;z=cz;site=sample(x,z,island);}
        if(!site)continue;
        const patch=meadowNoise(x*.6+4,z*.6),dry=meadowNoise(x*.33,z*.33+5);
        let height=(.53+random(3)*.39)*(.83+patch*.34),spread=.87+random(4)*.38;
        if(site.edge<.45)height*=1.30;
        const closeToWalk=island?site.walk<.22:site.walk<1.18;
        if(closeToWalk){height*=.72;spread=Math.min(spread,.66);}
        if(site.edge<.16)spread=Math.min(spread,.70);
        const color=dry>.65&&random(5)>.55 ? [1.16,1.04,.78] : [.84+random(6)*.29,.88+random(7)*.23,.83+random(8)*.28];
        placements.push({x,z,y:site.height-.001,height,spread,angle:random(9)*Math.PI*2,color,island});
        if(site.edge<.055)counts.bankEdges++;
        counts[island?'island':'arrival']++;counts.blades+=6;
        if(!island)counts.minimumPathClearance=Math.min(counts.minimumPathClearance,site.walk);
      }
    }
  }
  return {placements,counts};
}
