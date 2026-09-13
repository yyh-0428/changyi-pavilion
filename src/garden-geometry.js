import * as THREE from 'three';

// A hollow, tapered ceramic spout. Inner and outer walls share the same curve;
// the mouth rim lies perpendicular to its actual tangent, including in exports.
export function hollowSpoutGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.078,.070,0), new THREE.Vector3(.123,.093,0), new THREE.Vector3(.172,.170,0),
  ]);
  const rows = 18, sides = 24, thickness = .004;
  const positions = [], normals = [], uvs = [], indices = [];
  const zAxis = new THREE.Vector3(0,0,1);
  const radius = t => THREE.MathUtils.lerp(.030,.020,t);
  const vertex = (point, normal, u, v) => {
    const index = positions.length / 3;
    positions.push(...point); normals.push(...normal); uvs.push(u,v); return index;
  };
  const frame = t => {
    const tangent = curve.getTangent(t).normalize();
    return { point: curve.getPoint(t), tangent, normal: zAxis.clone().cross(tangent).normalize() };
  };
  for (const inner of [false,true]) {
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows, f = frame(t), rad = radius(t) - (inner ? thickness : 0);
      for (let side = 0; side <= sides; side++) {
        const a = (side % sides) / sides * Math.PI * 2;
        const outward = f.normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(zAxis,Math.sin(a));
        const normal = outward.clone().addScaledVector(f.tangent,.01 / curve.getLength()).normalize().multiplyScalar(inner?-1:1);
        vertex(f.point.clone().addScaledVector(outward,rad),normal,side/sides,t);
      }
    }
    for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
      const a = base + row*(sides+1)+side, b = a+1, c = a+sides+1, d = c+1;
      if (inner) indices.push(a,c,b,b,c,d); else indices.push(a,b,c,b,d,c);
    }
  }
  for (const end of [0,1]) {
    const f = frame(end), normal = f.tangent.clone().multiplyScalar(end?1:-1), base = positions.length / 3;
    for (const inner of [false,true]) for (let side = 0; side <= sides; side++) {
      const a = (side%sides)/sides*Math.PI*2, rad=radius(end)-(inner?thickness:0);
      const p = f.point.clone().addScaledVector(f.normal,Math.cos(a)*rad).addScaledVector(zAxis,Math.sin(a)*rad);
      vertex(p,normal,Math.cos(a)*rad/.06+.5,Math.sin(a)*rad/.06+.5);
    }
    for (let side=0;side<sides;side++) {
      const a=base+side,b=a+1,c=a+sides+1,d=c+1;
      if(end) indices.push(a,b,c,b,d,c); else indices.push(a,c,b,b,c,d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geometry.setIndex(indices);
  geometry.userData.mouth = { point: curve.getPoint(1).toArray(), tangent: curve.getTangent(1).toArray(), outerRadius: radius(1), innerRadius: radius(1)-thickness };
  return geometry;
}

// Three arching standards and three falling sepals form each iris, with a
// folded throat and a lightly rippled margin instead of flattened spheres.
export function irisPetalGeometry(upright = false) {
  const positions=[],colors=[],uvs=[],indices=[],rows=9,columns=4;
  for(let row=0;row<=rows;row++) {
    const t=row/rows, envelope=Math.sin(Math.PI*t);
    const halfWidth=.004+(upright?.043:.066)*Math.pow(envelope,.72);
    for(let column=0;column<=columns;column++) {
      const u=column/columns*2-1;
      const edge=Math.abs(u), ripple=Math.sin(t*Math.PI*5)*edge**3*envelope*.008;
      const y=upright ? .176*t-.039*t*t+.022*(1-u*u)*envelope : .034*Math.sin(Math.PI*t)-.055*t*t+.018*u*u*envelope;
      positions.push(u*halfWidth,y+ripple,(upright?.105:.187)*t);
      const vein=1-.07*Math.cos(u*Math.PI*4+t*3)*envelope, throat=.84+.16*Math.min(1,t*3);
      colors.push(vein*throat,vein*throat,Math.min(1,vein*throat+.025));uvs.push((u+1)/2,t);
      if(row<rows && column<columns) {
        const a=row*(columns+1)+column,b=a+1,c=a+columns+1,d=c+1;
        indices.push(a,c,b,b,c,d);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function createGardenLeafSurface() {
  const width=128,height=256,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height),heights=new Float32Array(width*height);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const u=x/(width-1),v=y/(height-1),distance=Math.abs(u-.5);
    const midrib=Math.exp(-distance*150), sideVein=Math.exp(-Math.abs(Math.sin((v-distance*.39)*Math.PI*15))*24)*(1-midrib);
    const fibre=(Math.sin(x*1.37+y*.79)+Math.sin(x*.71-y*1.57))*.5;
    const tone=.83+v*.07-distance*.12+midrib*.12+sideVein*.035+fibre*.008;
    const at=(y*width+x)*4;
    image.data.set([Math.min(255,tone*255),Math.min(255,(tone+.018)*255),Math.min(255,(tone-.055)*255),255],at);
    heights[y*width+x]=.5+midrib*.10+sideVein*.04+fibre*.004;
  }
  ctx.putImageData(image,0,0);
  const map=new THREE.CanvasTexture(canvas);map.name='园趣·细叶脉络';map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  const nc=document.createElement('canvas');nc.width=width;nc.height=height;
  const nctx=nc.getContext('2d'),pixels=nctx.createImageData(width,height);
  const sample=(x,y)=>heights[Math.min(height-1,Math.max(0,y))*width+Math.min(width-1,Math.max(0,x))];
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const normal=new THREE.Vector3((sample(x-1,y)-sample(x+1,y))*2,(sample(x,y+1)-sample(x,y-1))*2,1).normalize();
    pixels.data.set([Math.round((normal.x*.5+.5)*255),Math.round((normal.y*.5+.5)*255),Math.round((normal.z*.5+.5)*255),255],(y*width+x)*4);
  }
  nctx.putImageData(pixels,0,0);const normalMap=new THREE.CanvasTexture(nc);normalMap.name='园趣·叶脉微表面';normalMap.anisotropy=4;
  return {map,normalMap};
}
