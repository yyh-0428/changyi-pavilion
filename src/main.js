import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildPavilion } from './model.js';
import { loadSurfaceImages, optionalAsset } from './material-assets.js';
import { createLake, createLakebed } from './lake.js';
import { createTerrain } from './scene-context.js';
import { applyLighting, lightingPreset, MOON_POSITION } from './lighting.js';
import { createFishSchool } from './fish-school.js';
import { enableMainSceneLayers,partitionWaterPasses,renderFrame } from './render-pipeline.js';

const $ = selector => document.querySelector(selector);
const experience = $('#experience');
const mobileQuery = matchMedia('(max-width: 760px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export async function start(ui) {
  const { toast, closeMenus } = ui;
  let disposed = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cbd9d2');
  const atmosphere=lightingPreset('sunset');
  scene.fog = new THREE.Fog(atmosphere.fog,atmosphere.fogNear,atmosphere.fogFar);
  // The image action renders immediately before toBlob, so no retained backbuffer is needed.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobileQuery.matches ? 1.6 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Water has two nested scene renders. Count the complete frame, including shadows.
  renderer.info.autoReset = false;
  $('#scene').appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '长衣亭三维模型');
  renderer.domElement.setAttribute('tabindex', '0');
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); disposed = true; ui.showRenderError();
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());

  const camera = new THREE.PerspectiveCamera(39, innerWidth / innerHeight, .1, 800);
  enableMainSceneLayers(camera);
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
    moonGate: { position: [10.65, 3.42, 24.5], target: [4.7, 1.68, 16.3], label: '月洞寻幽' },
    tea: { position: [.45, 2.35, .58], target: [-.66, 1.52, -.7], label: '一盏清茗', minDistance: 1.05 },
    fish: { position: [10.8, 5.8, 12.4], target: [7.2, -.8, 5.3], label: '临池观鲤', minDistance: 2.2 },
  };
  let currentView = 'overview', transition = null, theme = 'sunset', elapsed = 0, frames = 0;
  function destination(name) {
    const view = cameraViews[name];
    const target = new THREE.Vector3(...view.target);
    const position = new THREE.Vector3(...view.position);
    if (mobileQuery.matches) {
      if (name === 'overview') { position.set(11, 19, 48); target.set(1, 2, 5.8); }
      else if (name === 'fish') position.set(10.7, 6.8, 12.0);
      else position.sub(target).multiplyScalar(1.65).add(target);
    }
    return { position, target };
  }
  function projection() {
    const w = innerWidth, h = innerHeight;
    camera.aspect = w / h;
    if (currentView === 'fish') camera.clearViewOffset();
    else if (mobileQuery.matches) camera.setViewOffset(w, h, 0, -h * .045, w, h);
    else camera.setViewOffset(w, h, -w * .10, 0, w, h);
    camera.updateProjectionMatrix();
  }
  function setView(name, animate = true) {
    currentView = name; experience.dataset.view = name; $('#view-name').textContent = cameraViews[name].label;
    document.querySelectorAll('.view-shortcuts button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===name)));
    controls.minDistance = cameraViews[name].minDistance ?? 3;
    projection();
    const dest = destination(name);
    if (animate && !reducedMotion) transition = { start: performance.now(), from: camera.position.clone(), fromTarget: controls.target.clone(), ...dest };
    else { transition=null; camera.position.copy(dest.position); controls.target.copy(dest.target); controls.update(); }
  }
  const requestedView=location.hash.slice(1);
  setView(Object.hasOwn(cameraViews,requestedView)?requestedView:'overview', false);

  const hemisphere = new THREE.HemisphereLight(); scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(); sun.name = '主光';
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobileQuery.matches ? 1024 : 2048, mobileQuery.matches ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 16, bottom: -12, near: 1, far: 55 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.0001; sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(); fill.name = '补光'; scene.add(fill);
  applyLighting(theme, { sun, fill, hemisphere, scene, renderer });

  const sky = new Sky(); sky.scale.setScalar(4500); scene.add(sky);
  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 3.5; skyUniforms.rayleigh.value = 1.25;
  skyUniforms.mieCoefficient.value = .006; skyUniforms.mieDirectionalG.value = .82;
  const sunDirection = new THREE.Vector3(...lightingPreset('sunset').keyPosition).normalize();
  skyUniforms.sunPosition.value.copy(sunDirection);
  // Bake the same outdoor sky once; no per-frame environment capture or added pass.
  const pmrem = new THREE.PMREMGenerator(renderer), environmentScene = new THREE.Scene();
  const environmentSky = sky.clone(); environmentScene.add(environmentSky);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), new THREE.MeshBasicMaterial({ color: '#596153' }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1; environmentScene.add(ground);
  const environment = pmrem.fromScene(environmentScene, .04);
  scene.environment = environment.texture;
  ground.geometry.dispose(); ground.material.dispose(); pmrem.dispose();

  // Reuse the original model's lettering so every phone gets the same calligraphy.
  const [plaqueMap, surfaceImages] = await Promise.all([
    optionalAsset(() => new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/plaque-atlas.png`), () => undefined),
    loadSurfaceImages(import.meta.env.BASE_URL),
  ]);
  if (plaqueMap) {
    plaqueMap.flipY = false; plaqueMap.colorSpace = THREE.SRGBColorSpace;
    plaqueMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  const model = buildPavilion({ plaqueMap, surfaceImages }); scene.add(model.root);
  const lampLights = model.lightPositions.map(position => {
    const light = new THREE.PointLight('#ffbd70', .4, 5.5, 2); light.position.copy(position); scene.add(light); return light;
  });

  const lake = await createLake({ renderer, mobile: mobileQuery.matches, reducedMotion, sun });
  const lakebed = createLakebed(), terrain = createTerrain();
  scene.add(lake.water, lakebed, terrain);
  const fish=createFishSchool({mobile:mobileQuery.matches});scene.add(fish.root);
  lake.setSubmergedObjects([fish.root]);
  const renderPartition=partitionWaterPasses([model.root,lakebed,terrain]);

  const moonTexture = document.createElement('canvas'); moonTexture.width = moonTexture.height = 256;
  const mc = moonTexture.getContext('2d'); mc.fillStyle = '#e3e5d9'; mc.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const x = ((i * 73) % 239) + 8, y = ((i * 107) % 239) + 8;
    mc.fillStyle = `rgba(127,140,132,${.04 + (i % 5) * .012})`; mc.beginPath(); mc.arc(x, y, 4 + i % 19, 0, Math.PI * 2); mc.fill();
  }
  const moonMap = new THREE.CanvasTexture(moonTexture); moonMap.colorSpace = THREE.SRGBColorSpace;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.8, 32, 24), new THREE.MeshBasicMaterial({ map: moonMap, color: '#eaf1e0', fog: false }));
  moon.position.set(...MOON_POSITION); moon.visible = false; scene.add(moon);
  const starPositions = [];
  for (let i = 0; i < 1150; i++) {
    const azimuth = i * 2.399963, elevation = .1 + ((i * 83) % 997) / 997 * 1.45;
    const radius = 260;
    starPositions.push(Math.cos(azimuth) * Math.cos(elevation) * radius, Math.sin(elevation) * radius, Math.sin(azimuth) * Math.cos(elevation) * radius);
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: '#e1eada', size: .38, sizeAttenuation: true, transparent: true, opacity: .65, fog: false, depthWrite: false }));
  stars.visible = false; scene.add(stars);

  function setTheme(value, changeVerse = true) {
    theme = value; const night = value === 'moonlight';
    ui.setTheme(value, changeVerse);
    sky.visible = !night; moon.visible = night; stars.visible = night;
    applyLighting(value, { sun, fill, hemisphere, lamps: lampLights, lanternMaterial: model.lanternMaterial, scene, renderer });
    lake.setTheme(night);
    fish.setTheme(night);
  }
  setTheme(experience.dataset.theme, false);

  const menus = [['#view-open', '#view-menu'], ['#download-open', '#download-menu']];
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

  function download(blob, filename) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  $('#save-image').addEventListener('click', async () => {
    try {
      const { keepsakeCanvas } = await import('./keepsake.js');
      renderFrame(renderer,scene,camera);
      const verse = [...$('#scene-verse').childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent);
      const canvas = keepsakeCanvas(renderer.domElement, verse, theme === 'moonlight');
      canvas.toBlob(blob => { if (blob) { download(blob, `长衣亭-予张依婷-${theme === 'sunset' ? '夕照' : '月夜'}.png`); toast('此景与诗，已一同留存'); } else toast('此景暂未能保存'); });
    } catch (error) { console.error('Image export failed', error); toast('此景暂未能保存，请再试一次'); }
  });
  const exportButtons = [$('#save-model'), $('#save-compatible')];
  exportButtons.forEach(button => button.addEventListener('click', async () => {
    exportButtons.forEach(item => { item.disabled = true; item.setAttribute('aria-busy', 'true'); });
    const profile = button.id === 'save-compatible' ? 'compatible' : 'compact';
    toast(profile === 'compatible' ? '正在导出兼容场景，文件较大，请稍候' : '正在收好此刻的亭与庭园');
    try {
      const { captureScene, exportScene } = await import('./export-scene.js');
      const snapshot = captureScene(model.root, {
        time: reducedMotion ? 0 : elapsed, waterTime: lake.stats().time, theme, camera,
        objects: [terrain, lakebed, sun, fill, ...lampLights, moon, stars],
        normalMap: lake.water.material.uniforms.normalMap0.value, exposure: renderer.toneMappingExposure,
      });
      const result = await exportScene(snapshot, { profile, yieldControl: () => new Promise(resolve => setTimeout(resolve, 0)) });
      download(new Blob([result], { type: 'model/gltf-binary' }), `长衣亭-${theme === 'sunset' ? '夕照' : '月夜'}-${profile === 'compatible' ? '兼容场景' : '轻量场景'}.glb`);
      toast('此刻场景已保存；水面为静态近似');
    } catch (error) { console.error('Scene export failed', error); toast('场景暂未能保存，请再试一次'); }
    finally { exportButtons.forEach(item => { item.disabled = false; item.removeAttribute('aria-busy'); }); }
  }));

  addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobileQuery.matches ? 1.6 : 2)); renderer.setSize(innerWidth, innerHeight); projection();
    lake.resize(innerWidth, innerHeight, mobileQuery.matches);
    // Preserve the chosen orbit/zoom; only an explicit view selection moves it.
  });
  // Resolve shader variants while the existing loading screen is still present.
  // Reflection, refraction, shadows and animation keep their original cadence.
  scene.updateMatrixWorld(true);
  const warmupStart=performance.now();
  if(typeof renderer.compileAsync==='function') {
    await renderer.compileAsync(scene,camera);
    await lake.prepare(renderer,scene);
  }
  const shaderWarmupMs=performance.now()-warmupStart;
  const clock = new THREE.Clock();

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
    if (!reducedMotion) {
      model.update(elapsed);
      lampLights.forEach((light, i) => light.position.copy(model.lightPositions[i]));
    }
    lake.update(elapsed);
    fish.update(reducedMotion?0:dt,camera);
    controls.update(dt);
    model.updateMeadow(camera, renderer.domElement.height);
    renderer.info.reset(); renderFrame(renderer,scene,camera); frames++;
    if (frames === 3) { experience.classList.add('ready'); $('#loading').setAttribute('aria-hidden', 'true'); }
  }
  window.__pavilion = {
    stats: () => ({ frames, theme, view: currentView, transitioning: Boolean(transition), camera: camera.position.toArray(), triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, renderScope: 'complete-frame-including-water-and-shadows', geometries: renderer.info.memory.geometries, geometryMetrics: model.root.userData.geometryMetrics, waterPhase: lake.stats().time, water: lake.stats(), detailCounts: model.root.userData.detailCounts, modelBounds: new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3()).toArray() }),
    model: model.root,
    fishStats: fish.stats,
    performanceStats:()=>({...renderPartition.stats(),shaderWarmupMs,sceneMatrixUpdatesPerFrame:1,waterPassesPerFrame:2}),
    version: '13',
  };
  ui.connectScene({ setTheme, setView });
  addEventListener('pagehide', event => { disposed = true;if(!event.persisted)fish.dispose(); });
  addEventListener('pageshow', event => { if (event.persisted) { disposed = false; animate(); } });
  animate();
}
