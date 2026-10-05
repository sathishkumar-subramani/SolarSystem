import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { rt } from '../tour/runtime'
import { DEST_SKY, EQUIRECT, NOISE3D, OUTPUT } from '../shaders/common'
import { getStarTexture, useColorMap } from './assets'
import { FULLSCREEN_VERT, fullscreenGeometry, setRayUniforms } from './fullscreen'

/**
 * The transit. Inside the throat the light of both skies is smeared along the walls;
 * the far mouth starts as a point of light and opens until it is the whole sky.
 */
export function Tunnel() {
  const milky = useColorMap('milkyway.jpg')
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uStarTex: { value: getStarTexture() },
          uMilky: { value: milky },
          uTime: { value: 0 },
          uU: { value: 0 },
          uAlpha: { value: 0 },
          uTanHalf: { value: new THREE.Vector2(1, 1) },
          uCamRot: { value: new THREE.Matrix3() },
        },
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMilky;
          uniform sampler2D uStarTex;
          uniform float uTime;
          uniform float uU;
          uniform float uAlpha;
          uniform vec2 uTanHalf;
          uniform mat3 uCamRot;
          varying vec2 vP;
          ${NOISE3D}
          ${EQUIRECT}
          ${DEST_SKY}
          float mirror(float y){ return abs(fract(y * 0.5) * 2.0 - 1.0) * 0.7 + 0.15; }
          void main(){
            vec3 rd = normalize(vec3(vP * uTanHalf, -1.0));
            // the throat slowly rolls around us
            float roll = uTime * 0.04 + uU * 1.3;
            float cr = cos(roll), sr = sin(roll);
            vec2 q = vec2(cr * rd.x - sr * rd.y, sr * rd.x + cr * rd.y);
            float rxy = max(length(q), 1e-4);
            float phi = atan(q.y, abs(q.x) < 1e-6 ? 1e-6 : q.x);
            // the walls breathe: the cross-section is never a perfect circle
            float wob = 1.0 + 0.14 * sin(phi * 2.0 + uTime * 0.31 + uU * 5.0) + 0.08 * sin(phi * 3.0 - uTime * 0.23);
            float s = (-rd.z / rxy) * wob;          // distance down the tube where this ray meets the wall
            float theta = atan(rxy, -rd.z);        // angle from straight ahead

            // far mouth: a point of light that opens until it is the whole sky
            float open = clamp((uU - 0.05) / 0.9, 0.0, 1.0);
            float Lexit = 46.0 * pow(max(1.0 - open, 0.0), 2.2) + 0.02;
            float thetaM = atan(1.0, Lexit);
            float travel = uU * 150.0 + uTime * 2.4;

            // --- wall: starlight of both skies dragged out into long streaks
            float u1 = phi * 0.15915;
            vec3 st = textureLod(uStarTex, vec2(fract(u1 + 0.004 * s), mirror((s + travel) * 0.0012)), 0.0).rgb;
            st += textureLod(uStarTex, vec2(fract(u1 * 2.0 + 0.31 - 0.003 * s), mirror((s * 1.3 + travel * 1.7) * 0.0007 + 0.4)), 0.0).rgb * 0.8;
            st += textureLod(uStarTex, vec2(fract(u1 * 3.0 + 0.62), mirror((s * 0.8 + travel * 1.2) * 0.0019 + 0.9)), 0.0).rgb * 0.6;
            float along = clamp(s / max(Lexit, 1.0), 0.0, 1.0);
            vec3 tint = mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.84, 0.66), along);
            vec3 cyl = vec3(cos(phi), sin(phi), 0.0);
            float fold = fbm(cyl * 1.5 + vec3(0.0, 0.0, (s + travel) * 0.035));
            float fold2 = fbm(cyl * 3.6 + vec3(3.0, 1.0, (s + travel) * 0.09));
            // smeared glow of the galaxy we left
            vec3 smear = textureLod(uMilky, vec2(fract(u1 + 0.2), mirror((s + travel) * 0.004)), 3.0).rgb;
            vec3 wall = st * tint * 3.2;
            wall += tint * (pow(fold, 3.0) * 0.22 + pow(fold2, 5.0) * 0.3) + smear * 0.5 * (1.0 - along);
            // grazing rays look down a long column of wall: denser light towards the vanishing point
            wall *= 0.55 + 1.5 * (1.0 - smoothstep(0.04, 0.9, theta));
            // light spilling in around the exit
            float halo = exp(-max(theta - thetaM, 0.0) / (0.05 + 0.45 * thetaM));
            wall += vec3(1.0, 0.9, 0.78) * halo * 0.4 * (0.4 + open);

            // --- exit: the other galaxy, seen through a fisheye that relaxes as we arrive
            float k = clamp(theta / thetaM, 0.0, 1.0);
            float thetaOut = mix(k * 2.0, theta, pow(open, 3.0));
            vec3 dv = vec3(sin(thetaOut) * q / rxy, -cos(thetaOut));
            // undo the roll so the far sky lines up with the real one at the end
            dv.xy = vec2(cr * dv.x + sr * dv.y, -sr * dv.x + cr * dv.y);
            vec3 sky = destSky(uCamRot * dv) * mix(2.2, 1.0, open);
            float inside = 1.0 - smoothstep(thetaM * 0.95, thetaM * 1.03, theta);
            vec3 col = mix(wall, sky, inside);
            // bright rim of the mouth
            float rim = (theta - thetaM) / (0.012 + 0.03 * thetaM);
            col += vec3(0.85, 0.92, 1.0) * exp(-rim * rim) * 0.8 * (1.0 - open * open);
            // entering: a wash of light
            col += vec3(0.7, 0.82, 1.0) * (1.0 - smoothstep(0.0, 0.1, uU)) * 0.22;
            gl_FragColor = vec4(col, uAlpha);
            ${OUTPUT}
          }`,
        transparent: true,
        depthWrite: false,
        depthTest: true,
      }),
    [milky],
  )

  useFrame((state) => {
    const m = ref.current
    if (!m) return
    m.visible = rt.tunnel > 0.001
    if (!m.visible) return
    const u = mat.uniforms
    u.uTime.value = rt.time
    u.uU.value = rt.tunnelU
    u.uAlpha.value = rt.tunnel
    setRayUniforms(u as never, state.camera as THREE.PerspectiveCamera)
  })

  return <mesh ref={ref} geometry={fullscreenGeometry} material={mat} frustumCulled={false} renderOrder={900} />
}
