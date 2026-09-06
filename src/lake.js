import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Refractor } from 'three/addons/objects/Refractor.js';
import { meadowNoise } from './detail-geometry.js';

const vertexShader = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  uniform float time;
  uniform mat4 reflectionMatrix;
  uniform mat4 refractionMatrix;
  varying vec4 reflectionCoord;
  varying vec4 refractionCoord;
  varying vec3 worldSurface;
  varying vec3 largeNormal;
  void main() {
    reflectionCoord = reflectionMatrix * vec4(position, 1.0);
    refractionCoord = refractionMatrix * vec4(position, 1.0);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec2 p = worldPosition.xz;
    float a = dot(p, vec2(0.83, 0.37)) - time * 0.77;
    float b = dot(p, vec2(-0.49, 1.17)) - time * 0.95;
    worldPosition.y += sin(a) * 0.014 + sin(b) * 0.008;
    vec2 slope = cos(a) * vec2(0.83, 0.37) * 0.014 + cos(b) * vec2(-0.49, 1.17) * 0.008;
    largeNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
    worldSurface = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D reflectionMap;
  uniform sampler2D refractionMap;
  uniform sampler2D depthMap;
  uniform sampler2D normalMap0;
  uniform sampler2D normalMap1;
  uniform mat4 inverseRefractionProjection;
  uniform mat4 refractionCameraWorld;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform vec3 scatterColor;
  uniform float illumination;
  uniform float time;
  varying vec4 reflectionCoord;
  varying vec4 refractionCoord;
  varying vec3 worldSurface;
  varying vec3 largeNormal;

  vec3 floorPosition(vec2 uv) {
    float depth = texture2D(depthMap, uv).r;
    if (depth > 0.999999) return cameraPosition + normalize(worldSurface - cameraPosition) * 240.0;
    vec4 viewPoint = inverseRefractionProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return (refractionCameraWorld * vec4(viewPoint.xyz / viewPoint.w, 1.0)).xyz;
  }

  void main() {
    vec3 toEye = normalize(cameraPosition - worldSurface);
    vec2 p = worldSurface.xz;
    vec3 n0 = texture2D(normalMap0, p * 0.16 + vec2(time * 0.008, time * 0.003)).xyz * 2.0 - 1.0;
    vec3 n1 = texture2D(normalMap1, mat2(0.8,-0.6,0.6,0.8) * p * 0.41 + vec2(-time * 0.005, time * 0.004)).xyz * 2.0 - 1.0;
    vec3 micro = texture2D(normalMap0, p * 1.63 + vec2(time * 0.011, -time * 0.009)).xyz * 2.0 - 1.0;
    float distanceFade = 1.0 - smoothstep(35.0, 160.0, distance(cameraPosition, worldSurface));
    vec2 slopes = n0.xy * 0.115 + n1.xy * 0.065 + micro.xy * 0.024 * distanceFade;
    vec3 normal = normalize(largeNormal + vec3(slopes.x, 0.0, slopes.y));
    vec2 refractUV = refractionCoord.xy / refractionCoord.w;
    vec3 bed = floorPosition(refractUV);
    float verticalDepth = max(0.0, -0.15 - bed.y);
    vec2 screenSlope = (viewMatrix * vec4(normal - vec3(0.0,1.0,0.0), 0.0)).xy;
    vec2 distortion = screenSlope * 0.028 * smoothstep(0.0, 0.65, verticalDepth);
    vec2 distortedUV = clamp(refractUV + distortion * 0.55, 0.002, 0.998);
    vec3 distortedBed = floorPosition(distortedUV);
    if (distortedBed.y > -0.16) distortedUV = refractUV;
    else bed = distortedBed;
    vec3 ray = normalize(bed - cameraPosition);
    float surfaceDistance = (-0.15 - cameraPosition.y) / min(ray.y, -0.001);
    float travel = clamp(distance(bed, cameraPosition) - surfaceDistance, 0.0, 45.0);

    // Beer-Lambert attenuation preserves a clear shallow margin and a deeper jade body.
    vec3 transmission = exp(-vec3(0.48, 0.21, 0.16) * travel);
    vec3 bottomLight = texture2D(refractionMap, distortedUV).rgb;
    vec3 body = bottomLight * transmission + scatterColor * (1.0 - transmission) * illumination;
    float ndv = clamp(dot(normal, toEye), 0.0, 1.0);
    float fresnel = 0.0204 + 0.9796 * pow(1.0 - ndv, 5.0);
    vec2 reflectUV = reflectionCoord.xy / reflectionCoord.w;
    vec3 reflected = texture2D(reflectionMap, clamp(reflectUV + vec2(-distortion.x, distortion.y), 0.002, 0.998)).rgb;
    vec3 radiance = mix(body, reflected, fresnel);

    vec3 halfDirection = normalize(sunDirection + toEye);
    float ndh = max(dot(normal, halfDirection), 0.0);
    float ndl = max(dot(normal, sunDirection), 0.0);
    float roughness2 = 0.013;
    float denom = ndh * ndh * (roughness2 - 1.0) + 1.0;
    float distribution = roughness2 / (PI * denom * denom);
    float specular = min(distribution * fresnel * ndl / max(4.0 * ndv, 0.2), 1.5);
    radiance += sunColor * specular * 0.38;
    gl_FragColor = vec4(radiance, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export async function createLake({ renderer, mobile, reducedMotion, sun }) {
  const loader = new THREE.TextureLoader();
  const normalMaps = await Promise.all(['textures/water-normal-1.jpg', 'textures/water-normal-2.jpg'].map(path => loader.loadAsync(new URL(path, import.meta.env.BASE_URL).href)));
  normalMaps.forEach(texture => { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); });
  const geometry = new THREE.PlaneGeometry(240, 240, 192, 192);
  const reflector = new Reflector(geometry, { textureWidth: 1, textureHeight: 1, multisample: mobile ? 0 : 2, clipBias: 0 });
  const refractor = new Refractor(geometry, { textureWidth: 1, textureHeight: 1, multisample: 0, clipBias: 0 });
  reflector.matrixAutoUpdate = refractor.matrixAutoUpdate = false;
  const reflectionTarget = reflector.getRenderTarget(), refractionTarget = refractor.getRenderTarget();
  refractionTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    time: { value: 0 },
    reflectionMatrix: { value: new THREE.Matrix4() },
    refractionMatrix: { value: new THREE.Matrix4() },
    inverseRefractionProjection: { value: new THREE.Matrix4() },
    refractionCameraWorld: { value: new THREE.Matrix4() },
    sunDirection: { value: sun.position.clone().normalize() },
    sunColor: { value: new THREE.Color('#ffe5bd') },
    scatterColor: { value: new THREE.Color().setRGB(.025, .072, .066) },
    illumination: { value: 1 },
  }]);
  Object.assign(uniforms, {
    reflectionMap: { value: reflectionTarget.texture }, refractionMap: { value: refractionTarget.texture },
    depthMap: { value: refractionTarget.depthTexture }, normalMap0: { value: normalMaps[0] }, normalMap1: { value: normalMaps[1] },
  });
  const material = new THREE.ShaderMaterial({ name: 'Depth-Aware Lake', uniforms, vertexShader, fragmentShader, fog: true });
  const water = new THREE.Mesh(geometry, material); water.rotation.x = -Math.PI / 2; water.position.y = -.15; water.name = '清波·深度透射水面';
  const reflectionSourceCamera = new THREE.PerspectiveCamera();
  water.onBeforeRender = (activeRenderer, scene, camera) => {
    water.visible = false;
    try {
      reflector.matrixWorld.copy(water.matrixWorld); refractor.matrixWorld.copy(water.matrixWorld);
      // Mirroring reverses screen X, including the off-axis composition offset.
      reflectionSourceCamera.copy(camera, false);
      reflectionSourceCamera.projectionMatrix.elements[8] *= -1;
      reflectionSourceCamera.projectionMatrixInverse.copy(reflectionSourceCamera.projectionMatrix).invert();
      reflector.onBeforeRender(activeRenderer, scene, reflectionSourceCamera);
      refractor.onBeforeRender(activeRenderer, scene, camera);
      uniforms.reflectionMatrix.value.copy(reflector.material.uniforms.textureMatrix.value);
      uniforms.refractionMatrix.value.copy(refractor.material.uniforms.textureMatrix.value);
      uniforms.inverseRefractionProjection.value.copy(refractor.camera.projectionMatrix).invert();
      uniforms.refractionCameraWorld.value.copy(refractor.camera.matrixWorld);
    } finally { water.visible = true; }
  };
  function resize(width, height, isMobile) {
    const maxSide = isMobile ? 1024 : 2048, ratio = Math.min(devicePixelRatio, 1.5, maxSide / Math.max(width, height));
    const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
    reflectionTarget.setSize(w, h); refractionTarget.setSize(w, h);
  }
  resize(innerWidth, innerHeight, mobile);
  return {
    water, resize,
    update(time) { uniforms.time.value = reducedMotion ? 0 : time; },
    setTheme(night) {
      uniforms.sunDirection.value.copy(sun.position).normalize();
      uniforms.sunColor.value.set(night ? '#adcbd1' : '#ffe5bd').multiplyScalar(night ? .2 : 1);
      uniforms.illumination.value = night ? .24 : 1;
    },
    stats: () => ({ time: uniforms.time.value, reflectionSize: [reflectionTarget.width, reflectionTarget.height], depthTexture: Boolean(refractionTarget.depthTexture), waveLayers: 5, absorption: [.48, .21, .16] }),
  };
}

export function createLakebed() {
  const geometry = new THREE.PlaneGeometry(94, 104, 220, 240); geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0, 12);
  const positions = geometry.attributes.position, colors = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const island = Math.hypot(x, z / .89) - 6.25;
    const bank = (Math.hypot((x - 2) / 13, (z - 23) / 12.5) - 1) * 12.5;
    const distance = Math.max(0, Math.min(island, bank));
    const depth = .34 + Math.min(4.35, distance ** 1.18 * .86);
    const noise = meadowNoise(x * 2.7, z * 2.7);
    positions.setY(i, -depth + (noise - .5) * .065 * Math.min(distance, 1));
    const color = new THREE.Color('#6b705c').multiplyScalar(.7 + noise * .38);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const bed = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  bed.name = '浅滩与沉积湖底'; bed.receiveShadow = true; return bed;
}
