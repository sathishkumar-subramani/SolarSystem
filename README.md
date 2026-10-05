# SOL — a scroll-driven tour of the Solar System

React + Three.js (React Three Fiber). One continuous flight in a chase view behind your Blender space vehicle:

**Overview → Sun → Mercury → Venus → Earth → Mars → Jupiter → Saturn → Uranus → Neptune → Wormhole → transit → Black hole**

Every stop has a details panel (description + facts), and every planet with moons has a second "Moons" tab. All 434 known moons are in the scene: 27 as textured, labelled bodies and the remaining small ones as orbiting rocks.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve the production build
```

Needs Node 20+ and a browser with WebGL 2.

## Controls

| Input | Action |
| --- | --- |
| Scroll / touch drag | Fly along the tour |
| `→` / `←` (or PageDown / PageUp) | Next / previous stop |
| `Space` or **Auto tour** | Autopilot — lingers at each stop, hurries between them |
| Bottom rail | Jump to any stop |
| Tabs in a panel | Overview ↔ Moons |
| **Labels** | Show / hide the moon and planet name tags |

Useful while developing: `?t=14.9` opens the tour at that timeline position, `?q=0…3` forces a quality tier, `?shipz=-1.2` pulls the ship close to the camera. `window.__tour` exposes `jumpTo(t)`, `goTo(t)` and the live runtime state.

## Where things live

```
public/models/spaceship.glb   the vehicle, exported from Blender
public/textures/              planet, moon, ring and Milky Way maps
src/data/bodies.ts            ALL the content: facts, descriptions, moons, sizes, fly-by distances
src/tour/timeline.ts          the flight path — one Hermite curve + one "focus" per segment
src/tour/scroll.ts            Lenis smooth scroll, keyboard, autopilot, deep links
src/scene/Director.tsx        runs first every frame: camera, speed, lighting, which act is visible
src/scene/Planet.tsx          planet + atmosphere + rings + all of its moons
src/scene/materials.ts        planet / atmosphere / ring / Sun shaders
src/scene/Wormhole.tsx        the lensing sphere
src/scene/Tunnel.tsx          the transit
src/scene/BlackHole.tsx       ray-traced Schwarzschild black hole with accretion disc
src/scene/Ship.tsx            chase rig, banking, engine plume
src/ui/Hud.tsx                panels, telemetry, labels, progress rail
```

### Changing the tour

* **Text and numbers** — edit `src/data/bodies.ts`. Nothing else needs touching.
* **How long a stop lasts** — the `dwell` values in `src/tour/timeline.ts` (in "screens" of scrolling).
* **How close the ship passes a planet** — `flyby: { a, b, m, lift }` per body, in planet radii: start distance, end distance, sideways miss distance, height above the orbital plane.
* **Replacing the ship** — in Blender: `File → Export → glTF 2.0 (.glb)`, save over `public/models/spaceship.glb`. The model is centred and scaled automatically; its nose should point along Blender's −Y axis (the default "front"). The engine glow is placed at the tail in `Ship.tsx` (`nozzle`).

## What is real and what is not

* **Real:** every figure in the panels, axial tilts, ring radii, the relative order and character of the moons, moon counts (IAU Minor Planet Center tally of 26 March 2026: Jupiter 101, Saturn 285, Uranus 29, Neptune 16).
* **Compressed:** sizes and distances. At true scale the planets would be invisible, so radii and orbits are squeezed, moon orbits use a logarithmic scale beyond 2.5 planet radii, and small moons are enlarged. Orbital speeds are compressed the same way.
* **Representative:** the few-kilometre irregular moons of Jupiter and Saturn are placed in their real orbital families (Himalia, Ananke, Carme, Pasiphae; Inuit, Gallic, Norse) with the right distances and inclinations, but not at their exact present positions.
* **Lighting:** one light source, the Sun. Night sides are dark, Earth shows city lights, Saturn's rings and globe shadow each other, moons are eclipsed by their planet.
* **Wormhole:** hypothetical. It is drawn the way general relativity says a traversable wormhole would look — a sphere showing the far sky, not a funnel.
* **Black hole:** each pixel integrates a light ray through Schwarzschild spacetime (`x'' = −1.5 h² x / r⁵`), which produces the shadow, photon ring, Einstein ring and the disc's far side arching over the hole. Disc colour is black-body with Doppler beaming and gravitational red-shift. Non-rotating model.

## Performance

The renderer watches the frame rate and moves between four quality tiers (resolution 0.75×–1.5×, MSAA 0–4×). The black hole is capped at 1× resolution. All shaders are compiled during the loading screen so nothing stutters mid-flight.

## Credits

* Planet and moon maps are derived from NASA / JPL-Caltech / USGS / ESO imagery, via Solar System Scope (CC BY 4.0), Planet Pixel Emporium, the three.js examples and Stellarium.
* Space vehicle: the "SpaceFighter" scene from Blender.
* Fonts: Syncopate, Inter, JetBrains Mono (SIL Open Font License).

Check the texture and model licences before using this commercially.
