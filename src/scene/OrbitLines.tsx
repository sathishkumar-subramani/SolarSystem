import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { PLANETS } from '../data/bodies'
import { PLANET_POS } from '../tour/timeline'
import { rt } from '../tour/runtime'

/** Orbit guides and position markers, shown only in the opening overview. */
export function OrbitLines() {
  const group = useRef<THREE.Group>(null)
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#9fb4d8', transparent: true, opacity: 0.25, depthWrite: false }), [])
  const dotMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uFade: { value: 1 }, uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute vec3 aColor;
          uniform float uScale;
          varying vec3 vColor;
          void main(){
            vColor = aColor;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 5.0 * uScale;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uFade;
          varying vec3 vColor;
          void main(){
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float a = smoothstep(1.0, 0.55, d) * uFade;
            gl_FragColor = vec4(vColor, a);
          }`,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  const lines = useMemo(
    () =>
      PLANETS.map((p) => {
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 360; i++) {
          const a = (i / 360) * Math.PI * 2
          pts.push(new THREE.Vector3(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit))
        }
        return new THREE.BufferGeometry().setFromPoints(pts)
      }),
    [],
  )
  const dots = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos: number[] = []
    const col: number[] = []
    for (const p of PLANETS) {
      const c = PLANET_POS[p.id]
      pos.push(c.x, c.y, c.z)
      const k = new THREE.Color(p.accent)
      col.push(k.r, k.g, k.b)
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3))
    return g
  }, [])

  useFrame((state) => {
    const g = group.current
    if (!g) return
    g.visible = rt.solar && rt.overview > 0.004
    lineMat.opacity = 0.3 * rt.overview
    dotMat.uniforms.uFade.value = rt.overview
    dotMat.uniforms.uScale.value = state.gl.getPixelRatio()
  })

  return (
    <group ref={group}>
      {lines.map((geo, i) => (
        <lineLoop key={i} geometry={geo} material={lineMat} />
      ))}
      <points geometry={dots} material={dotMat} frustumCulled={false} />
    </group>
  )
}
