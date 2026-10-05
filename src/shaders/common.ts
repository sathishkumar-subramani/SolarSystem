/** Shared GLSL snippets */

export const NOISE3D = /* glsl */ `
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash13(i), b = hash13(i + vec3(1,0,0)), c = hash13(i + vec3(0,1,0)), d = hash13(i + vec3(1,1,0));
  float e = hash13(i + vec3(0,0,1)), g = hash13(i + vec3(1,0,1)), h = hash13(i + vec3(0,1,1)), k = hash13(i + vec3(1,1,1));
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z);
}
float fbm(vec3 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec3(17.1, 3.7, 9.2); a *= 0.5; }
  return s;
}
float fbm3(vec3 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = p * 2.03 + vec3(17.1, 3.7, 9.2); a *= 0.5; }
  return s;
}
`

export const EQUIRECT = /* glsl */ `
vec2 dirToEquirect(vec3 d){
  return vec2(atan(d.z, abs(d.x) < 1e-7 ? 1e-7 : d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
}
`

/**
 * Sky of the galaxy on the far side of the wormhole: a dense, procedural star field (sharp at any
 * magnification, so gravitational lensing can stretch it into arcs), a warm galactic bulge and
 * dust lanes.
 */
export const DEST_SKY = /* glsl */ `
const vec3 GAL_N = vec3(0.30, 0.90, 0.316);
const vec3 GAL_CORE = vec3(-0.866, 0.117, 0.487);
vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
vec3 starLayer(vec3 d, float scale, float density){
  vec3 a = abs(d);
  vec2 uv; float face;
  if (a.x >= a.y && a.x >= a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 1.0 : 2.0; }
  else if (a.y >= a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 3.0 : 4.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 5.0 : 6.0; }
  vec2 g = uv * scale;
  // size of one pixel in cell units: stars never get smaller than that, so they do not flicker
  float w = clamp(max(length(dFdx(g)), length(dFdy(g))), 0.0, 0.42);
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec3 h = hash33(vec3(id, face * 13.0 + scale));
  vec2 off = (h.xy - 0.5) * 0.56;
  float dist = length(f - off);
  float mag = pow(fract(h.z * 91.7 + h.x * 7.3), 34.0);
  // true angular size of the star image (in tangent units), converted to cells
  float s0 = (0.00038 + 0.0005 * mag) * scale;
  float sig = max(s0, 0.62 * w);
  float core = exp(-dist * dist / (sig * sig)) * (s0 * s0) / (sig * sig);
  vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.8, 0.6), fract(h.x * 57.0 + h.y * 13.0));
  tint = mix(vec3(1.0), tint, 0.55);
  return tint * core * (0.05 + 9.0 * mag) * step(h.z, density);
}
vec3 destSky(vec3 d){
  float lat = dot(d, GAL_N);
  float band = exp(-lat * lat * 26.0);
  float wide = exp(-lat * lat * 5.0);
  float core = max(dot(d, GAL_CORE), 0.0);
  float bulge = pow(core, 9.0);
  float n1 = fbm(d * 3.1 + 2.0);
  float n2 = fbm(d * 9.0 + vec3(4.0, 1.0, 7.0));
  float dust = smoothstep(0.42, 0.72, n2) * band;
  vec3 glow = vec3(1.0, 0.82, 0.62) * (band * (0.035 + 0.075 * n1) + bulge * 0.42 + pow(core, 40.0) * 0.5);
  glow += vec3(0.42, 0.50, 0.85) * wide * 0.016 * (0.4 + n1);
  glow += vec3(0.55, 0.16, 0.22) * pow(smoothstep(0.50, 0.85, fbm(d * 2.2 + 11.0)), 2.0) * 0.035 * wide;
  vec3 stars = starLayer(d, 64.0, 0.3) * 1.6;
  stars += starLayer(d.zxy, 150.0, 0.08 + 0.26 * wide);
  stars += starLayer(d.yzx, 310.0, 0.04 + 0.4 * wide);
  vec3 col = (stars * (0.75 + 0.8 * wide) + glow) * (1.0 - 0.75 * dust);
  return col;
}
`

/** Approximate black-body colour (Krystek), normalised so that ~6500 K is white. */
export const BLACKBODY = /* glsl */ `
vec3 blackbody(float t){
  t = clamp(t, 1200.0, 30000.0);
  float u = (0.860117757 + 1.54118254e-4 * t + 1.28641212e-7 * t * t) / (1.0 + 8.42420235e-4 * t + 7.08145163e-7 * t * t);
  float v = (0.317398726 + 4.22806245e-5 * t + 4.20481691e-8 * t * t) / (1.0 - 2.89741816e-5 * t + 1.61456053e-7 * t * t);
  float x = 3.0 * u / (2.0 * u - 8.0 * v + 4.0);
  float y = 2.0 * v / (2.0 * u - 8.0 * v + 4.0);
  float z = 1.0 - x - y;
  vec3 XYZ = vec3(x / y, 1.0, z / y);
  vec3 rgb = mat3(3.2404542, -0.9692660, 0.0556434, -1.5371385, 1.8760108, -0.2040259, -0.4985314, 0.0415560, 1.0572252) * XYZ;
  rgb = max(rgb, vec3(0.0));
  return rgb / max(max(max(rgb.r, rgb.g), rgb.b), 1e-4);
}
`

/**
 * Every custom fragment shader ends with this. The first two lines matter more than they look:
 * the frame is rendered in HDR and then blurred for the bloom, and that blur spreads a single
 * NaN or infinite pixel across the whole screen — so none is ever allowed out of a shader.
 */
export const OUTPUT = /* glsl */ `
  if (isnan(gl_FragColor.r) || isnan(gl_FragColor.g) || isnan(gl_FragColor.b) || isnan(gl_FragColor.a)) gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, 64.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`
