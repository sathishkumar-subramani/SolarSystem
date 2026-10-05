import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { SUN } from '../data/bodies'
import { rt } from '../tour/runtime'
import { labelSlot, useColorMap } from './assets'
import { makeCoronaMaterial, makeSunMaterial } from './materials'

const CORONA_EXTENT = 7

export function Sun() {
  const map = useColorMap(SUN.texture)
  const mat = useMemo(() => makeSunMaterial(map), [map])
  const corona = useMemo(() => makeCoronaMaterial(CORONA_EXTENT), [])
  const sphere = useRef<THREE.Mesh>(null)
  const billboard = useRef<THREE.Mesh>(null)
  const slot = useMemo(() => labelSlot('sun'), [])

  useFrame((state, dt) => {
    if (!rt.solar) return
    if (sphere.current) sphere.current.rotation.y += SUN.spin * Math.min(dt, 0.1)
    if (billboard.current) billboard.current.quaternion.copy(state.camera.quaternion)
    // from far away the disc is only a few pixels: keep it a bright star rather than a dim dot
    const d = state.camera.position.length()
    const far = THREE.MathUtils.smoothstep(d, 900, 4000)
    mat.uniforms.uIntensity.value = 2.3 + 7 * far
    mat.uniforms.uDetail.value = 1 - THREE.MathUtils.smoothstep(d, 500, 1800)
    corona.uniforms.uStrength.value = 1 + 1.5 * far
    slot.pos.set(0, 0, 0)
    slot.alpha = rt.tags
    slot.radius = SUN.radius
  })

  return (
    <group>
      <mesh ref={sphere} material={mat} scale={SUN.radius} rotation-z={THREE.MathUtils.degToRad(SUN.tiltDeg)}>
        <sphereGeometry args={[1, 128, 96]} />
      </mesh>
      <mesh ref={billboard} material={corona} scale={SUN.radius * CORONA_EXTENT * 2} renderOrder={4}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  )
}
