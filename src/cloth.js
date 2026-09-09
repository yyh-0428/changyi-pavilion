export const CLOTH_HEIGHT = 2.59;
export const CLOTH_TIE_Y = -.29;
const motion = { frequency: 2, rate: .72, drift: .44, amplitude: .08, secondary: .035 };

// CPU ties, exported vertices and the web shader share the same motion constants.
export function clothWave(y, time, phase) {
  const weight = (CLOTH_HEIGHT / 2 - y) / CLOTH_HEIGHT;
  const angle = y * motion.frequency + time * motion.rate + phase;
  const wave = Math.sin(angle) * motion.amplitude + Math.sin(time * motion.drift + phase) * motion.secondary;
  return { offset: wave * weight, slope: Math.cos(angle) * motion.frequency * motion.amplitude * weight - wave / CLOTH_HEIGHT };
}

export function clothProfile(x, y) {
  const spread = 1 - Math.exp(-(((y - CLOTH_TIE_Y) / .42) ** 2));
  return { x: x * (.20 + .74 * spread), z: Math.sin(x * 32) * .055 * (.2 + .8 * spread) + Math.sin(y * 1.2) * .06 };
}

const glsl = value => Number.isInteger(value) ? `${value}.0` : String(value);
export const clothShader = `uniform float uClothTime;
  attribute float clothPhase;
  vec2 clothWave(float y) {
    float weight = (${glsl(CLOTH_HEIGHT / 2)} - y) / ${glsl(CLOTH_HEIGHT)};
    float phase = y * ${glsl(motion.frequency)} + uClothTime * ${glsl(motion.rate)} + clothPhase;
    float wave = sin(phase) * ${glsl(motion.amplitude)} + sin(uClothTime * ${glsl(motion.drift)} + clothPhase) * ${glsl(motion.secondary)};
    return vec2(wave * weight, cos(phase) * ${glsl(motion.frequency * motion.amplitude)} * weight - wave / ${glsl(CLOTH_HEIGHT)});
  }\n`;
