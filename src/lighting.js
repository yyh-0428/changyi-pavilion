import * as THREE from 'three';

export const MOON_POSITION = Object.freeze([8, 22, -48]);
const moonDirection = new THREE.Vector3(...MOON_POSITION).normalize().multiplyScalar(26).toArray();

// Shared artistic exposure presets. These are relative scene units, not a lux survey.
export const LIGHTING = Object.freeze({
  sunset: Object.freeze({
    background: '#cbd9d2', fog: '#cbd9d2', fogNear: 68, fogFar: 185,
    skyColor: '#deebf0', groundColor: '#77765e', hemisphere: .72,
    keyColor: '#ffe0b4', keyIntensity: 2.65, keyPosition: Object.freeze([-18, 10, 8]),
    fillColor: '#c9dce8', fillIntensity: .38, fillPosition: Object.freeze([8, 6, -12]),
    environment: .32, exposure: 1.04, lampIntensity: .4, lanternEmission: .25,
  }),
  moonlight: Object.freeze({
    background: '#1e303b', fog: '#293e46', fogNear: 68, fogFar: 150,
    skyColor: '#bed6e6', groundColor: '#34443b', hemisphere: .40,
    keyColor: '#c2d9ed', keyIntensity: .72, keyPosition: Object.freeze(moonDirection),
    fillColor: '#8eafc2', fillIntensity: .14, fillPosition: Object.freeze([8, 6, -12]),
    environment: .055, exposure: 1.16, lampIntensity: 10, lanternEmission: 2,
  }),
});

export function lightingPreset(theme = 'sunset') {
  if (!LIGHTING[theme]) throw new Error(`Unknown lighting theme: ${theme}`);
  return LIGHTING[theme];
}

// Cover the pavilion, bridge and moon gate in both sun directions. The old
// symmetric frustum ended before the gate, so its contact shadows disappeared.
export function fitPavilionShadows(sun) {
  sun.updateMatrixWorld(true);sun.target.updateMatrixWorld(true);sun.shadow.updateMatrices(sun);
  const camera=sun.shadow.camera, bounds=new THREE.Box3();
  for(const x of [-8.5,9.5]) for(const y of [-.9,9]) for(const z of [-7,20]) {
    bounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  }
  Object.assign(camera,{left:bounds.min.x-.5,right:bounds.max.x+.5,bottom:bounds.min.y-.5,top:bounds.max.y+.5,near:Math.max(.1,-bounds.max.z-.5),far:-bounds.min.z+.5});
  camera.updateProjectionMatrix();sun.shadow.updateMatrices(sun);sun.shadow.needsUpdate=true;
}

export function applyLighting(theme, { sun, fill, hemisphere, lamps = [], lanternMaterial, scene, renderer }) {
  const preset = lightingPreset(theme);
  sun.color.set(preset.keyColor); sun.intensity = preset.keyIntensity; sun.position.set(...preset.keyPosition);
  if(sun.castShadow) fitPavilionShadows(sun);
  fill.color.set(preset.fillColor); fill.intensity = preset.fillIntensity; fill.position.set(...preset.fillPosition);
  if (hemisphere) {
    hemisphere.color.set(preset.skyColor); hemisphere.groundColor.set(preset.groundColor); hemisphere.intensity = preset.hemisphere;
  }
  lamps.forEach(light => { light.intensity = preset.lampIntensity; });
  if (lanternMaterial) lanternMaterial.emissiveIntensity = preset.lanternEmission;
  if (scene) {
    scene.background?.set(preset.background);
    // Keep the complete pavilion clear even from the more distant phone camera.
    // Mist starts behind the subject and still softens the far shoreline.
    if (!scene.fog?.isFog) scene.fog = new THREE.Fog(preset.fog,preset.fogNear,preset.fogFar);
    else { scene.fog.color.set(preset.fog); scene.fog.near=preset.fogNear; scene.fog.far=preset.fogFar; }
    scene.environmentIntensity = preset.environment;
  }
  if (renderer) renderer.toneMappingExposure = preset.exposure;
  return preset;
}
