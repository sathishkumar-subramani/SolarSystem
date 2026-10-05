import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { BLACKHOLE } from '../data/bodies'
import { BH_POS } from '../tour/timeline'
import { rt } from '../tour/runtime'
import { BLACKBODY, DEST_SKY, EQUIRECT, NOISE3D, OUTPUT } from '../shaders/common'
import { FULLSCREEN_VERT, fullscreenGeometry, setRayUniforms } from './fullscreen'

/**
 * A non-rotating (Schwarzschild) black hole, ray-traced per pixel.
 *
 * Every view ray is integrated backwards along its null geodesic. For a photon with angular
 * momentum h around a mass with Schwarzschild radius 1 the path obeys  x'' = -1.5 h² x / r⁵,
 * which reproduces the photon sphere at 1.5 rₛ, the shadow, the Einstein ring and the image of
 * the far side of the accretion disc bent over the top of the hole. The disc is a thin plasma
 * sheet from 3 rₛ (the innermost stable orbit) outwards, coloured as a black body and shifted
 * by Doppler beaming and gravitational red-shift.
 */
export function BlackHole() {
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        defines: { STEPS: 150 },
        uniforms: {
          uTime: { value: 0 },
          uCam: { value: new THREE.Vector3() },
          uTanHalf: { value: new THREE.Vector2(1, 1) },
          uCamRot: { value: new THREE.Matrix3() },
        },
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uCam;
          uniform vec2 uTanHalf;
          uniform mat3 uCamRot;
          varying vec2 vP;
          ${NOISE3D}
          ${EQUIRECT}
          ${DEST_SKY}
          ${BLACKBODY}
          const float R_IN = 3.0;
          const float R_OUT = 15.0;

          float diskNoise(float r, float ang, float phase){
            // Keplerian shear: inner gas laps the outer gas
            float om = 2.4 * pow(r / R_IN, -1.5);
            float a = ang + om * phase;
            vec3 p = vec3(cos(a) * r, sin(a) * r, r * 0.35);
            float n = fbm(p * 0.75);
            float fine = fbm(vec3(cos(a) * r * 2.6, sin(a) * r * 2.6, r * 5.0));
            return n * 0.7 + fine * 0.45;
          }

          vec4 disk(vec3 hit, vec3 v){
            float r = length(hit.xz);
            if (r < R_IN * 0.86 || r > R_OUT) return vec4(0.0);
            float ang = atan(hit.z, hit.x);
            // flow animation without ever winding up: two phases cross-faded
            float T = uTime * 0.045;
            float f1 = fract(T), f2 = fract(T + 0.5);
            float n = mix(diskNoise(r, ang, f1 * 6.0), diskNoise(r, ang, f2 * 6.0 + 3.0), abs(2.0 * f1 - 1.0));
            float lanes = 0.72 + 0.28 * sin(r * 7.0 + n * 9.0);
            float dens = smoothstep(0.28, 0.82, n) * lanes;
            float inner = smoothstep(R_IN * 0.86, R_IN * 1.12, r);
            float outer = 1.0 - smoothstep(R_OUT * 0.55, R_OUT, r);
            float emis = pow(R_IN / r, 1.7) * inner * outer;
            // relativistic shifts
            float beta = sqrt(0.5 / r);
            vec3 vel = normalize(vec3(-hit.z, 0.0, hit.x)) * beta;
            vec3 toObs = -normalize(v);
            float gamma = 1.0 / sqrt(1.0 - beta * beta);
            float g = sqrt(max(1.0 - 1.0 / r, 0.02)) / (gamma * (1.0 - dot(vel, toObs)));
            float temp = 6800.0 * pow(R_IN / r, 0.75) * g;
            vec3 col = blackbody(temp) * emis * pow(g, 2.5) * (0.22 + 1.75 * dens) * 3.1;
            float alpha = clamp((0.25 + 1.3 * dens) * inner * outer * 1.25, 0.0, 1.0);
            return vec4(col, alpha);
          }

          void main(){
            vec3 rd = normalize(uCamRot * vec3(vP * uTanHalf, -1.0));
            vec3 p = uCam;
            vec3 v = rd;
            vec3 hv = cross(p, v);
            float h2 = dot(hv, hv);
            float rExit = max(length(uCam) * 1.05, 40.0);
            vec3 col = vec3(0.0);
            float trans = 1.0;
            bool captured = false;
            for (int i = 0; i < STEPS; i++) {
              float r2 = dot(p, p);
              float r = sqrt(r2);
              if (r < 1.0) { captured = true; break; }
              if (r > rExit && dot(p, v) > 0.0) break;
              float dt = clamp(0.11 * r, 0.035, 40.0);
              vec3 acc = -1.5 * h2 * p / (r2 * r2 * r);
              v += acc * dt;
              vec3 pn = p + v * dt;
              if (p.y * pn.y < 0.0) {
                float f = p.y / (p.y - pn.y);
                vec4 d = disk(mix(p, pn, f), v);
                col += trans * d.rgb * d.a;
                trans *= 1.0 - d.a;
                if (trans < 0.01) break;
              }
              p = pn;
            }
            // (evaluated for every pixel so the star field's screen-space derivatives stay valid)
            vec3 sky = destSky(normalize(v));
            if (!captured) col += trans * sky;
            gl_FragColor = vec4(col, 1.0);
            ${OUTPUT}
          }`,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  )

  useFrame((state) => {
    const m = ref.current
    if (!m) return
    m.visible = rt.bh && rt.tunnel < 0.999
    if (!m.visible) return
    const u = mat.uniforms
    u.uTime.value = rt.time
    ;(u.uCam.value as THREE.Vector3).copy(state.camera.position).sub(BH_POS).divideScalar(BLACKHOLE.rs)
    setRayUniforms(u as never, state.camera as THREE.PerspectiveCamera)
  })

  return <mesh ref={ref} geometry={fullscreenGeometry} material={mat} frustumCulled={false} renderOrder={-150} />
}
