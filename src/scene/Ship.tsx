import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { rt } from '../tour/runtime'
import { SHIP_URL, guardNaN, repairTangents } from './assets'
import { OUTPUT } from '../shaders/common'

const SHIP_LENGTH = 0.66
const UP = new THREE.Vector3(0, 1, 0)
/** ?shipz=-1 pulls the ship close to the camera for inspection */
const DEBUG_Z = parseFloat(new URLSearchParams(location.search).get('shipz') ?? '') || 0

/**
 * The space vehicle (modelled in Blender, exported as glTF). It rides just ahead of the camera
 * — a classic chase view — pointing along the flight path, banking into turns and lagging a
 * little behind the camera's rotation so it never feels glued to the screen.
 */
export function Ship() {
  const { scene } = useGLTF(SHIP_URL)
  const rig = useRef<THREE.Group>(null)
  const bank = useRef<THREE.Group>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const flareRef = useRef<THREE.Mesh>(null)

  // normalise the model: centre it, scale to a known length, nose towards -Z
  const { model, nozzle } = useMemo(() => {
    const root = scene.clone(true)
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    const k = SHIP_LENGTH / size.z
    const holder = new THREE.Group()
    root.position.sub(centre)
    holder.add(root)
    holder.scale.setScalar(k)
    holder.rotation.y = Math.PI // the Blender model's nose points to +Z
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mat = m.material as THREE.MeshStandardMaterial
      repairTangents(m.geometry)
      guardNaN(mat, 3)
      mat.envMapIntensity = 1.5
      mat.metalness = 0.72
      mat.side = THREE.FrontSide
      mat.needsUpdate = true
    })
    // engine exhaust sits at the tail (after the flip the tail is at +Z)
    const nozzle = new THREE.Vector3(0, (box.max.y - centre.y) * k * 0.12, (size.z / 2) * k * 0.985)
    return { model: holder, nozzle }
  }, [scene])

  const glowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uPower: { value: 0.3 }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uPower;
          uniform float uTime;
          varying vec2 vUv;
          void main(){
            // vUv.y runs from the nozzle (0) to the tip of the plume (1)
            float len = mix(0.35, 1.0, uPower);
            float y = vUv.y / len;
            float core = exp(-y * 4.5);
            float flicker = 0.9 + 0.1 * sin(uTime * 47.0 + y * 30.0) * sin(uTime * 31.0);
            float edge = pow(max(sin(vUv.x * 3.14159), 0.0), 1.5);   // brighter where the cone faces us
            vec3 col = mix(vec3(0.35, 0.6, 1.0), vec3(0.9, 0.97, 1.0), core);
            float a = core * (1.0 - smoothstep(0.75, 1.0, y)) * flicker * (0.35 + 0.65 * edge);
            gl_FragColor = vec4(col * a * (0.7 + 2.6 * uPower), 1.0);
            ${OUTPUT}
          }`,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  const flareMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uPower: { value: 0.3 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uPower;
          varying vec2 vUv;
          void main(){
            float d = length(vUv - 0.5) * 2.0;
            float a = pow(max(1.0 - d, 0.0), 2.6);
            gl_FragColor = vec4(vec3(0.6, 0.8, 1.0) * a * (0.5 + 2.4 * uPower), 1.0);
            ${OUTPUT}
          }`,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )

  const s = useMemo(
    () => ({
      offset: new THREE.Vector3(0, -0.4, -2.2),
      target: new THREE.Vector3(),
      heading: new THREE.Vector3(0, 0, -1),
      prevLook: new THREE.Vector3(0, 0, -1),
      q: new THREE.Quaternion(),
      m: new THREE.Matrix4(),
      v: new THREE.Vector3(),
      right: new THREE.Vector3(),
      yawRate: 0,
      pitchRate: 0,
      roll: 0,
      power: 0.3,
      init: false,
    }),
    [],
  )

  useEffect(() => () => void glowMat.dispose(), [glowMat])

  useFrame((state, dtRaw) => {
    const g = rig.current
    if (!g) return
    const dt = Math.min(dtRaw, 0.05)
    const cam = state.camera as THREE.PerspectiveCamera
    const t = rt.time
    const portrait = cam.aspect < 0.9

    // how fast the view is turning (for lag + banking)
    s.right.set(1, 0, 0).applyQuaternion(cam.quaternion)
    const upV = s.v.set(0, 1, 0).applyQuaternion(cam.quaternion)
    const yaw = rt.lookDir.dot(s.right) - s.prevLook.dot(s.right)
    const pitch = rt.lookDir.dot(upV) - s.prevLook.dot(upV)
    s.prevLook.copy(rt.lookDir)
    const k = 1 - Math.exp(-dt * 3.5)
    s.yawRate += (THREE.MathUtils.clamp(yaw / Math.max(dt, 1e-3), -1.2, 1.2) - s.yawRate) * k
    s.pitchRate += (THREE.MathUtils.clamp(pitch / Math.max(dt, 1e-3), -1.2, 1.2) - s.pitchRate) * k

    // where the ship sits in the frame
    const side = rt.seg.focus?.side ?? 0
    const dwell = rt.seg.kind === 'dwell' || rt.seg.kind === 'bh' || rt.seg.kind === 'outro'
    const sx = portrait ? (dwell ? 0.2 : 0) : dwell ? -side * 0.1 : 0
    s.target.set(
      sx - s.yawRate * 0.55 + Math.sin(t * 0.43) * 0.025,
      (portrait ? (dwell ? -0.08 : -0.55) : -0.5) - s.pitchRate * 0.3 + Math.sin(t * 0.61 + 1.3) * 0.02,
      (portrait ? (dwell ? -3.6 : -3.0) : -2.25) - rt.warp * 0.55,
    )
    // during the opening shots the ship is behind the camera; it sweeps into view on the dive
    const intro = rt.seg.kind === 'intro' || rt.seg.kind === 'overview' ? 1 : rt.seg.key === 'travel:sun' ? 1 - THREE.MathUtils.smoothstep(rt.u, 0.05, 0.4) : 0
    s.target.z += intro * 4.5
    s.target.y -= intro * 0.6
    g.visible = intro < 0.999
    const dbgZ = DEBUG_Z
    if (dbgZ) s.target.set(0, -0.12, dbgZ)
    if (!s.init || rt.snapNow) {
      s.offset.copy(s.target)
      s.init = true
    } else s.offset.lerp(s.target, 1 - Math.exp(-dt * 2.6))

    g.position.copy(s.offset).applyQuaternion(cam.quaternion).add(cam.position)

    // nose along the flight path, eased towards where the camera is looking
    s.heading.copy(rt.tangent).multiplyScalar(0.5).addScaledVector(rt.lookDir, 0.5).normalize()
    s.m.lookAt(s.v.set(0, 0, 0), s.heading, UP)
    s.q.setFromRotationMatrix(s.m)
    if (rt.snapNow) g.quaternion.copy(s.q)
    else g.quaternion.slerp(s.q, 1 - Math.exp(-dt * 3.0))

    if (bank.current) {
      const targetRoll = THREE.MathUtils.clamp(-s.yawRate * 1.5, -0.6, 0.6) + Math.sin(t * 0.37) * 0.035
      s.roll += (targetRoll - s.roll) * (1 - Math.exp(-dt * 3))
      bank.current.rotation.z = s.roll
      bank.current.rotation.x = THREE.MathUtils.clamp(s.pitchRate * 0.6, -0.25, 0.25) + Math.sin(t * 0.53) * 0.012
    }

    // engines
    const want = THREE.MathUtils.clamp(0.22 + rt.warp * 0.95 + (rt.tunnel > 0.5 ? 0.5 : 0), 0, 1)
    s.power += (want - s.power) * (1 - Math.exp(-dt * 2.5))
    glowMat.uniforms.uPower.value = s.power
    glowMat.uniforms.uTime.value = t
    flareMat.uniforms.uPower.value = s.power
    if (glowRef.current) {
      const sy = 0.6 + s.power * 1.6
      glowRef.current.scale.set(1, sy, 1)
      glowRef.current.position.y = 0.25 * sy
    }
    if (flareRef.current) flareRef.current.quaternion.copy(cam.quaternion).premultiply(s.q.copy(g.quaternion).invert())
  })

  return (
    <group ref={rig}>
      <group ref={bank}>
        <primitive object={model} />
        {/* exhaust plume: an open cone trailing behind the nozzle */}
        <group position={nozzle} rotation-x={Math.PI / 2}>
          <mesh ref={glowRef} material={glowMat} position={[0, 0.0, 0]} renderOrder={1000}>
            <cylinderGeometry args={[0.012, 0.034, 0.5, 24, 1, true]} />
          </mesh>
        </group>
        <mesh ref={flareRef} position={nozzle} material={flareMat} renderOrder={1001} scale={0.11}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </group>
    </group>
  )
}

useGLTF.preload(SHIP_URL)
