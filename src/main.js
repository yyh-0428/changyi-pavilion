import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createIcons, Feather, SunMedium, Moon, Rotate3d, ScanEye, Plus, Minus, Download, Maximize, Minimize, Mountain, Landmark, Lamp, Flower2, Image, Box, X, RotateCw } from 'lucide';
import { buildPavilion } from './model.js';
import { createLake, createLakebed } from './lake.js';

const icons = { Feather, SunMedium, Moon, Rotate3d, ScanEye, Plus, Minus, Download, Maximize, Minimize, Mountain, Landmark, Lamp, Flower2, Image, Box, X, RotateCw };
createIcons({ icons });
const $ = selector => document.querySelector(selector);
const experience = $('#experience');
const mobileQuery = matchMedia('(max-width: 760px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
$('#reload').addEventListener('click', () => location.reload());

async function start() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cbd9d2');
  scene.fog = new THREE.FogExp2('#cbd9d2', .009);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobileQuery.matches ? 1.6 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('#scene').appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '长衣亭三维模型');
  renderer.domElement.setAttribute('tabindex', '0');
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); $('#render-error').hidden = false;
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());

  const camera = new THREE.PerspectiveCamera(39, innerWidth / innerHeight, .1, 800);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .055;
  controls.minDistance = 3; controls.maxDistance = 70;
  controls.minPolarAngle = .22; controls.maxPolarAngle = Math.PI / 2 - .05;
  controls.enablePan = false; controls.rotateSpeed = .55; controls.zoomSpeed = .7;
  controls.autoRotateSpeed = .35;
  const cameraViews = {
    overview: { position: [19, 16, 32], target: [.2, 1.7, 5.4], label: '临水观亭' },
    architecture: { position: [8.5, 10.1, 11], target: [0, 5.25, 0], label: '青瓦重檐' },
    inside: { position: [3.5, 3.15, 7.2], target: [0, 2.5, .1], label: '檐下听风' },
    blossom: { position: [-11, 6.1, 8.4], target: [-3.0, 3.4, -.3], label: '花间望亭' },
    garden: { position: [11, 6.8, 23], target: [1, 2.3, 6.5], label: '曲径入园' },
  };
  let currentView = 'overview', transition = null, theme = 'sunset', elapsed = 0, frames = 0;
  function destination(name) {
    const view = cameraViews[name];
    const target = new THREE.Vector3(...view.target);
    const position = new THREE.Vector3(...view.position);
    if (mobileQuery.matches) {
      if (name === 'overview') { position.set(11, 19, 48); target.set(1, 2, 5.8); }
      else position.sub(target).multiplyScalar(1.65).add(target);
    }
    return { position, target };
  }
  function projection() {
    const w = innerWidth, h = innerHeight;
    camera.aspect = w / h;
    if (mobileQuery.matches) camera.setViewOffset(w, h, 0, -h * .045, w, h);
    else camera.setViewOffset(w, h, -w * .10, 0, w, h);
    camera.updateProjectionMatrix();
  }
  function setView(name, animate = true) {
    currentView = name; experience.dataset.view = name; $('#view-name').textContent = cameraViews[name].label;
    const dest = destination(name);
    if (animate && !reducedMotion) transition = { start: performance.now(), from: camera.position.clone(), fromTarget: controls.target.clone(), ...dest };
    else { camera.position.copy(dest.position); controls.target.copy(dest.target); controls.update(); }
  }
  setView('overview', false); projection();

  const hemisphere = new THREE.HemisphereLight('#deedee', '#6e7860', 1.0); scene.add(hemisphere);
  const sun = new THREE.DirectionalLight('#ffe0ae', 2.8); sun.position.set(-12, 16, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobileQuery.matches ? 1024 : 2048, mobileQuery.matches ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 16, bottom: -12, near: 1, far: 55 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.0001; sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#cde6dd', .6); fill.position.set(8, 6, -12); scene.add(fill);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture; scene.environmentIntensity = .25;
  room.dispose(); pmrem.dispose();

  const sky = new Sky(); sky.scale.setScalar(4500); scene.add(sky);
  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 3.5; skyUniforms.rayleigh.value = 1.25;
  skyUniforms.mieCoefficient.value = .006; skyUniforms.mieDirectionalG.value = .82;
  const sunDirection = new THREE.Vector3(-.65, .16, -.65).normalize();
  skyUniforms.sunPosition.value.copy(sunDirection);

  const model = buildPavilion(); scene.add(model.root);
  const lampLights = model.lightPositions.map(position => {
    const light = new THREE.PointLight('#ffbd70', .4, 5.5, 2); light.position.copy(position); scene.add(light); return light;
  });

  const lake = await createLake({ renderer, mobile: mobileQuery.matches, reducedMotion, sun });
  scene.add(lake.water, createLakebed());

  const terrainGeometry = new THREE.PlaneGeometry(290, 290, 120, 120); terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPos = terrainGeometry.attributes.position, terrainColors = [];
  for (let i = 0; i < terrainPos.count; i++) {
    const x = terrainPos.getX(i), z = terrainPos.getZ(i), r = Math.hypot(x, z);
    const growth = THREE.MathUtils.smoothstep(r, 55, 100);
    const noise = Math.sin(x * .052 + Math.sin(z * .027) * 2) * 4 + Math.sin(z * .061 + x * .017) * 3 + Math.sin(x * .17 - z * .071) * 1.6;
    const height = -5.2 + growth * (7.4 + noise * .66);
    terrainPos.setY(i, height);
    const color = new THREE.Color().setHSL(.30 + growth * .03, .12, .27 + growth * .12 + noise * .008);
    terrainColors.push(color.r, color.g, color.b);
  }
  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3)); terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  terrain.receiveShadow = true; scene.add(terrain);

  const moonTexture = document.createElement('canvas'); moonTexture.width = moonTexture.height = 256;
  const mc = moonTexture.getContext('2d'); mc.fillStyle = '#e3e5d9'; mc.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const x = ((i * 73) % 239) + 8, y = ((i * 107) % 239) + 8;
    mc.fillStyle = `rgba(127,140,132,${.04 + (i % 5) * .012})`; mc.beginPath(); mc.arc(x, y, 4 + i % 19, 0, Math.PI * 2); mc.fill();
  }
  const moonMap = new THREE.CanvasTexture(moonTexture); moonMap.colorSpace = THREE.SRGBColorSpace;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.8, 32, 24), new THREE.MeshBasicMaterial({ map: moonMap, color: '#eaf1e0', fog: false }));
  moon.position.set(8, 22, -48); moon.visible = false; scene.add(moon);
  const starPositions = [];
  for (let i = 0; i < 1150; i++) {
    const azimuth = i * 2.399963, elevation = .1 + ((i * 83) % 997) / 997 * 1.45;
    const radius = 260;
    starPositions.push(Math.cos(azimuth) * Math.cos(elevation) * radius, Math.sin(elevation) * radius, Math.sin(azimuth) * Math.cos(elevation) * radius);
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: '#e1eada', size: .38, sizeAttenuation: true, transparent: true, opacity: .65, fog: false, depthWrite: false }));
  stars.visible = false; scene.add(stars);

  const verses = [
    ['银汉低回傍霓裳，', '明月窥帘照玉珰。'],
    ['若教春色妒卿妆，', '桃李无言自敛芳。'],
    ['瑶台纵有月华凉，', '不及携卿看夕阳。'],
    ['此生相守鬓成霜，', '愿挽星河缀嫁裳。'],
  ];
  function setVerse(index) {
    $('#scene-verse').replaceChildren(document.createTextNode(verses[index][0]), document.createElement('br'), document.createTextNode(verses[index][1]));
    document.querySelectorAll('[data-stanza]').forEach(button => button.classList.toggle('active', Number(button.dataset.stanza) === index));
  }
  function setTheme(value, changeVerse = true) {
    theme = value; const night = value === 'moonlight';
    experience.dataset.theme = value;
    document.querySelectorAll('[data-light]').forEach(button => { button.classList.toggle('active', button.dataset.light === value); button.setAttribute('aria-pressed', String(button.dataset.light === value)); });
    scene.background.set(night ? '#203c3b' : '#cbd9d2'); scene.fog.color.set(night ? '#2b4744' : '#cbd9d2');
    scene.fog.density = night ? .013 : .009;
    sky.visible = !night; moon.visible = night; stars.visible = night;
    hemisphere.color.set(night ? '#c8dfe1' : '#deedee'); hemisphere.groundColor.set(night ? '#344b3a' : '#6e7860'); hemisphere.intensity = night ? .9 : 1.0;
    sun.color.set(night ? '#c1dce6' : '#ffe0ae'); sun.intensity = night ? 1.25 : 2.8;
    sun.position.set(...(night ? [8, 18, -9] : [-12, 16, 8]));
    fill.intensity = night ? .3 : .6;
    lampLights.forEach(light => { light.intensity = night ? 10 : .4; });
    model.lanternMaterial.emissiveIntensity = night ? 2 : .25;
    lake.setTheme(night);
    renderer.toneMappingExposure = night ? 1.18 : 1.04;
    $('#scene-time').textContent = night ? '月夜 · 亥时' : '夕照 · 酉时';
    if (changeVerse) setVerse(night ? 0 : 2);
  }
  document.querySelectorAll('[data-light]').forEach(button => button.addEventListener('click', () => setTheme(button.dataset.light)));

  const menus = [['#view-open', '#view-menu'], ['#download-open', '#download-menu']];
  function closeMenus() { menus.forEach(([button, menu]) => { $(menu).hidden = true; $(button).setAttribute('aria-expanded', 'false'); }); }
  for (const [button, menu] of menus) $(button).addEventListener('click', event => {
    event.stopPropagation(); const open = $(menu).hidden; closeMenus(); $(menu).hidden = !open; $(button).setAttribute('aria-expanded', String(open));
    if (open) $(menu).querySelector('button').focus();
  });
  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenus(); });
  document.querySelectorAll('button[data-view]').forEach(button => button.addEventListener('click', () => { setView(button.dataset.view); closeMenus(); }));
  $('#orbit-toggle').addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate; $('#orbit-toggle').setAttribute('aria-pressed', String(controls.autoRotate));
    $('#orbit-toggle').dataset.tip = controls.autoRotate ? '暂停环绕' : '自动环绕';
    $('#orbit-toggle').setAttribute('aria-label', controls.autoRotate ? '暂停环绕' : '自动环绕');
  });
  controls.addEventListener('start', () => { transition = null; });
  function zoom(factor) {
    transition = null;
    const offset = camera.position.clone().sub(controls.target); offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
    camera.position.copy(controls.target).add(offset); controls.update();
  }
  $('#zoom-in').addEventListener('click', () => zoom(.84)); $('#zoom-out').addEventListener('click', () => zoom(1.19));
  renderer.domElement.addEventListener('keydown', event => {
    if (event.key === '+' || event.key === '=') { zoom(.9); event.preventDefault(); }
    if (event.key === '-') { zoom(1.1); event.preventDefault(); }
    if (event.key.toLowerCase() === 'r') setView('overview');
  });

  const poemDialog = $('#poem-dialog');
  $('#poem-open').addEventListener('click', () => { closeMenus(); poemDialog.showModal(); });
  $('#poem-close').addEventListener('click', () => poemDialog.close());
  poemDialog.addEventListener('click', event => { const r = poemDialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) poemDialog.close(); });
  document.querySelectorAll('[data-stanza]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.stanza);
    setVerse(index); setTheme(index === 0 || index === 3 ? 'moonlight' : 'sunset', false);
    setView(['inside', 'blossom', 'overview', 'architecture'][index]);
    poemDialog.close();
  }));

  $('#fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (experience.requestFullscreen) await experience.requestFullscreen();
      else toast('当前浏览器暂不支持全屏');
    } catch { toast('当前浏览器暂不支持全屏'); }
  });
  document.addEventListener('fullscreenchange', () => {
    const full = Boolean(document.fullscreenElement);
    $('#fullscreen').innerHTML = `<i data-lucide="${full ? 'minimize' : 'maximize'}"></i>`;
    $('#fullscreen').dataset.tip = full ? '退出全屏' : '全屏'; $('#fullscreen').setAttribute('aria-label', full ? '退出全屏' : '全屏'); createIcons({ icons });
  });

  function download(blob, filename) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  $('#save-image').addEventListener('click', () => {
    renderer.render(scene, camera);
    renderer.domElement.toBlob(blob => { if (blob) { download(blob, `长衣亭-${theme === 'sunset' ? '夕照' : '月夜'}.png`); toast('此景已留存'); } else toast('此景暂未能保存'); });
  });
  $('#save-model').addEventListener('click', async () => {
    const button = $('#save-model'); button.disabled = true; button.setAttribute('aria-busy', 'true'); toast('正在收好这座亭');
    try {
      const result = await new GLTFExporter().parseAsync(model.root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
      download(new Blob([result], { type: 'model/gltf-binary' }), '长衣亭-赠张依婷.glb'); toast('长衣亭已留存');
    } catch (error) { console.error('Model export failed', error); toast('模型暂未能保存，请再试一次'); }
    finally { button.disabled = false; button.removeAttribute('aria-busy'); }
  });

  let resizeTimer;
  addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobileQuery.matches ? 1.6 : 2)); renderer.setSize(innerWidth, innerHeight); projection();
    lake.resize(innerWidth, innerHeight, mobileQuery.matches);
    clearTimeout(resizeTimer); resizeTimer = setTimeout(() => setView(currentView, false), 120);
  });
  const clock = new THREE.Clock();
  let disposed = false;
  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .05);
    if (document.hidden) return;
    elapsed += dt;
    if (transition) {
      const t = Math.min((performance.now() - transition.start) / 1800, 1);
      const easing = t * t * (3 - 2 * t);
      camera.position.lerpVectors(transition.from, transition.position, easing); controls.target.lerpVectors(transition.fromTarget, transition.target, easing);
      if (t === 1) transition = null;
    }
    if (!reducedMotion) model.update(elapsed);
    lake.update(elapsed);
    controls.update(); renderer.render(scene, camera); frames++;
    if (frames === 3) { experience.classList.add('ready'); $('#loading').setAttribute('aria-hidden', 'true'); }
  }
  window.__pavilion = {
    stats: () => ({ frames, theme, view: currentView, transitioning: Boolean(transition), camera: camera.position.toArray(), triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, geometries: renderer.info.memory.geometries, waterPhase: lake.stats().time, water: lake.stats(), detailCounts: model.root.userData.detailCounts, modelBounds: new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3()).toArray() }),
    model: model.root,
  };
  addEventListener('pagehide', () => { disposed = true; });
  addEventListener('pageshow', event => { if (event.persisted) { disposed = false; animate(); } });
  animate();
}

start().catch(error => {
  console.error('Pavilion initialization failed', error); $('#render-error').hidden = false;
  $('#loading').style.display = 'none';
});
