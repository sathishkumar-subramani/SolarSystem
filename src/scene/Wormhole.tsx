import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { WORMHOLE } from '../data/bodies'
import { WORMHOLE_POS } from '../tour/timeline'
import { rt } from '../tour/runtime'
import { DEST_SKY, EQUIRECT, NOISE3D, OUTPUT } from '../shaders/common'
import { getStarTexture, labelSlot, useColorMap } from './assets'

const SHELL = 1.9 // lensing halo extends to this many throat radii

/**
 * A traversable wormhole as general relativity predicts it would look: not a funnel but a sphere —
 * a "crystal ball" in which the whole sky of the far side is visible, squeezed towards the rim,
 * with the home sky bent into an Einstein ring around it.
 */
export function Wormhole() {
  const milky = useColorMap('milkyway.jpg')
  const ref = useRef<THREE.Mesh>(null)
  const slot = useMemo(() => labelSlot('wormhole'), [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uCenter: { value: WORMHOLE_POS },
          uRadius: { value: WORMHOLE.radius },
          uShell: { value: SHELL },
          uStarTex: { value: getStarTexture() },
          uMilky: { value: milky },
          uTime: { value: 0 },
          uFade: { value: 1 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorldPos;
          void main(){
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCenter;
          uniform float uRadius;
          uniform float uShell;
          uniform sampler2D uMilky;
          uniform sampler2D uStarTex;
          uniform float uTime;
          uniform float uFade;
          varying vec3 vWorldPos;
          ${NOISE3D}
          ${EQUIRECT}
          ${DEST_SKY}
          vec3 homeSky(vec3 d){
            vec2 uv = dirToEquirect(d);
            vec3 c = pow(max(textureLod(uMilky, uv, 0.0).rgb, vec3(1e-5)), vec3(0.92)) * 0.5;
            return c + textureLod(uStarTex, vec2(uv.x + 0.5, uv.y), 0.0).rgb * 0.9;
          }
          void main(){
            vec3 rd = normalize(vWorldPos - cameraPosition);
            vec3 oc = cameraPosition - uCenter;
            float tca = -dot(oc, rd);
            if (tca < 0.0) discard;
            vec3 closest = oc + rd * tca;
            float b = length(closest) / uRadius;
            vec3 axis = normalize(-oc);
            vec3 radial = b > 1e-4 ? normalize(closest) : vec3(0.0);
            // through the throat: the far sky, more and more compressed towards the rim
            float theta = pow(min(b, 1.0), 1.7) * 2.7 + min(b, 1.0) * 0.25;
            float spin = uTime * 0.01;
            vec3 dFar = cos(theta) * axis + sin(theta) * radial;
            float cs = cos(spin), sn = sin(spin);
            dFar = vec3(cs * dFar.x - sn * dFar.z, dFar.y, sn * dFar.x + cs * dFar.z);
            vec3 farSky = destSky(dFar) * 1.35;
            // light from our own side that has looped once around the throat
            float phi = 3.14159 - (1.0 - min(b, 1.0)) * 9.0;
            vec3 wrapSky = homeSky(cos(phi) * axis + sin(phi) * radial);
            // outside the throat: our own sky, deflected towards the hole
            float ang = -1.25 / max(b * b * b, 1.0);
            vec3 nearSky = homeSky(normalize(rd * cos(ang) + radial * sin(ang)));
            vec3 col;
            float alpha = 1.0;
            if (b < 1.0) {
              col = mix(farSky, wrapSky, smoothstep(0.9, 1.0, b) * 0.9);
            } else {
              col = nearSky;
              alpha = 1.0 - smoothstep(1.25, uShell, b);
            }
            // photon ring at the throat's edge
            float ring = (b - 1.0) / 0.009;
            col += vec3(0.75, 0.86, 1.0) * exp(-ring * ring) * 0.5;
            gl_FragColor = vec4(col, alpha * uFade);
            ${OUTPUT}
          }`,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    [milky],
  )

  useFrame((state) => {
    if (!ref.current) return
    ref.current.visible = rt.solar
    mat.uniforms.uTime.value = rt.time
    // from across the Solar System it is far too small and faint to notice
    const d = state.camera.position.distanceTo(WORMHOLE_POS)
    mat.uniforms.uFade.value = 1 - THREE.MathUtils.smoothstep(d, 1300, 2600)
    ref.current.visible = rt.solar && d < 2600
    slot.pos.copy(WORMHOLE_POS)
    slot.alpha = 0
    slot.radius = WORMHOLE.radius
  })

  return (
    <mesh ref={ref} position={WORMHOLE_POS} material={mat} scale={WORMHOLE.radius * SHELL} renderOrder={5}>
      <sphereGeometry args={[1, 64, 48]} />
    </mesh>
  )
}
