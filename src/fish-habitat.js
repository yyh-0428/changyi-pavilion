// Conservative signed clearances, in metres, to the existing island/shore.
// Expanded ellipses include the irregular banks and their perimeter boulders.
export const WATER_LEVEL = -.15;
export const FISH_CENTRES = Object.freeze([[-6.9,5.8],[5.7,7.2],[-8.8,-1.8],[8.8,.1],[-3,-8.5],[3.5,-8.4]]);

export function bottomHeight(x,z) {
  const island=Math.hypot(x,z/.89)-6.25;
  const bank=(Math.hypot((x-2)/13,(z-23)/12.5)-1)*12.5;
  const distance=Math.max(0,Math.min(island,bank));
  // The actual lakebed adds <= .033 m of sediment noise. Use its upper envelope.
  return -(.34+Math.min(4.35,distance**1.18*.86))+.04;
}

// out = clearance, inward normal x/z, bottom. No per-query object allocation.
export function sampleHabitat(x,z,out) {
  let best=Infinity,nx=0,nz=0;
  for(let region=0;region<3;region++) {
    const cx=region===1?2:0,cz=region===1?23:0;
    const rx=region===0?7.35:region===1?14.6:15.8;
    const rz=region===0?6.72:region===1?14.1:14.4;
    const qx=(x-cx)/rx,qz=(z-cz)/rz,k=Math.hypot(qx,qz);
    const sign=region===2?-1:1,d=(k-1)*Math.min(rx,rz)*sign;
    if(d<best) {
      best=d;const gx=qx/rx,gz=qz/rz,length=Math.hypot(gx,gz)||1;
      nx=gx/length*sign;nz=gz/length*sign;
      if(k<1e-8){nx=1;nz=0;}
    }
  }
  out[0]=best;out[1]=nx;out[2]=nz;out[3]=bottomHeight(x,z);return out;
}
