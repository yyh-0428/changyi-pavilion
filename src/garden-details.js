import * as THREE from 'three';
import { beveledBoxGeometry } from './architecture-geometry.js';
import { peachLeafGeometry, taperedBranchGeometry } from './detail-geometry.js';
import { detailRandom, timberUV } from './surface-finishing.js';
import { hollowSpoutGeometry, irisPetalGeometry, createGardenLeafSurface } from './garden-geometry.js';

const TAU = Math.PI * 2;
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const r = (i, salt = 0) => detailRandom(i, 200 + salt);

// All additions use their own deterministic fields and are placed after the
// original garden has finished. No placement or colour seed is shared with V6.
export function addGardenDetails({ garden, pavilion, gate, mats, porcelain, surfaces }) {
  const counts = { planters: 0, bambooCulms: 0, irisFlowers: 0, pebbles: 0, fallenPetals: 0, teaObjects: 0 };
  const accents = new THREE.MeshStandardMaterial({ name: '园趣·花瓣与细叶', color: '#ffffff', vertexColors: true, roughness: .8, side: THREE.DoubleSide });
  const pottery = new THREE.MeshStandardMaterial({ name: '陶盆·窑变灰褐', color: '#796b57', ...surfaces.tile, normalScale: new THREE.Vector2(.25, .25), roughness: .9 });
  const earth = new THREE.MeshStandardMaterial({ name: '盆土', color: '#453f2d', ...surfaces.stone, roughness: .96 });
  const teaLiquid = new THREE.MeshPhysicalMaterial({ name: '茶汤·琥珀清润', color: '#69501f', roughness: .14, metalness: 0, ior: 1.333, clearcoat: .30, clearcoatRoughness: .10 });
  const foliage = new THREE.MeshStandardMaterial({ name: '园趣·细叶脉络', color: '#ffffff', vertexColors: true, ...createGardenLeafSurface(), normalScale: new THREE.Vector2(.20,.20), roughness: .72, side: THREE.DoubleSide });
  let id = 0;
  const add = (geometry, material, position, parent, name, tint) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    if (position) mesh.position.copy(position);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (material.vertexColors || tint) {
      const shade = tint ? new THREE.Color(tint) : new THREE.Color().setScalar(.88 + r(id++, 1) * .12);
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      const existing = geometry.attributes.color;
      for (let i = 0; i < colors.length; i += 3) colors.set([shade.r*(existing?.getX(i/3)??1),shade.g*(existing?.getY(i/3)??1),shade.b*(existing?.getZ(i/3)??1)],i);
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    parent.add(mesh); return mesh;
  };
  const box = (w, h, d, x, y, z, material, parent, name) => {
    const geometry = beveledBoxGeometry(w, h, d, Math.min(.003, h * .12));
    if (material === mats.darkWood || material === mats.wood) timberUV(geometry, 'x');
    return add(geometry, material, v(x, y, z), parent, name);
  };
  const tube = (points, radius, material, parent, name, tint) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, radius, 5, false), material, null, parent, name, tint);
  const lathe = (profile, material, position, parent, name, segments = 32) => add(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), segments), material, position, parent, name);
  const leaf = (position, length, width, a, lean, parent, tint = '#74814e') => {
    const geometry = peachLeafGeometry(); geometry.scale(width / .076, length / .26, length / .26); geometry.rotateX(Math.PI / 2);
    const item = add(geometry, foliage, position, parent, '园趣·卷曲叶', tint);
    item.rotation.set(lean, a, .12); return item;
  };
  function pebble(x, y, z, scale, parent, i) {
    const geometry = new THREE.IcosahedronGeometry(1, 1), p = geometry.attributes.position, n = geometry.attributes.normal;
    const uv = new Float32Array(p.count * 2);
    for (let k = 0; k < p.count; k++) {
      const nx = Math.abs(n.getX(k)); uv[k * 2] = (nx > .6 ? p.getZ(k) : p.getX(k)) * .16; uv[k * 2 + 1] = p.getY(k) * .16;
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const item = add(geometry, i % 3 ? mats.stoneDark : mats.stone, v(x, y, z), parent, '园趣·水磨卵石');
    item.scale.set(scale, scale * (.42 + r(i, 2) * .22), scale * (.7 + r(i, 3) * .35));
    item.rotation.y = r(i, 4) * TAU; counts.pebbles++; return item;
  }
  function planter(x, z, scale) {
    const group = new THREE.Group(); group.name = '门畔·陶盆小景'; group.position.set(x, -.047, z); group.scale.setScalar(scale); gate.add(group);
    // A closed lathed cross-section, with a visible inner wall and recessed soil.
    lathe([[0,0],[.23,0],[.24,.05],[.29,.08],[.37,.42],[.40,.44],[.40,.49],[.35,.49],[.33,.43],[.27,.12],[0,.12]], pottery, v(0,0,0), group, '门畔·厚壁陶盆', 40);
    add(new THREE.CylinderGeometry(.335,.335,.016,32), earth, v(0,.417,0), group, '门畔·盆中土');
    for (const h of [.115,.39]) {
      const band = add(new THREE.TorusGeometry(h < .2 ? .297 : .365,.006,4,40), mats.stoneDark, v(0,h,0), group,'门畔·陶盆弦纹'); band.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 12; i++) {
      const a = i * 2.39996, rad = .12 + r(i, 5) * .17;
      pebble(Math.cos(a)*rad,.432,Math.sin(a)*rad,.025+r(i,6)*.016,group,i);
    }
    counts.planters++; return group;
  }
  // Asymmetric pair: clipped evergreen on one side, a taller bamboo silhouette on the other.
  const bonsai = planter(-2.96, .08, 1.12);
  const branch = (points, a, b) => add(taperedBranchGeometry(points,a,b,10),mats.bark,null,bonsai,'门畔·盆景枝干');
  branch([v(0,.42,0),v(.055,.7,-.04),v(-.07,.96,.03),v(.05,1.2,0)], .046, .014);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996, y = .88 + i % 3 * .16, radius = .2 + r(i,7) * .15;
    const end = v(Math.cos(a)*radius,y,Math.sin(a)*radius);
    branch([v(.01,.76+i*.031,0),end.clone().multiply(v(.62,1,.62)),end], .015,.004);
    for (let j = 0; j < 6; j++) {
      const k = i * 6 + j, angle = j * 2.39996;
      const tip=end.clone().add(v(Math.sin(angle)*(.10+r(k,8)*.08),.035+r(k,9)*.055,Math.cos(angle)*(.10+r(k,10)*.08)));
      branch([end,end.clone().lerp(tip,.52).add(v(0,.014,0)),tip],.004,.0015);
      for(const [t,offset] of [[.45,-.8],[.72,.8],[1,0]]) {
        const origin=end.clone().lerp(tip,t);
        leaf(origin,.12+r(k,11)*.045,.045+r(k,12)*.016,angle+offset,-.18+r(k,13)*.32,bonsai,t===1?'#8c9b60':'#677f48');
      }
    }
  }
  const bamboo = planter(3.02,-.16,1.12);
  for (let i = 0; i < 5; i++) {
    const x = (r(i,14)-.5)*.30,z=(r(i,15)-.5)*.30,h=1.34+r(i,16)*.68,lean=(i-2)*.055;
    const culm = new THREE.Group(); culm.position.set(x,.43,z); culm.rotation.z=lean; bamboo.add(culm);
    add(new THREE.CylinderGeometry(.012,.022,h,7),accents,v(0,h/2,0),culm,'门畔·竹秆','#718154');
    for (let j=1;j<=5;j++) {
      const y=h*j/6;
      add(new THREE.CylinderGeometry(.025,.026,.017,8),accents,v(0,y,0),culm,'门畔·竹节','#a0a278');
      if(j<3) continue;
      const a=i*2.2+j*2.4,tip=v(Math.cos(a)*.33,y+.10,Math.sin(a)*.33);
      const twigPoints=[v(0,y,0),v(0,y,0).lerp(tip,.55).add(v(0,.055,0)),tip];
      tube(twigPoints,.006,accents,culm,'门畔·竹枝','#677847');
      const twigCurve=new THREE.CatmullRomCurve3(twigPoints);
      for(let k=0;k<5;k++) {
        const position=twigCurve.getPoint(.30+k*.14);
        leaf(position,.24+k*.012,.038,a+(k%2?.7:-.7),-.25,culm,k%2?'#6f8552':'#9baf72');
      }
    }
    counts.bambooCulms++;
  }

  function irisBlade(height, spread) {
    const p=[],indices=[];
    for(let i=0;i<=5;i++) {
      const t=i/5, w=.034*Math.sin(Math.PI*(.06+t*.94));
      for(const side of [-1,1]) p.push(side*w,height*(t-.16*t*t),spread*t*t);
      if(i<5) {const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
  }
  for(const [bed,[x,z]] of [[-2.16,12.65],[2.55,12.95],[-3.85,3.1],[4.12,3.25]].entries()) {
    const group=new THREE.Group();group.name='临水·鸢尾与卵石';group.position.set(x,-.035,z);garden.add(group);
    for(let i=0;i<7;i++) {
      const a=i*2.39996,rad=.11+Math.sqrt(r(i,18+bed))*.31,bx=Math.cos(a)*rad,bz=Math.sin(a)*rad;
      for(let j=0;j<5;j++) {
        const blade=add(irisBlade(.43+r(i*5+j,20+bed)*.39,.19+r(j,22)*.13),accents,v(bx,0,bz),group,'临水·鸢尾剑叶',j%2?'#778b54':'#506f4c');
        blade.rotation.y=a+j*1.9;
      }
      if(i%2) continue;
      const h=.61+r(i,25+bed)*.18;
      tube([v(bx,0,bz),v(bx+.03,h*.7,bz),v(bx+.065,h,bz+.03)],.007,accents,group,'临水·鸢尾花茎','#677d4e');
      for(let j=0;j<6;j++) {
        const petal=add(irisPetalGeometry(j>=3),accents,v(bx+.065,h,bz+.03),group,'临水·鸢尾花瓣',j<3?'#8672a8':'#b6a6ce');
        petal.rotation.y=j*TAU/3+(j<3?0:Math.PI/3);
        if(j<3) {
          const beard=add(new THREE.SphereGeometry(1,6,4),accents,v(bx+.065+Math.sin(j*TAU/3)*.047,h+.020,bz+.03+Math.cos(j*TAU/3)*.047),group,'临水·鸢尾金蕊','#d6b565');
          beard.scale.set(.009,.009,.034);beard.rotation.y=j*TAU/3;
        }
      }
      counts.irisFlowers++;
    }
    // Sparse, uneven stones partially sunk into turf; paths remain unobstructed.
    for(let i=0;i<14;i++) {
      const a=i*2.39996,rad=.41+r(i,31+bed)*.21;
      pebble(Math.cos(a)*rad,-.008,Math.sin(a)*rad,.055+r(i,35+bed)*.04,group,i+bed*14);
    }
  }
  // A handful of petals at the feet of the existing peach trees, on stone and turf.
  for(const [site,[x,y,z]] of [[-2.7,.679,.9],[-3.15,.679,-.5],[-3.5,.011,14.7]].entries()) {
    for(let i=0;i<12;i++) {
      const a=r(i,43+site)*TAU,rad=Math.sqrt(r(i,47+site))*.37;
      const petal=add(new THREE.SphereGeometry(1,7,4),accents,v(x+Math.cos(a)*rad,y+.008,z+Math.sin(a)*rad),site===2?garden:pavilion,'桃径·零落花瓣',i%3?'#e9b8c1':'#edced0');
      petal.scale.set(.019,.0035,.030);petal.rotation.set(.1,a,.13);petal.castShadow=false;counts.fallenPetals++;
    }
  }

  // Tea props are scaled to the existing 1.3 m table; original cups stay in place.
  const tea=new THREE.Group();tea.name='亭内·双人茶席细作';pavilion.add(tea);
  box(.43,.026,.32,-.60,1.446,-.70,mats.wood,tea,'茶席·木茶盘');
  for(const x of [-.824,-.376]) box(.018,.040,.35,x,1.467,-.70,mats.darkWood,tea,'茶席·茶盘包边');
  for(const z of [-.869,-.531]) box(.43,.040,.018,-.60,1.467,z,mats.darkWood,tea,'茶席·茶盘包边');
  for(let i=0;i<5;i++) box(.32,.003,.003,-.60,1.461,-.79+i*.045,mats.darkWood,tea,'茶席·排水细槽');
  const pot=new THREE.Group();pot.position.set(-.60,1.461,-.70);pot.rotation.y=.28;tea.add(pot);
  lathe([[0,0],[.071,0],[.102,.035],[.111,.09],[.088,.135],[.062,.15],[0,.15]],porcelain,v(0,0,0),pot,'茶席·青瓷壶身');
  lathe([[0,0],[.071,0],[.073,.012],[.05,.028],[0,.032]],porcelain,v(0,.15,0),pot,'茶席·青瓷壶盖');
  add(new THREE.SphereGeometry(.017,12,8),porcelain,v(0,.19,0),pot,'茶席·壶钮');
  tube([v(-.08,.04,0),v(-.175,.058,0),v(-.17,.135,0),v(-.075,.14,0)],.014,porcelain,pot,'茶席·壶把');
  add(hollowSpoutGeometry(),porcelain,null,pot,'茶席·中空渐细壶流');
  // Tea surfaces sit inside the existing hollow cups.
  for(const z of [-1.02,-.39]) {const teaSurface=add(new THREE.CircleGeometry(.072,32),teaLiquid,v(-.65,1.545,z),tea,'茶席·茶汤');teaSurface.rotation.x=-Math.PI/2;}
  lathe([[0,0],[.049,0],[.06,.014],[.06,.096],[.05,.11],[0,.11]],porcelain,v(-.95,1.435,-.78),tea,'茶席·小茶罐',24);
  add(new THREE.CylinderGeometry(.056,.056,.017,24),mats.darkWood,v(-.95,1.553,-.78),tea,'茶席·茶罐木盖');
  // A small narrow vase with a single twig balances the compact tea set.
  lathe([[0,0],[.034,0],[.051,.075],[.032,.13],[.019,.20],[.025,.23],[.018,.23],[.014,.19],[.021,.13],[.037,.06],[0,.02]],porcelain,v(-.99,1.435,-.49),tea,'茶席·一枝瓶',24);
  tube([v(-.99,1.60,-.49),v(-.985,1.82,-.51),v(-.91,1.99,-.49)],.004,mats.bark,tea,'茶席·瓶中枝');
  leaf(v(-.972,1.82,-.51),.13,.035,1.8,-.4,tea,'#76845b');
  leaf(v(-.95,1.91,-.50),.10,.030,-.8,-.1,tea,'#879c65');
  counts.teaObjects=7;
  counts.bonsaiLeaves=162; counts.bambooLeaves=75; counts.hollowTeapotSpout=true;
  garden.userData.gardenCraft=counts;
  return counts;
}
