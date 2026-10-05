# SOL — a scroll-driven tour of the Solar System

React + Three.js (React Three Fiber). One continuous flight in a chase view behind your Blender space vehicle:

**Overview → Sun → Mercury → Venus → Earth → Mars → Jupiter → Saturn → Uranus → Neptune → Wormhole → transit → Black hole**

Every stop has a details panel (description + facts), and every planet with moons has a second "Moons" tab. All 434 known moons are in the scene: 27 as textured, labelled bodies and the remaining small ones as orbiting rocks.

The flight has a soundtrack that is mixed live from where you are and how fast you are going (see *Sound* below).

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
| **Sound** or `M` | Soundtrack on / off (remembered for the next visit) |

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
public/audio/                 the soundtrack loops (MP3)
src/audio/sound.ts            the live mix: which loop plays where, engine, turbulence
tools/render_audio.py         the synthesiser that rendered public/audio
```

### Changing the tour

* **Text and numbers** — edit `src/data/bodies.ts`. Nothing else needs touching.
* **How long a stop lasts** — the `dwell` values in `src/tour/timeline.ts` (in "screens" of scrolling).
* **How close the ship passes a planet** — `flyby: { a, b, m, lift }` per body, in planet radii: start distance, end distance, sideways miss distance, height above the orbital plane.
* **Replacing the ship** — in Blender: `File → Export → glTF 2.0 (.glb)`, save over `public/models/spaceship.glb`. The model is centred and scaled automatically; its nose should point along Blender's −Y axis (the default "front"). The engine glow is placed at the tail in `Ship.tsx` (`nozzle`).

## Sound

Browsers do not allow a page to play audio until the visitor has clicked or pressed a key, so the soundtrack starts with the first click (the **Turn the sound on** button on the opening screen, or anything else). `M` or the **Sound** chip mutes it, and the choice is remembered.

It is not one music file. `public/audio` holds nine short pieces and `src/audio/sound.ts` mixes them from the flight itself:

| File | What it is | When you hear it |
| --- | --- | --- |
| `warm` | slow strings, flutes, a felt piano | overview, Sun, Mercury → Mars |
| `vast` | pipe-organ chords over a low pedal | Jupiter, Saturn |
| `cold` | glassy tones, distant bells, wind | Uranus, Neptune |
| `void` | very low drone, an unresolved interval | at the wormhole mouth |
| `tunnel` | an endlessly rising tone (Shepard–Risset) | the transit |
| `bh` | choir and organ over a sub-bass | the black hole |
| `engine` | hull / drive hum | whenever the ship is under way — louder, higher and brighter with speed |
| `roar` | low turbulence | close to the Sun, in the tunnel, near the accretion disc, at high speed |
| `arrive` | one soft, deep swell | on reaching a stop |

The music changes hands a little before the half-way point of each leg, with a slow cross-fade. Only the current piece and its neighbours are kept decoded in memory.

**All of it is synthesised** by `tools/render_audio.py` (additive synthesis, filtered noise and a convolution reverb in numpy) — there are no samples and no third-party recordings in it, and nothing from a real spacecraft. Space itself is silent; this is a film score, not a recording. Each loop is built so that it repeats exactly (every frequency completes a whole number of cycles per loop), so there is no click or gap at the loop point.

To change the music, edit the piece in `tools/render_audio.py` and render it again (needs Python with numpy, and ffmpeg):

```bash
python3 tools/render_audio.py            # everything
python3 tools/render_audio.py warm bh    # only these pieces
python3 tools/analyze_audio.py warm      # levels, frequency balance, loop seam, spectrogram
```

To use your own recordings instead, drop MP3s with the same names into `public/audio` and set their loop lengths in `PERIOD` at the top of `src/audio/sound.ts` (a file must contain one second of lead-in before the loop and one second after it). Levels per piece are in `LEVEL`, the overall volume is `MASTER`.

## What is real and what is not

* **Real:** every figure in the panels, axial tilts, ring radii, the relative order and character of the moons, moon counts (IAU Minor Planet Center tally of 26 March 2026: Jupiter 101, Saturn 285, Uranus 29, Neptune 16).
* **Compressed:** sizes and distances. At true scale the planets would be invisible, so radii and orbits are squeezed, moon orbits use a logarithmic scale beyond 2.5 planet radii, and small moons are enlarged. Orbital speeds are compressed the same way.
* **Representative:** the few-kilometre irregular moons of Jupiter and Saturn are placed in their real orbital families (Himalia, Ananke, Carme, Pasiphae; Inuit, Gallic, Norse) with the right distances and inclinations, but not at their exact present positions.
* **Lighting:** one light source, the Sun. Night sides are dark, Earth shows city lights, Saturn's rings and globe shadow each other, moons are eclipsed by their planet.
* **Wormhole:** hypothetical. It is drawn the way general relativity says a traversable wormhole would look — a sphere showing the far sky, not a funnel.
* **Black hole:** each pixel integrates a light ray through Schwarzschild spacetime (`x'' = −1.5 h² x / r⁵`), which produces the shadow, photon ring, Einstein ring and the disc's far side arching over the hole. Disc colour is black-body with Doppler beaming and gravitational red-shift. Non-rotating model.

## Performance

The renderer watches the frame rate and moves between four quality tiers (resolution 0.75×–1.5×, MSAA 0–4×). The black hole is capped at 1× resolution. All shaders are compiled during the loading screen so nothing stutters mid-flight.

## If the screen stays black

The page checks its own output on your GPU. If the HDR/bloom chain produces black frames it switches itself to a compatibility mode (same scene, no glow) and says so; if nothing can be drawn at all, a "Renderer" panel appears with the GPU name, WebGL capabilities and any shader or script error — use **Copy details** to share it. `?safe=1` forces compatibility mode.

Things that most often cause it: hardware acceleration switched off in the browser (`chrome://settings/system`), an outdated graphics driver, or a `NaN` reaching the bloom blur — every shader here clamps its output for that reason, and `Ship.tsx` repairs the zero-length tangents that Blender's glTF exporter can write.

## Credits

* Planet and moon maps are derived from NASA / JPL-Caltech / USGS / ESO imagery, via Solar System Scope (CC BY 4.0), Planet Pixel Emporium, the three.js examples and Stellarium.
* Space vehicle: the "SpaceFighter" scene from Blender.
* Fonts: Syncopate, Inter, JetBrains Mono (SIL Open Font License).
* Soundtrack: generated for this project by `tools/render_audio.py`; no third-party audio.

Check the texture and model licences before using this commercially.
