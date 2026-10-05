import * as THREE from 'three'
import { SEGS, type Seg } from './timeline'

/**
 * Per-frame mutable state shared between the director, the scene and the HUD.
 * Nothing in here triggers React renders — components read it inside useFrame.
 */
export const rt = {
  /** smoothed timeline position (in "screens") */
  t: 0,
  /** where the scroll bar says we should be */
  tTarget: 0,
  /** set to true to jump without smoothing (deep links, tests) */
  snap: true,
  /** true during the frame in which the jump happens */
  snapNow: true,
  seg: SEGS[0] as Seg,
  segIndex: 0,
  u: 0,
  time: 0,
  /** camera pose computed by the director */
  camPos: new THREE.Vector3(),
  tangent: new THREE.Vector3(0, 0, -1),
  lookDir: new THREE.Vector3(0, 0, -1),
  /** world units per second, smoothed */
  speed: 0,
  /** 0..1 feeling of speed, drives FOV / streaks / engines */
  warp: 0,
  /** 1 during the opening shots: orbit lines + planet name tags */
  overview: 1,
  /** planet name tags (overview shot only) */
  tags: 0,
  /** visibility of the three acts */
  solar: true,
  bh: false,
  /** tunnel overlay opacity and progress */
  tunnel: 0,
  tunnelU: 0,
  /** id of the body whose moon labels are shown, and how strongly */
  activeBody: '' as string,
  activeWeight: 0,
  /** distance from the Sun in display units (solar act) */
  sunDistance: 0,
}

export type Runtime = typeof rt
