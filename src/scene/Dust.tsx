import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { rt } from '../tour/runtime'
import { mulberry32 } from './assets'
import { OUTPUT } from '../shaders/common'

const BOX = 90

/**
 * Interplanetary dust. The grains are fixed in space (wrapped into a box around the camera), so
 * at cruising speed they stretch into short streaks along the direction of travel — the only
 * cue for speed in a place with nothing else nearby.
 */
export function Dust() {
  const ref = useRef<THREE.LineSegments>(null)
  const geo = useMemo(() => {
    const N = 520
    const rnd = mulberry32(555)
    const seed = new Float32Array(N * 2 * 3)
    const end = new Float32Array(N * 2)
    for (let i = 0; i < N; i++) {
      const x = rnd(), y = rnd(), z = rnd()
      seed.set([x, y, z, x, y, z], i * 6)
      end[i * 2] = 0
      end[i * 2 + 1] = 1
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(seed, 3))
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uCam: { value: new THREE.Vector3() }, uStreak: { value: new THREE.Vector3() }, uAlpha: { value: 0 }, uBox: { value: BOX } },
        vertexShader: /* glsl */ `
          attribute float aEnd;
          uniform vec3 uCam;
          uniform vec3 uStreak;
          uniform float uBox;
          varying float vFade;
          void main(){
            vec3 p = (fract(position - uCam / uBox) - 0.5) * uBox + uCam;
            p -= uStreak * aEnd;
            vec4 mv = viewMatrix * vec4(p, 1.0);
            float d = length(mv.xyz);
            vFade = smoothstep(uBox * 0.5, uBox * 0.2, d) * smoothstep(1.5, 6.0, d) * (1.0 - aEnd * 0.85);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uAlpha;
          varying float vFade;
          void main(){
            gl_FragColor = vec4(vec3(0.8, 0.88, 1.0) * vFade * uAlpha, 1.0);
            ${OUTPUT}
          }`,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  const dir = useMemo(() => new THREE.Vector3(), [])

  useFrame((state) => {
    const m = ref.current
    if (!m) return
    const a = rt.tunnel > 0.5 ? 0 : THREE.MathUtils.smoothstep(rt.warp, 0.05, 0.6)
    m.visible = a > 0.002
    if (!m.visible) return
    mat.uniforms.uCam.value.copy(state.camera.position)
    dir.copy(rt.tangent).multiplyScalar(2 + rt.warp * 16)
    mat.uniforms.uStreak.value.copy(dir)
    mat.uniforms.uAlpha.value = a * 0.55
  })

  return <lineSegments ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={950} />
}
