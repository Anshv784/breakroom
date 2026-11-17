// Holographic foil for card faces. Iridescence follows the angle between the card and the camera
// (tilt the card and the rainbow slides), sparkles twinkle in the foil, and the strength rises
// with the card's tier, so a chase pull reads as special from across the table.
import * as THREE from "three";

const vert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  uniform sampler2D map;
  uniform float tier;
  uniform float time;
  uniform float reveal;   // 0 = dim/unrevealed, 1 = full
  uniform float glow;     // extra flash on a big pull
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;

  vec3 palette(float t) {
    // cyan -> violet -> gold -> pink, the BREAKROOM foil
    return 0.55 + 0.45 * cos(6.28318 * (vec3(1.0, 1.0, 1.0) * t + vec3(0.0, 0.33, 0.67)));
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec4 base = texture2D(map, vUv);
    float facing = dot(normalize(vN), normalize(vView));
    float strength = tier < 0.5 ? 0.05 : tier < 1.5 ? 0.13 : tier < 2.5 ? 0.22 : tier < 3.5 ? 0.32 : 0.42;
    // where the foil sits: frame + art window, less on the text band
    vec2 c = vUv - 0.5;
    float frame = smoothstep(0.40, 0.47, max(abs(c.x) * 1.05, abs(c.y) * 0.98));
    float art = step(0.30, vUv.y) * step(vUv.y, 0.85) * step(0.09, vUv.x) * step(vUv.x, 0.91);
    float mask = max(frame, art * 0.85);
    float t = facing * 1.7 + vUv.x * 0.9 + vUv.y * 0.55;
    vec3 foil = palette(t);
    float lum = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    vec3 col = base.rgb;
    col = mix(col, col * 0.7 + foil * (0.18 + lum * 0.8), strength * mask);
    // sparkle grain
    vec2 g = floor(vUv * vec2(160.0, 224.0));
    float sp = hash(g);
    float tw = pow(max(0.0, sin(sp * 40.0 + facing * 12.0)), 24.0);
    col += foil * tw * step(0.985 - strength * 0.02, sp) * strength * 2.4 * mask;
    // glancing sheen
    float sheen = pow(1.0 - abs(facing), 3.0);
    col += foil * sheen * strength * 0.6;
    col = mix(col * 0.25, col, reveal);
    col += glow * foil * 0.6;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function holoMaterial(map: THREE.Texture, tier: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      tier: { value: tier },
      time: { value: 0 },
      reveal: { value: 1 },
      glow: { value: 0 },
    },
    vertexShader: vert,
    fragmentShader: frag,
  });
}

/** Shared clock for every holo material on screen. */
export const holoClock = { t: 0 };
