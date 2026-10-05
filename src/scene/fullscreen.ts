import * as THREE from 'three'

/** One big triangle covering the screen, drawn at the far plane. */
export const fullscreenGeometry = (() => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  return g
})()

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vP;
void main(){
  vP = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`

const m4 = new THREE.Matrix4()
/** fills the uniforms needed to rebuild a world-space view ray in the fragment shader */
export function setRayUniforms(u: { uTanHalf: THREE.IUniform; uCamRot?: THREE.IUniform }, camera: THREE.PerspectiveCamera) {
  const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  ;(u.uTanHalf.value as THREE.Vector2).set(th * camera.aspect, th)
  if (u.uCamRot) (u.uCamRot.value as THREE.Matrix3).setFromMatrix4(m4.makeRotationFromQuaternion(camera.quaternion))
}
