import * as THREE from 'three';

export const fishVertexPrelude=/* glsl */`
attribute float fishPart;
attribute vec4 fishMotion;
attribute vec4 fishAppearance;
varying vec3 vFishLocal;
varying vec3 vFishWorld;
varying vec3 vFishWorldNormal;
varying vec2 vFishUv;
varying float vFishPart;
varying vec4 vFishAppearance;
vec3 deformFish(vec3 p) {
  float t=clamp((.43-(p.x-.132))/1.04,0.,1.);
  float amplitude=.013+clamp(fishMotion.y/.48,0.,1.)*.027;
  float lateral=sin(fishMotion.x-t*5.4)*(t*t*.78+.02)*amplitude+fishMotion.z*t*t*.029;
  if(fishPart>=2. && fishPart<=5.) {
    float side=mod(fishPart,2.)<.5?-1.:1.;float spread=max(0.,abs(p.z)-.064);
    p.y+=sin(fishMotion.x*.56+side*.8)*spread*.17;
    lateral+=side*sin(fishMotion.x*.56)*spread*.055;
  }
  if(fishPart==1.)p.y+=sin(fishMotion.x-t*5.4+.6)*abs(p.y)*.035;
  p.z+=lateral;return p;
}
`;

const fragmentPrelude=/* glsl */`
uniform float uFishTime;
uniform float uFishNight;
varying vec3 vFishLocal;
varying vec3 vFishWorld;
varying vec3 vFishWorldNormal;
varying vec2 vFishUv;
varying float vFishPart;
varying vec4 vFishAppearance;
float fishHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float fishNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fishHash(i),fishHash(i+vec2(1.,0.)),f.x),mix(fishHash(i+vec2(0.,1.)),fishHash(i+vec2(1.,1.)),f.x),f.y);}
float fishScaleRidge(vec2 uv){float row=floor(uv.y*16.);vec2 q=vec2(fract(uv.x*35.+mod(row,2.)*.5)-.5,fract(uv.y*16.)-.5);float arc=abs(length(vec2(q.x,q.y*.82))-.46);return 1.-smoothstep(.022,.067,arc);}
float fishScaleVisibility(vec2 uv){return 1.-smoothstep(.45,1.3,max(fwidth(uv.x*35.),fwidth(uv.y*16.)));}
float fishScales(vec2 uv){return fishScaleRidge(uv)*fishScaleVisibility(uv);}
vec3 fishAlbedo() {
  float kind=vFishAppearance.y,seed=vFishAppearance.x;
  vec3 ivory=vec3(.80,.79,.70),red=vec3(.58,.079,.031),gold=vec3(.72,.43,.13);
  ivory*=.97+vFishAppearance.z*.055;
  vec2 field=vec2(vFishUv.x*5.7,vFishLocal.z*12.0+vFishLocal.y*3.1)+vec2(seed*.071,seed*.037);
  float patchNoise=fishNoise(field+fishNoise(field*2.3)*.37)*.73+fishNoise(field*2.1+5.)*.27;
  float dorsal=smoothstep(-.10,.025,vFishLocal.y);
  float pattern=smoothstep(.48,.535,patchNoise)*mix(.12,1.,dorsal);
  if(kind>1.5) { // A restrained red crown on warm porcelain white.
    float crown=length(vec2((vFishLocal.x-.465)*8.0,vFishLocal.z*12.));
    pattern=(1.-smoothstep(.77,1.04,crown))*smoothstep(.015,.062,vFishLocal.y);
  }
  vec3 accent=kind>.5&&kind<1.5?gold:red;
  accent*=.92+vFishAppearance.z*.14;
  vec3 colour=mix(ivory,accent,pattern);
  if(vFishPart<.5) {
    float scales=fishScales(vFishUv)*(1.-smoothstep(.72,.93,vFishUv.x));
    colour*=1.-scales*.065;
    float back=smoothstep(.012,.145,vFishLocal.y),belly=1.-smoothstep(-.12,-.035,vFishLocal.y);
    colour*=mix(1.,.88,back);
    colour=mix(colour,ivory*vec3(1.015,1.012,1.045),belly*.40);
  } else if(vFishPart<7.5) {
    float rays=pow(.5+.5*cos(vFishUv.x*3.14159265*30.),10.);
    colour=mix(ivory,accent,.09+.13*pattern)*.84*(1.-rays*.095*vFishUv.y);
    colour=mix(colour,ivory*.92,smoothstep(.72,1.,vFishUv.y)*.36);
  } else if(vFishPart<8.5)colour=vec3(.25,.145,.047);
  else if(vFishPart<9.5)colour=vec3(.008,.012,.014);
  else if(vFishPart<10.5)colour=vec3(.070,.025,.018);
  else if(vFishPart<11.5)colour=mix(ivory,vec3(.53,.21,.13),.24);
  else if(vFishPart>12.5)colour=ivory*.56;
  else colour=ivory*.93;
  // Moving, low contrast light bands, attenuated with depth and at night.
  float ca=sin(vFishWorld.x*8.3+sin(vFishWorld.z*6.1+uFishTime*.64))+sin(vFishWorld.z*8.9-uFishTime*.52+sin(vFishWorld.x*4.1));
  float caustic=pow(max(0.,1.-abs(ca)*.62),12.)*.085*(1.-uFishNight)*exp(min(0.,vFishWorld.y+.15)*.45)*pow(max(0.,vFishWorldNormal.y),1.5);
  return colour*(.97+caustic);
}
`;

export function createFishMaterial() {
  const uniforms={uFishTime:{value:0},uFishNight:{value:0}};
  // Low index contrast represents wet skin surrounded by water. Fin membranes
  // blend over opaque fish/lakebed after their depth is resolved.
  const material=new THREE.MeshPhysicalMaterial({name:'锦鲤·水下鳞皮',color:0xffffff,metalness:0,roughness:.40,clearcoat:.08,clearcoatRoughness:.38,ior:1.10,side:THREE.FrontSide});
  const finMaterial=new THREE.MeshPhysicalMaterial({name:'锦鲤·透光鳍膜',color:0xffffff,metalness:0,roughness:.58,clearcoat:0,ior:1.10,side:THREE.DoubleSide,transparent:true,depthWrite:false});
  for(const target of [material,finMaterial]) {
  target.forceSinglePass=true;
  target.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=fishVertexPrelude+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      vec3 fishPosition=deformFish(position);
      vec3 fishTangent=normalize(cross(abs(normal.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.),normal));
      vec3 fishBitangent=cross(normal,fishTangent);
      objectNormal=normalize(cross(deformFish(position+fishTangent*.001)-fishPosition,deformFish(position+fishBitangent*.001)-fishPosition));`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=fishPosition;
      vFishLocal=position;vFishUv=uv;vFishPart=fishPart;vFishAppearance=fishAppearance;
      vFishWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;
      mat3 fishBasis=mat3(modelMatrix*instanceMatrix);
      vFishWorldNormal=normalize(fishBasis*(objectNormal/vec3(dot(fishBasis[0],fishBasis[0]),dot(fishBasis[1],fishBasis[1]),dot(fishBasis[2],fishBasis[2]))));`);
    shader.fragmentShader=fragmentPrelude+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb*=fishAlbedo();
      if(vFishPart>.5 && vFishPart<7.5) {
        float finRay=pow(.5+.5*cos(vFishUv.x*3.14159265*30.),10.);
        diffuseColor.a*=mix(.92,.34,pow(vFishUv.y,1.25))+finRay*.035;
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      if(vFishPart<.5) {
        float scaleHeight=fishScaleRidge(vFishUv)*.00022*(1.-smoothstep(.72,.93,vFishUv.x));
        vec3 surfaceX=dFdx(-vViewPosition),surfaceY=dFdy(-vViewPosition);
        vec3 basisX=cross(surfaceY,normal),basisY=cross(normal,surfaceX);
        float determinant=dot(surfaceX,basisX);
        if(abs(determinant)>1e-12)normal=normalize(abs(determinant)*normal-sign(determinant)*(dFdx(scaleHeight)*basisX+dFdy(scaleHeight)*basisY)*fishScaleVisibility(vFishUv));
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=vFishPart>=8.&&vFishPart<10.?.20:(vFishPart>.5&&vFishPart<7.5?.58:.39);
      if(vFishPart<.5)roughnessFactor+=fishScales(vFishUv)*.055;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`// Downward light absorption; the lake separately attenuates the outgoing view ray.
      outgoingLight*=exp(-vec3(.17,.055,.025)*max(0.,-.15-vFishWorld.y));
      #include <opaque_fragment>`);
  };
  target.customProgramCacheKey=()=> target===finMaterial?'pavilion-koi-v12-fins':'pavilion-koi-v12-skin';
  }
  return {material,finMaterial,uniforms};
}
