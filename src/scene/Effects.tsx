import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Bloom, ChromaticAberration, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { rt } from '../tour/runtime'

/** Lens: HDR bloom, a hint of chromatic fringing at speed, film grain, vignette, filmic tone curve. */
export function Effects({ multisampling }: { multisampling: number }) {
  const ca = useRef<{ offset: THREE.Vector2 }>(null)
  const offset = useMemo(() => new THREE.Vector2(0, 0), [])
  useFrame(() => {
    const k = 0.0004 + rt.warp * 0.0016 + rt.tunnel * 0.0012
    if (ca.current) ca.current.offset.set(k, k * 0.6)
  })
  return (
    <EffectComposer multisampling={multisampling} frameBufferType={THREE.HalfFloatType}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1.05} luminanceSmoothing={0.2} radius={0.78} levels={8} />
      <ChromaticAberration ref={ca as never} offset={offset} radialModulation modulationOffset={0.35} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise blendFunction={BlendFunction.OVERLAY} opacity={0.1} />
      <Vignette offset={0.28} darkness={0.62} />
    </EffectComposer>
  )
}
