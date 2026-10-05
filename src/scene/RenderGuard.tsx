import { useEffect } from 'react'
import * as THREE from 'three'
import { addAfterEffect, useThree } from '@react-three/fiber'
import { useHud } from '../tour/store'

const params = new URLSearchParams(location.search)
/** ?simulate=black | dead — used to test the watchdog itself */
export const SIMULATE = params.get('simulate') ?? ''
export const FORCE_SAFE = params.get('safe') === '1'

function describe(gl: THREE.WebGLRenderer, extra: string[] = []) {
  const c = gl.getContext() as WebGL2RenderingContext
  const lines: string[] = []
  try {
    const dbg = c.getExtension('WEBGL_debug_renderer_info')
    lines.push(`GPU: ${dbg ? c.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER)}`)
    lines.push(`WebGL: ${c.getParameter(c.VERSION)}`)
    lines.push(
      `Float targets: ${c.getExtension('EXT_color_buffer_float') ? 'yes' : 'NO'} · half-float: ${c.getExtension('EXT_color_buffer_half_float') ? 'yes' : 'no'} · MSAA max: ${c.getParameter(c.MAX_SAMPLES)} · max texture: ${c.getParameter(c.MAX_TEXTURE_SIZE)}`,
    )
    lines.push(`Context lost: ${c.isContextLost() ? 'YES' : 'no'} · GL error: 0x${c.getError().toString(16)}`)
  } catch (e) {
    lines.push(`WebGL query failed: ${String(e)}`)
  }
  lines.push(`Pixel ratio: ${window.devicePixelRatio} · canvas: ${gl.domElement.width}×${gl.domElement.height} · mode: ${useHud.getState().safe ? 'compatibility' : 'full'}`)
  lines.push(...extra)
  lines.push(navigator.userAgent)
  return lines.join('\n')
}

/**
 * Watches the output of the renderer on real hardware.
 *
 *  - If the picture is completely black although the scene has loaded, the HDR post-processing
 *    chain is switched off (compatibility mode). If it is still black, a diagnostic panel says why.
 *  - If the browser takes the WebGL context away (GPU reset, driver crash), it says so and resumes
 *    when the context comes back.
 *  - Shader compile errors are reported instead of silently leaving a hole in the scene.
 */
export function RenderGuard() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const canvas = gl.domElement
    const hud = useHud.getState
    let shaderError = ''

    gl.debug.onShaderError = (ctx, program, vs, fs) => {
      const log = [ctx.getProgramInfoLog(program), ctx.getShaderInfoLog(vs), ctx.getShaderInfoLog(fs)].filter(Boolean).join('\n').trim()
      console.error('Shader failed to compile:\n' + log)
      if (shaderError) return
      shaderError = log.slice(0, 900) || 'unknown shader error'
      if (!hud().diag) hud().set({ diag: { kind: 'shader', details: describe(gl, ['Shader error: ' + shaderError]) } })
    }

    const onLost = (e: Event) => {
      e.preventDefault() // lets the browser hand the context back
      hud().set({ diag: { kind: 'lost', details: describe(gl, shaderError ? ['Shader error: ' + shaderError] : []) } })
    }
    const onRestored = () => {
      if (hud().diag?.kind === 'lost') hud().set({ diag: null })
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    if (FORCE_SAFE) hud().set({ safe: 1 })

    // --- blank-frame watchdog: look at what actually reached the canvas
    const probe = document.createElement('canvas')
    probe.width = 240
    probe.height = 135
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    let next = 0 // time of the next look (ms); 0 = not armed yet
    let black = 0
    let lit = 0
    let finished = false

    // --- a script error thrown inside the render loop also ends in a black canvas (the frame is
    // never drawn). Report it, but only when errors keep coming AND frames have stopped arriving.
    let lastFrame = performance.now()
    let errors = 0
    const onError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const msg = 'message' in e ? `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})` : String(e.reason)
      errors++
      if (errors >= 5 && hud().ready && !hud().diag && performance.now() - lastFrame > 3000)
        hud().set({ diag: { kind: 'blank', details: describe(gl, ['Script error in the render loop: ' + msg.slice(0, 400)]) } })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onError)

    const stop = addAfterEffect(() => {
      lastFrame = performance.now()
      if (finished || !ctx) return
      const s = hud()
      if (!s.ready || document.hidden || gl.getContext().isContextLost()) return
      if (SIMULATE === 'dead') scene.visible = false
      const now = performance.now()
      if (next === 0) next = now + 1500 // let things settle after the loading screen
      if (now < next) return
      next = now + 450
      let count = 0
      try {
        ctx.imageSmoothingQuality = 'high'
        ctx.clearRect(0, 0, probe.width, probe.height)
        ctx.drawImage(canvas, 0, 0, probe.width, probe.height)
        const d = ctx.getImageData(0, 0, probe.width, probe.height).data
        for (let i = 0; i < d.length; i += 4) if (d[i] > 3 || d[i + 1] > 3 || d[i + 2] > 3) count++
      } catch {
        finished = true
        return
      }
      if (count >= 3) {
        black = 0
        if (++lit >= 6) finished = true // healthy: stop looking, it costs a read-back
        return
      }
      lit = 0
      if (++black < 4) return
      black = 0
      if (s.safe === 0) {
        console.warn('Black frames detected — switching to compatibility rendering.\n' + describe(gl))
        s.set({ safe: 1, diag: { kind: 'compat', details: describe(gl, shaderError ? ['Shader error: ' + shaderError] : []) } })
        next = now + 2000
      } else {
        console.error('Rendering produces only black frames.\n' + describe(gl))
        s.set({ diag: { kind: 'blank', details: describe(gl, shaderError ? ['Shader error: ' + shaderError] : []) } })
        finished = true
      }
    })

    return () => {
      stop()
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onError)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      gl.debug.onShaderError = null
    }
  }, [gl, scene])

  return null
}
