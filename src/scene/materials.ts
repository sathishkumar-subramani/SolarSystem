import * as THREE from 'three'
import { NOISE3D, OUTPUT } from '../shaders/common'

/** Uniforms shared by every body in the Solar System act */
export const shared = {
  uTime: { value: 0 },
  uSunPos: { value: new THREE.Vector3(0, 0, 0) },
  uSunIntensity: { value: 1.55 },
}

const BODY_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const BODY_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSunPos;
uniform float uTime;
uniform float uSunIntensity;
uniform float uTerminator;
uniform float uLimb;
uniform float uLunar;
uniform vec3 uAtmoColor;
uniform float uAtmoRim;
uniform float uSunset;
uniform vec3 uShine;
uniform vec3 uTint;
#ifdef USE_BUMP
uniform sampler2D uBump;
uniform float uBumpScale;
#endif
#ifdef USE_EARTH
uniform sampler2D uNight;
uniform sampler2D uBrc;
uniform float uBumpScale;
#endif
#ifdef USE_RINGSHADOW
uniform sampler2D uRingTex;
uniform vec3 uCenter;
uniform vec3 uAxis;
uniform float uRingInner;
uniform float uRingOuter;
uniform float uRingOpacity;
#endif
#ifdef USE_OCCLUDER
uniform vec3 uOccPos;
uniform float uOccRadius;
#endif
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

vec3 perturb(vec3 N, vec3 P, vec2 dH){
  vec3 sx = dFdx(P);
  vec3 sy = dFdy(P);
  vec3 r1 = cross(sy, N);
  vec3 r2 = cross(N, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * N - grad);
}
#ifdef USE_EARTH
float earthHeight(vec2 uv, vec2 shift){
  return max(texture2D(uBrc, uv).r, smoothstep(0.12, 0.95, texture2D(uBrc, uv + shift).b) * 0.9);
}
#endif

void main(){
  vec3 Ng = normalize(vWorldNormal);
  vec3 N = Ng;
  vec3 L = normalize(uSunPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 albedo = texture2D(uMap, vUv).rgb * uTint;

  float clouds = 0.0;
  // height differences are taken between neighbouring pixels in texture space, so the relief
  // stays smooth however far the camera zooms in
  vec2 dUx = dFdx(vUv);
  vec2 dUy = dFdy(vUv);
  float seam = step(abs(dUx.x) + abs(dUy.x), 0.2);
  #ifdef USE_BUMP
    float h0 = texture2D(uBump, vUv).r;
    vec2 dH = vec2(texture2D(uBump, vUv + dUx).r - h0, texture2D(uBump, vUv + dUy).r - h0) * uBumpScale * seam;
    N = perturb(N, vWorldPos, dH);
  #endif
  #ifdef USE_EARTH
    vec3 brc = texture2D(uBrc, vUv).rgb;
    vec2 shift = vec2(uTime * 0.0009, 0.0);
    clouds = smoothstep(0.12, 0.95, texture2D(uBrc, vUv + shift).b);
    float h0 = max(brc.r, clouds * 0.9);
    vec2 dH = vec2(earthHeight(vUv + dUx, shift) - h0, earthHeight(vUv + dUy, shift) - h0) * uBumpScale * seam;
    N = perturb(N, vWorldPos, dH);
  #endif

  float ndlG = dot(Ng, L);
  float ndl = dot(N, L);
  float ndv = max(dot(N, V), 1e-3);

  // diffuse: wrapped Lambert for bodies with air, Lommel-Seeliger for bare regolith
  float diff = clamp((ndl + uTerminator) / (1.0 + uTerminator), 0.0, 1.0);
  float pl = max(ndl, 0.0);
  float ls = min(2.0 * pl / (pl + ndv), 1.5) * smoothstep(0.0, 0.1, ndlG);
  diff = mix(diff, ls, uLunar);
  diff *= smoothstep(-uTerminator - 0.05, 0.06, ndlG);
  if (uLimb > 0.0) diff *= pow(max(dot(Ng, V), 1e-3), uLimb);

  float shadow = 1.0;
  #ifdef USE_RINGSHADOW
    float denom = dot(L, uAxis);
    if (abs(denom) > 1e-4) {
      float tt = dot(uCenter - vWorldPos, uAxis) / denom;
      if (tt > 0.0) {
        vec3 hit = vWorldPos + L * tt;
        float ru = (length(hit - uCenter) - uRingInner) / (uRingOuter - uRingInner);
        if (ru > 0.0 && ru < 1.0) shadow *= 1.0 - texture2D(uRingTex, vec2(ru, 0.5)).a * uRingOpacity * 0.92;
      }
    }
  #endif
  #ifdef USE_OCCLUDER
    vec3 oc = vWorldPos - uOccPos;
    float ob = dot(oc, L);
    float disc = ob * ob - (dot(oc, oc) - uOccRadius * uOccRadius);
    if (ob < 0.0 && disc > 0.0) shadow *= 1.0 - smoothstep(0.0, uOccRadius * uOccRadius * 0.08, disc);
  #endif

  vec3 col = albedo * diff * shadow * uSunIntensity;

  #ifdef USE_EARTH
    // oceans glint, land does not
    float ocean = 1.0 - smoothstep(0.28, 0.5, brc.g);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 90.0) * ocean * (1.0 - clouds) * step(0.0, ndlG);
    col += vec3(1.0, 0.92, 0.78) * spec * 0.9 * shadow * uSunIntensity;
    // cloud deck
    float cdiff = clamp((ndl + 0.22) / 1.22, 0.0, 1.0) * smoothstep(-0.2, 0.1, ndlG);
    col *= 1.0 - 0.3 * clouds;
    col = mix(col, vec3(0.96, 0.97, 1.0) * cdiff * shadow * uSunIntensity, clouds * 0.94);
    // city lights
    float nightW = 1.0 - smoothstep(-0.22, 0.06, ndlG);
    vec3 night = texture2D(uNight, vUv).rgb;
    col += night * night * vec3(1.0, 0.78, 0.48) * 2.6 * nightW * (1.0 - clouds * 0.85);
  #endif

  // light scattered by the atmosphere, strongest along the limb
  float fres = pow(1.0 - max(dot(Ng, V), 0.0), 3.2);
  float dayWide = smoothstep(-0.28, 0.42, ndlG);
  col += uAtmoColor * uAtmoRim * (fres * 0.85 + 0.05) * dayWide * shadow * uSunIntensity;
  // warm band where the sun is on the horizon
  float term = smoothstep(-0.14, 0.0, ndlG) * (1.0 - smoothstep(0.0, 0.32, ndlG));
  col *= mix(vec3(1.0), vec3(1.22, 0.74, 0.46), term * uSunset);
  col += albedo * uShine;

  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT}
}
`

export type BodyMatOpts = {
  map: THREE.Texture
  bump?: THREE.Texture
  bumpScale?: number
  earth?: { night: THREE.Texture; brc: THREE.Texture }
  terminator?: number
  limb?: number
  lunar?: number
  atmoColor?: THREE.ColorRepresentation
  atmoRim?: number
  sunset?: number
  shine?: number
  tint?: THREE.ColorRepresentation
  ringShadow?: { tex: THREE.Texture; center: THREE.Vector3; axis: THREE.Vector3; inner: number; outer: number; opacity: number }
  occluder?: { pos: THREE.Vector3; radius: number }
}

export function makeBodyMaterial(o: BodyMatOpts) {
  const defines: Record<string, string> = {}
  const uniforms: Record<string, THREE.IUniform> = {
    uMap: { value: o.map },
    uSunPos: shared.uSunPos,
    uTime: shared.uTime,
    uSunIntensity: shared.uSunIntensity,
    uTerminator: { value: o.terminator ?? 0.0 },
    uLimb: { value: o.limb ?? 0.0 },
    uLunar: { value: o.lunar ?? 0.0 },
    uAtmoColor: { value: new THREE.Color(o.atmoColor ?? '#000000') },
    uAtmoRim: { value: o.atmoRim ?? 0.0 },
    uSunset: { value: o.sunset ?? 0.0 },
    uShine: { value: new THREE.Color(1, 1, 1).multiplyScalar(o.shine ?? 0.004) },
    uTint: { value: new THREE.Color(o.tint ?? '#ffffff') },
  }
  if (o.earth) {
    defines.USE_EARTH = ''
    uniforms.uNight = { value: o.earth.night }
    uniforms.uBrc = { value: o.earth.brc }
    uniforms.uBumpScale = { value: o.bumpScale ?? 0.05 }
  } else if (o.bump) {
    defines.USE_BUMP = ''
    uniforms.uBump = { value: o.bump }
    uniforms.uBumpScale = { value: o.bumpScale ?? 0.05 }
  }
  if (o.ringShadow) {
    defines.USE_RINGSHADOW = ''
    uniforms.uRingTex = { value: o.ringShadow.tex }
    uniforms.uCenter = { value: o.ringShadow.center }
    uniforms.uAxis = { value: o.ringShadow.axis }
    uniforms.uRingInner = { value: o.ringShadow.inner }
    uniforms.uRingOuter = { value: o.ringShadow.outer }
    uniforms.uRingOpacity = { value: o.ringShadow.opacity }
  }
  if (o.occluder) {
    defines.USE_OCCLUDER = ''
    uniforms.uOccPos = { value: o.occluder.pos }
    uniforms.uOccRadius = { value: o.occluder.radius }
  }
  return new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, uniforms, defines })
}

// ---------------------------------------------------------------- atmosphere shell
const ATMO_FRAG = /* glsl */ `
uniform vec3 uCenter;
uniform float uRadius;
uniform float uHeight;
uniform vec3 uColor;
uniform float uStrength;
uniform float uSunset;
uniform vec3 uSunPos;
uniform float uSunIntensity;
varying vec3 vWorldPos;
void main(){
  vec3 rd = normalize(vWorldPos - cameraPosition);
  vec3 oc = cameraPosition - uCenter;
  float tca = -dot(oc, rd);
  if (tca < 0.0) discard;
  vec3 closest = oc + rd * tca;
  float b = length(closest);
  float h = (b - uRadius) / (uHeight * uRadius);
  // exponential falloff above the limb, thin haze over the disc just inside it
  float a = h >= 0.0 ? exp(-h) - 0.0025 : pow(clamp(b / uRadius, 0.0, 1.0), 9.0);
  a = max(a, 0.0);
  vec3 n = normalize(closest);
  vec3 L = normalize(uSunPos - uCenter);
  float sun = dot(n, L);
  float lit = smoothstep(-0.38, 0.5, sun);
  // forward scattering when the sun is behind the planet
  float fwd = pow(max(dot(rd, L), 0.0), 8.0);
  vec3 col = uColor * (1.0 + 2.2 * fwd);
  float term = smoothstep(-0.45, -0.05, sun) * (1.0 - smoothstep(-0.05, 0.4, sun));
  col = mix(col, vec3(1.0, 0.5, 0.24) * (0.7 + 1.6 * fwd), term * uSunset);
  gl_FragColor = vec4(col * a * lit * uStrength * uSunIntensity * 0.62, 1.0);
  ${OUTPUT}
}
`
const WORLD_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
export const ATMO_EXTENT = 6.0 // shell radius = R * (1 + ATMO_EXTENT * height)

export function makeAtmosphereMaterial(o: { center: THREE.Vector3; radius: number; height: number; color: THREE.ColorRepresentation; strength: number; sunset?: number }) {
  return new THREE.ShaderMaterial({
    vertexShader: WORLD_VERT,
    fragmentShader: ATMO_FRAG,
    uniforms: {
      uCenter: { value: o.center },
      uRadius: { value: o.radius },
      uHeight: { value: o.height },
      uColor: { value: new THREE.Color(o.color) },
      uStrength: { value: o.strength },
      uSunset: { value: o.sunset ?? 0 },
      uSunPos: shared.uSunPos,
      uSunIntensity: shared.uSunIntensity,
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

// ---------------------------------------------------------------- rings
const RING_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec2 vLocal;
void main(){
  vLocal = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const RING_FRAG = /* glsl */ `
uniform sampler2D uRingTex;
uniform vec3 uCenter;
uniform vec3 uAxis;
uniform float uPlanetRadius;
uniform float uInner;
uniform float uOuter;
uniform float uOpacity;
uniform vec3 uSunPos;
uniform float uSunIntensity;
varying vec3 vWorldPos;
varying vec2 vLocal;
${NOISE3D}
void main(){
  float r = length(vLocal);
  float u = (r - uInner) / (uOuter - uInner);
  if (u < 0.0 || u > 1.0) discard;
  vec4 tex = texture2D(uRingTex, vec2(u, 0.5));
  // fine grooves below the texture resolution
  float groove = 0.93 + 0.14 * vnoise(vec3(r / uPlanetRadius * 70.0, 0.0, 0.0));
  float density = clamp(tex.a * groove, 0.0, 1.0);
  vec3 L = normalize(uSunPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float sunSide = dot(L, uAxis);
  float viewSide = dot(V, uAxis);
  float sameSide = step(0.0, sunSide * viewSide);
  // lit face reflects; the far face only shows light filtering through thin parts
  float reflectAmt = 0.62 + 0.38 * sqrt(abs(sunSide));
  float transmit = 0.55 * (1.0 - density) + 0.06;
  float lightAmt = mix(transmit, reflectAmt, sameSide);
  // opposition brightening when the sun is behind the camera
  lightAmt *= 1.0 + 0.25 * pow(max(dot(V, L), 0.0), 6.0);
  // shadow of the planet across the rings
  vec3 oc = vWorldPos - uCenter;
  float ob = dot(oc, L);
  float disc = ob * ob - (dot(oc, oc) - uPlanetRadius * uPlanetRadius);
  float shadow = 1.0;
  if (ob < 0.0 && disc > 0.0) shadow = 1.0 - 0.985 * smoothstep(0.0, uPlanetRadius * uPlanetRadius * 0.035, disc);
  float edge = smoothstep(0.0, 0.006, u) * smoothstep(1.0, 0.994, u);
  vec3 ice = mix(vec3(dot(tex.rgb, vec3(0.333))), tex.rgb, 0.8);
  gl_FragColor = vec4(ice * lightAmt * shadow * uSunIntensity * 0.74, density * uOpacity * edge);
  ${OUTPUT}
}
`
export function makeRingMaterial(o: { tex: THREE.Texture; center: THREE.Vector3; axis: THREE.Vector3; planetRadius: number; inner: number; outer: number; opacity: number }) {
  return new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uRingTex: { value: o.tex },
      uCenter: { value: o.center },
      uAxis: { value: o.axis },
      uPlanetRadius: { value: o.planetRadius },
      uInner: { value: o.inner },
      uOuter: { value: o.outer },
      uOpacity: { value: o.opacity },
      uSunPos: shared.uSunPos,
      uSunIntensity: shared.uSunIntensity,
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
}

/** Narrow dark rings (Uranus) and faint dusty rings (Neptune), painted into a 1-D strip. */
export function makeProceduralRingTexture(kind: 'uranus' | 'neptune', inner: number, outer: number) {
  const W = 1024
  const data = new Uint8Array(W * 4)
  const put = (radius: number, width: number, alpha: number, shade: number) => {
    const c = ((radius - inner) / (outer - inner)) * W
    const w = Math.max((width / (outer - inner)) * W, 1.2)
    for (let i = Math.max(0, Math.floor(c - w * 3)); i < Math.min(W, Math.ceil(c + w * 3)); i++) {
      const g = Math.exp(-Math.pow((i - c) / w, 2))
      const a = alpha * g * 255
      if (a > data[i * 4 + 3]) {
        data[i * 4] = shade * 255
        data[i * 4 + 1] = shade * 255 * 0.98
        data[i * 4 + 2] = shade * 255 * 0.96
        data[i * 4 + 3] = a
      }
    }
  }
  if (kind === 'uranus') {
    // 6, 5, 4, alpha, beta, eta, gamma, delta, lambda, epsilon (radii in planet radii)
    const rings: [number, number, number][] = [
      [1.637, 0.002, 0.35], [1.652, 0.002, 0.35], [1.666, 0.002, 0.4], [1.75, 0.004, 0.7], [1.786, 0.004, 0.7],
      [1.846, 0.002, 0.45], [1.863, 0.003, 0.65], [1.89, 0.003, 0.65], [1.957, 0.002, 0.3], [2.0, 0.012, 1.0],
    ]
    rings.forEach(([r, w, a]) => put(r, w, a, 0.42))
  } else {
    // Galle, Le Verrier, Lassell (broad sheet), Arago, Adams
    put(1.692, 0.03, 0.18, 0.5)
    put(2.148, 0.004, 0.6, 0.55)
    put(2.24, 0.07, 0.14, 0.5)
    put(2.32, 0.003, 0.3, 0.55)
    put(2.542, 0.005, 0.85, 0.6)
  }
  const tex = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

// ---------------------------------------------------------------- the Sun
const SUN_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uIntensity;
uniform float uDetail;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObj;
${NOISE3D}
void main(){
  vec3 n = normalize(vObj);
  float t = uTime * 0.03;
  // slow convective churn + granulation (faded out with distance so it never aliases)
  float g1 = fbm(n * 4.0 + vec3(0.0, t, t * 0.6));
  float g2 = fbm3(n * 34.0 + vec3(t * 2.0, -t, 0.0));
  vec3 tex = texture2D(uMap, vUv + 0.005 * vec2(g1 - 0.5, g1 - 0.5)).rgb;
  float lum = dot(tex, vec3(0.3, 0.55, 0.15));
  // photosphere: deep orange in the cooler lanes, yellow-white in the active regions
  vec3 base = mix(vec3(0.92, 0.27, 0.03), vec3(1.0, 0.66, 0.22), smoothstep(0.22, 0.68, lum));
  base = mix(base, vec3(1.0, 0.92, 0.72), smoothstep(0.66, 1.0, lum + 0.2 * (g1 - 0.5)));
  float cell = mix(1.0, 0.74 + 0.52 * g2, uDetail);
  vec3 col = base * (0.5 + 0.95 * lum) * cell * (0.85 + 0.3 * g1);
  // limb darkening: the edge of the disc is cooler and redder
  vec3 V = normalize(cameraPosition - vWorldPos);
  float mu = max(dot(normalize(vWorldNormal), V), 0.0);
  col *= 0.34 + 0.66 * pow(mu, 0.6);
  col = mix(col * vec3(1.0, 0.55, 0.25), col, smoothstep(0.0, 0.6, mu));
  gl_FragColor = vec4(col * uIntensity, 1.0);
  ${OUTPUT}
}
`
const SUN_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObj;
void main(){
  vUv = uv;
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
export function makeSunMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: SUN_FRAG,
    uniforms: { uMap: { value: map }, uTime: shared.uTime, uIntensity: { value: 2.3 }, uDetail: { value: 1 } },
  })
}

const CORONA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uExtent;
uniform float uStrength;
varying vec2 vUv;
${NOISE3D}
void main(){
  vec2 p = (vUv - 0.5) * 2.0 * uExtent;   // in solar radii
  float r = length(p);
  if (r < 0.985) discard;
  float ang = atan(p.y, p.x);
  vec3 q = vec3(cos(ang), sin(ang), 0.0);
  float rays = fbm(q * 3.0 + vec3(0.0, 0.0, uTime * 0.02 + r * 0.25));
  float fine = fbm(q * 11.0 + vec3(3.0, 1.0, -uTime * 0.03 + r * 0.6));
  float streamer = 0.45 + 0.9 * rays + 0.35 * fine;
  float d = max(r - 1.0, 0.0);
  float inner = exp(-d * 11.0) * 1.3;                 // chromosphere rim
  float mid = pow(1.0 / r, 3.6) * 0.42 * streamer;    // K-corona
  float far = pow(1.0 / r, 2.0) * 0.022;               // soft outer glow
  float fade = smoothstep(uExtent, uExtent * 0.55, r);
  vec3 col = vec3(1.0, 0.62, 0.3) * inner + vec3(1.0, 0.86, 0.66) * mid + vec3(1.0, 0.8, 0.6) * far;
  gl_FragColor = vec4(col * fade * uStrength, 1.0);
  ${OUTPUT}
}
`
const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
export function makeCoronaMaterial(extent: number) {
  return new THREE.ShaderMaterial({
    vertexShader: UV_VERT,
    fragmentShader: CORONA_FRAG,
    uniforms: { uTime: shared.uTime, uExtent: { value: extent }, uStrength: { value: 1.0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}
