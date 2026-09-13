import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PROFILE=[[-.48,.035,.015,-.003],[-.36,.060,.035,0],[-.20,.112,.077,.006],[0,.163,.118,.003],[.20,.153,.110,-.010],[.32,.120,.087,-.018],[.40,.079,.060,-.027],[.47,.025,.035,-.032]];
function profile(x,k) {
  let i=0;while(i<PROFILE.length-2&&x>PROFILE[i+1][0])i++;
  const a=PROFILE[i],b=PROFILE[i+1],before=PROFILE[Math.max(0,i-1)],after=PROFILE[Math.min(PROFILE.length-1,i+2)];
  const t=THREE.MathUtils.clamp((x-a[0])/(b[0]-a[0]),0,1),span=b[0]-a[0];
  const ma=(b[k]-before[k])/(b[0]-before[0]),mb=(after[k]-a[k])/(after[0]-a[0]);
  return (2*t*t*t-3*t*t+1)*a[k]+(t*t*t-2*t*t+t)*span*ma+(-2*t*t*t+3*t*t)*b[k]+(t*t*t-t*t)*span*mb;
}

export function createFishGeometry(detail='high') {
  const high=detail==='high',parts=[];
  const add=(geometry,part)=>{
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    geometry.setAttribute('fishPart',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(part),1));
    geometry.userData.fishPart=part;
    parts.push(geometry);return geometry;
  };
  const rows=high?44:22,sides=high?28:16,p=[],uv=[],index=[];
  for(let row=0;row<=rows;row++) {
    const t=row/rows,x=-.48+t*.95,ry=profile(x,1),rz=profile(x,2),centre=profile(x,3);
    for(let side=0;side<=sides;side++) {
      const a=(side%sides)/sides*Math.PI*2;
      // A rounded back, full cheeks and a gently flattened belly.
      const vertical=Math.cos(a);p.push(x,centre+vertical*ry*(vertical<0?.84:1),Math.sin(a)*rz);uv.push(t,side/sides);
      if(row<rows&&side<sides){const a=row*(sides+1)+side,b=a+1,c=a+sides+1,d=c+1;index.push(a,b,c,b,d,c);}
    }
  }
  for(const row of [0,rows]) {
    if(row===rows) {
      // Annular snout: the mouth is an opening with a recessed cavity, rather
      // than a dark circle painted over a solid front cap.
      const inner=p.length/3;
      for(let side=0;side<=sides;side++) {
        const a=(side%sides)/sides*Math.PI*2;
        p.push(.470,-.032+Math.cos(a)*.016,Math.sin(a)*.020);uv.push(1,side/sides);
        if(side<sides){const a=rows*(sides+1)+side,b=a+1,c=inner+side;index.push(a,b,c,b,c+1,c);}
      }
      continue;
    }
    const x=-.48+row/rows*.95,centre=p.length/3;p.push(x,profile(x,3),0);uv.push(row/rows,.5);
    for(let side=0;side<sides;side++) {const a=row*(sides+1)+side,b=a+1;if(row)index.push(centre,a,b);else index.push(centre,b,a);}
  }
  const body=new THREE.BufferGeometry();body.setAttribute('position',new THREE.Float32BufferAttribute(p,3));body.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));body.setIndex(index);body.computeVertexNormals();
  const normals=body.attributes.normal;
  for(let row=0;row<=rows;row++) {
    const a=row*(sides+1),b=a+sides;
    const n=new THREE.Vector3().fromBufferAttribute(normals,a).add(new THREE.Vector3().fromBufferAttribute(normals,b)).normalize();
    normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);
  }
  add(body,0);

  function fan(origin,outline,part,segments=high?14:8,rings=high?5:3) {
    const curve=new THREE.CatmullRomCurve3(outline.map(v=>new THREE.Vector3(...v))),o=new THREE.Vector3(...origin);
    const positions=[...origin],uvs=[.5,0],indices=[];
    for(let ring=1;ring<=rings;ring++)for(let i=0;i<=segments;i++) {
      const t=ring/rings,end=curve.getPoint(i/segments),point=o.clone().lerp(end,t);
      point.z+=Math.sin(i/segments*Math.PI*11)*.0025*Math.sin(t*Math.PI);
      positions.push(...point);uvs.push(i/segments,t);
      const at=1+(ring-1)*(segments+1)+i;
      if(i<segments){if(ring===1)indices.push(0,at,at+1);else{const a=at-(segments+1);indices.push(a,at,a+1,a+1,at,at+1);}}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();add(g,part);
  }
  // Distinct forked caudal lobes, ray-supported membranes and paired paddling fins.
  fan([-.455,0,0],[[-.69,.208,.006],[-.747,.137,.004],[-.601,0,0],[-.743,-.138,-.002],[-.69,-.181,-.002]],1,high?22:12);
  for(const sign of [-1,1]) {
    fan([.225,-.025,sign*.094],[[.252,-.039,sign*.128],[.142,-.069,sign*.232],[.044,-.081,sign*.251],[.025,-.058,sign*.167],[.104,-.027,sign*.105]],sign<0?2:3);
    fan([-.09,-.073,sign*.054],[[-.085,-.101,sign*.084],[-.176,-.136,sign*.142],[-.258,-.134,sign*.119],[-.205,-.096,sign*.068]],sign<0?4:5,high?10:6,high?4:2);
  }
  fan([-.095,.119,0],[[.205,.145,0],[.105,.28,0],[-.105,.269,0],[-.319,.13,0],[-.347,.066,0]],6,high?18:10);
  fan([-.232,-.075,0],[[-.153,-.10,0],[-.257,-.207,0],[-.399,-.15,0],[-.352,-.048,0]],7,high?10:6,high?4:2);

  function sphere(position,scale,part) {
    const geo=new THREE.SphereGeometry(1,high?12:8,high?8:5);geo.scale(...scale);geo.translate(...position);add(geo,part);
  }
  for(const sign of [-1,1]) {
    sphere([.346,.020,sign*.081],[.022,.025,.015],8);
    sphere([.352,.021,sign*.092],[.0125,.016,.008],9);
    const gill=[];
    for(let i=0;i<=12;i++){const a=.32+i/12*2.43;gill.push(new THREE.Vector3(.241-.026*Math.sin(a),-.01+Math.cos(a)*.143,sign*Math.sin(a)*.108));}
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gill),high?16:9,.0017,4,false),13);
    // Barbels grow from the mouth corner and curve down/back; no detached spikes.
    const barbel=[new THREE.Vector3(.452,-.051,sign*.034),new THREE.Vector3(.436,-.074,sign*.062),new THREE.Vector3(.397,-.073,sign*.078)];
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barbel),high?10:5,.0022,4,false),12);
  }
  const mp=[],mu=[],mi=[],mouthSides=high?24:14;
  for(let ring=0;ring<2;ring++)for(let i=0;i<=mouthSides;i++) {
    const a=i/mouthSides*Math.PI*2,scale=ring?.55:1;
    mp.push(ring?.453:.471,-.032+Math.cos(a)*.016*scale,Math.sin(a)*.020*scale);mu.push(i/mouthSides,ring);
    if(!ring&&i<mouthSides){const c=i+mouthSides+1;mi.push(i,i+1,c,i+1,c+1,c);}
  }
  const mc=mp.length/3;mp.push(.451,-.032,0);mu.push(.5,1);
  for(let i=0;i<mouthSides;i++)mi.push(mc,mouthSides+1+i,mouthSides+2+i);
  const mouth=new THREE.BufferGeometry();mouth.setAttribute('position',new THREE.Float32BufferAttribute(mp,3));mouth.setAttribute('uv',new THREE.Float32BufferAttribute(mu,2));mouth.setIndex(mi);add(mouth,10);
  const lips=new THREE.TorusGeometry(.019,.0019,high?6:4,high?24:14);lips.scale(1,.80,1);lips.rotateY(Math.PI/2);lips.translate(.471,-.032,0);add(lips,11);
  const isFin=g=>g.userData.fishPart>=1&&g.userData.fishPart<=7;
  const solids=parts.filter(g=>!isFin(g)),fins=parts.filter(isFin);
  const solidCount=solids.reduce((n,g)=>n+g.index.count,0);
  const merged=mergeGeometries([...solids,...fins],false);parts.forEach(g=>g.dispose());
  merged.addGroup(0,solidCount,0);merged.addGroup(solidCount,merged.index.count-solidCount,1);
  // Centre the full silhouette (rather than only the body) for safe broad phase.
  merged.translate(.132,0,0);merged.computeBoundingBox();merged.computeBoundingSphere();
  merged.name=`锦鲤·${high?'近景细作':'远景轮廓'}`;
  merged.userData={detail,triangles:merged.index.count/3,anatomy:['rounded cheeks','paired eyes','gill covers','mouth rim','two barbels','pectoral pair','pelvic pair','dorsal fin','anal fin','forked caudal fin']};
  return merged;
}

// Shared definition used by GPU animation and offline pose previews/tests.
export function deformFishPoint(x,y,z,part,phase,speed,turn,out) {
  const longitudinal=x-.132,t=THREE.MathUtils.clamp((.43-longitudinal)/1.04,0,1);
  const amplitude=.013+THREE.MathUtils.clamp(speed/.48,0,1)*.027;
  let lateral=Math.sin(phase-t*5.4)*(t*t*.78+.02)*amplitude+turn*t*t*.029;
  if(part>=2&&part<=5) {
    const side=part%2===0?-1:1,spread=Math.max(0,Math.abs(z)-.064);
    y+=Math.sin(phase*.56+side*.8)*spread*.17;
    lateral+=side*Math.sin(phase*.56)*spread*.055;
  }
  if(part===1)y+=Math.sin(phase-t*5.4+.6)*Math.abs(y)*.035;
  out[0]=x;out[1]=y;out[2]=z+lateral;return out;
}
