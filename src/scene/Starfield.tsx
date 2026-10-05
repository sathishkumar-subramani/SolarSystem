import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { rt } from '../tour/runtime'
import { mulberry32, useColorMap } from './assets'
import { OUTPUT } from '../shaders/common'

/** star colours by spectral class, from hot blue to cool red */
const SPECTRAL: [number, number, number][] = [
  [0.62, 0.72, 1.0],
  [0.75, 0.82, 1.0],
  [0.95, 0.96, 1.0],
  [1.0, 0.97, 0.9],
  [1.0, 0.9, 0.72],
  [1.0, 0.78, 0.55],
  [1.0, 0.62, 0.42],
]

/**
 * The home sky: a real Milky Way panorama plus ~16,000 point stars.
 * Both follow the camera so they sit at infinity. No twinkling — there is no air out here.
 */
export function Starfield() {
  const milky = useColorMap('milkyway.jpg')
  const group = useRef<THREE.Group>(null)

  const points = useMemo(() => {
    const N = 16000
    const rnd = mulberry32(20261005)
    const pos = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    const size = new Float32Array(N)
    // galactic plane used to concentrate faint stars (matches the panorama's tilt)
    const gn = new THREE.Vector3(0.0, 0.47, 0.88).normalize()
    const v = new THREE.Vector3()
    let i = 0
    while (i < N) {
      v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1)
      const l = v.lengthSq()
      if (l > 1 || l < 0.01) continue
      v.normalize()
      const lat = Math.abs(v.dot(gn))
      if (rnd() > 0.38 + 0.62 * Math.exp(-lat * lat * 9)) continue
      pos.set([v.x, v.y, v.z], i * 3)
      // magnitude distribution: many faint, very few bright
      const m = Math.pow(rnd(), 7)
      const c = SPECTRAL[Math.min(SPECTRAL.length - 1, Math.floor(Math.pow(rnd(), 0.8) * SPECTRAL.length))]
      const b = 0.14 + 0.36 * rnd() + m * 2.6
      // real star colours are subtle: mostly white with a faint tint
      const sat = 0.36
      col.set([(1 + (c[0] - 1) * sat) * b, (1 + (c[1] - 1) * sat) * b, (1 + (c[2] - 1) * sat) * b], i * 3)
      size[i] = 0.95 + rnd() * 0.5 + m * 1.9
      i++
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    return g
  }, [])

  const pointMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 1 }, uFade: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aSize;
          attribute vec3 aColor;
          uniform float uScale;
          varying vec3 vColor;
          void main(){
            vColor = aColor;
            vec4 mv = modelViewMatrix * vec4(position * 100.0, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uScale;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uFade;
          varying vec3 vColor;
          void main(){
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float a = 1.0 - smoothstep(0.1, 1.0, d);
            gl_FragColor = vec4(vColor * a * a * uFade, 1.0);
            ${OUTPUT}
          }`,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )

  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: milky }, uGain: { value: 0.5 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform float uGain;
          varying vec2 vUv;
          void main(){
            vec3 c = texture2D(uMap, vUv).rgb;
            // lift the faint dust lanes a little, keep the blacks black
            c = pow(max(c, vec3(1e-5)), vec3(0.92)) * uGain;
            gl_FragColor = vec4(c, 1.0);
            ${OUTPUT}
          }`,
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
      }),
    [milky],
  )

  useFrame((state) => {
    const g = group.current
    if (!g) return
    g.visible = rt.solar
    if (!rt.solar) return
    g.position.copy(state.camera.position)
    pointMat.uniforms.uScale.value = state.gl.getPixelRatio() * (state.size.height / 1000) * 1.15
  })

  return (
    <group ref={group}>
      <mesh material={skyMat} renderOrder={-200} rotation={[0.5, 2.2, 0.35]} scale={900} frustumCulled={false}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      <points geometry={points} material={pointMat} renderOrder={-190} frustumCulled={false} />
    </group>
  )
}
