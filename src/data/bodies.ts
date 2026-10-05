/**
 * Astronomical data for the tour.
 *
 * Physical facts are real (NASA / IAU values). Display sizes and distances are
 * compressed so that everything can be seen in one continuous flight — at true
 * scale the planets would be invisible specks. Moon counts follow the IAU Minor
 * Planet Center tally as of 26 March 2026 (Jupiter 101, Saturn 285).
 */

export type Fact = { label: string; value: string }

export type MoonDef = {
  id: string
  name: string
  radiusKm: number
  aKm: number
  periodDays: number
  texture?: string
  bump?: string
  /** fallback colour when there is no texture */
  color?: string
  retrograde?: boolean
  /** non-spherical bodies: xyz scale */
  shape?: [number, number, number]
  /** hazy atmosphere colour (Titan) */
  haze?: string
  blurb: string
}

export type MinorGroup = {
  name: string
  /** how many moons to generate (ignored when `items` is given) */
  count?: number
  items?: { name: string; aKm: number }[]
  aKm?: [number, number]
  /** inclination range in degrees */
  inc: [number, number]
  retrograde?: boolean
  sizeKm: [number, number]
  /** regular moons orbit in the planet's equatorial plane */
  regular?: boolean
  note: string
}

export type RingDef = {
  inner: number // in planet radii
  outer: number
  texture?: string
  kind: 'saturn' | 'uranus' | 'neptune'
  opacity: number
}

export type AtmoDef = {
  color: string
  strength: number
  /** scale height as a fraction of the radius */
  height: number
  /** wrap lighting softness at the terminator */
  terminator: number
  sunset?: number
}

export type BodyDef = {
  id: string
  name: string
  index: string
  kind: 'star' | 'planet'
  type: string
  tagline: string
  accent: string
  /** display radius (scene units) */
  radius: number
  /** display distance from the Sun (scene units) */
  orbit: number
  /** position angle on its orbit, degrees */
  theta: number
  radiusKm: number
  au: number
  tiltDeg: number
  /** visual spin, radians per second (negative = retrograde) */
  spin: number
  texture: string
  bump?: string
  bumpScale?: number
  atmosphere?: AtmoDef
  ring?: RingDef
  limb?: number
  description: string[]
  facts: Fact[]
  moonCount: number
  moonsIntro: string
  majorMoons: MoonDef[]
  minorGroups: MinorGroup[]
  otherNamed?: string[]
  provisional?: number
  /** fly-by geometry in planet radii: start distance, end distance, lateral miss */
  flyby: { a: number; b: number; m: number; lift?: number }
}

export const MOON_TALLY_DATE = '26 March 2026'

export const SUN: BodyDef = {
  id: 'sun',
  name: 'Sun',
  index: '00',
  kind: 'star',
  type: 'G-type main-sequence star',
  tagline: 'The star that holds everything together',
  accent: '#ffb347',
  radius: 70,
  orbit: 0,
  theta: 0,
  radiusKm: 696_340,
  au: 0,
  tiltDeg: 7.25,
  spin: 0.012,
  texture: 'sun.jpg',
  description: [
    'The Sun is a 4.6-billion-year-old ball of hydrogen and helium plasma. It contains 99.86 % of all the mass in the Solar System — every planet, moon, asteroid and comet together make up the remaining sliver.',
    'In its core, 600 million tonnes of hydrogen fuse into helium every second at 15 million °C. The light released there takes more than 100,000 years to work its way to the surface, then just 8 minutes 20 seconds to reach Earth.',
  ],
  facts: [
    { label: 'Diameter', value: '1,392,700 km' },
    { label: 'Mass', value: '333,000 Earths' },
    { label: 'Surface', value: '5,500 °C' },
    { label: 'Core', value: '15,000,000 °C' },
    { label: 'Age', value: '4.6 billion yr' },
    { label: 'Composition', value: '73 % H · 25 % He' },
    { label: 'Rotation', value: '25 days (equator)' },
    { label: 'Light to Earth', value: '8 min 20 s' },
  ],
  moonCount: 0,
  moonsIntro:
    'The Sun has no moons — its satellites are the planets themselves. Eight planets, five recognised dwarf planets and millions of asteroids and comets orbit it, held by its gravity out to about two light-years.',
  majorMoons: [],
  minorGroups: [],
  flyby: { a: 9.5, b: 3.6, m: 2.3, lift: 0.9 },
}

export const PLANETS: BodyDef[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    index: '01',
    kind: 'planet',
    type: 'Terrestrial planet',
    tagline: 'The swift, scorched innermost world',
    accent: '#b9b2a8',
    radius: 3,
    orbit: 260,
    theta: 30,
    radiusKm: 2439.7,
    au: 0.387,
    tiltDeg: 0.03,
    spin: 0.02,
    texture: 'mercury.jpg',
    bump: 'mercury_bump.jpg',
    bumpScale: 0.006,
    description: [
      'Mercury is the smallest planet and the closest to the Sun, racing around it in just 88 days. With almost no atmosphere to hold heat, its surface swings from 430 °C in daylight to −180 °C at night — the widest temperature range of any planet.',
      'Its cratered surface resembles our Moon, but underneath lies a huge iron core that fills about 85 % of the planet’s radius. Despite the heat, permanently shadowed craters at its poles hide water ice.',
    ],
    facts: [
      { label: 'Diameter', value: '4,879 km' },
      { label: 'Mass', value: '0.055 Earths' },
      { label: 'Gravity', value: '3.7 m/s²' },
      { label: 'From Sun', value: '57.9 million km' },
      { label: 'Year', value: '88 Earth days' },
      { label: 'Solar day', value: '176 Earth days' },
      { label: 'Temperature', value: '−180 to 430 °C' },
      { label: 'Atmosphere', value: 'Trace exosphere' },
    ],
    moonCount: 0,
    moonsIntro:
      'Mercury has no moons. It is so close to the Sun that the Sun’s gravity would strip away any satellite — the zone where Mercury could hold on to a moon is very small, and the planet is too small to have captured or formed one.',
    majorMoons: [],
    minorGroups: [],
    flyby: { a: 10, b: 3.2, m: 2.0 },
  },
  {
    id: 'venus',
    name: 'Venus',
    index: '02',
    kind: 'planet',
    type: 'Terrestrial planet',
    tagline: 'Earth’s twin, lost under a runaway greenhouse',
    accent: '#e6c98a',
    radius: 6,
    orbit: 400,
    theta: 75,
    radiusKm: 6051.8,
    au: 0.723,
    tiltDeg: 177.4,
    spin: 0.006,
    texture: 'venus.jpg',
    atmosphere: { color: '#f3dcae', strength: 1.15, height: 0.022, terminator: 0.28, sunset: 0.25 },
    description: [
      'Venus is almost the same size as Earth, but its thick carbon-dioxide atmosphere traps heat so efficiently that the surface sits at 465 °C — hot enough to melt lead, and hotter than Mercury. The pressure at ground level is 92 times Earth’s.',
      'What we see from space is not the surface but an unbroken deck of sulfuric-acid clouds. Venus also spins backwards and so slowly that one day there lasts longer than its year.',
    ],
    facts: [
      { label: 'Diameter', value: '12,104 km' },
      { label: 'Mass', value: '0.815 Earths' },
      { label: 'Gravity', value: '8.87 m/s²' },
      { label: 'From Sun', value: '108.2 million km' },
      { label: 'Year', value: '225 Earth days' },
      { label: 'Rotation', value: '243 days, retrograde' },
      { label: 'Surface', value: '465 °C' },
      { label: 'Atmosphere', value: '96.5 % CO₂ · 92 bar' },
    ],
    moonCount: 0,
    moonsIntro:
      'Venus has no moons. Like Mercury it sits deep in the Sun’s gravity well, and its slow, backwards rotation hints at a violent past — one theory is that giant impacts gave Venus a moon and then took it away again.',
    majorMoons: [],
    minorGroups: [],
    flyby: { a: 10, b: 3.3, m: 2.0 },
  },
  {
    id: 'earth',
    name: 'Earth',
    index: '03',
    kind: 'planet',
    type: 'Terrestrial planet',
    tagline: 'The only world known to carry life',
    accent: '#6fa8ff',
    radius: 6.4,
    orbit: 560,
    theta: 120,
    radiusKm: 6371,
    au: 1,
    tiltDeg: 23.44,
    spin: 0.035,
    texture: 'earth_day.jpg',
    atmosphere: { color: '#5b9bff', strength: 1.25, height: 0.02, terminator: 0.14, sunset: 0.75 },
    description: [
      'Earth is the largest of the rocky planets and the only place we know of with liquid water on its surface — oceans cover 71 % of it. A nitrogen-oxygen atmosphere and a magnetic field shield the surface from radiation and keep temperatures gentle.',
      'Its 23.4° axial tilt gives us seasons, and its crust is broken into moving plates that recycle carbon and build mountains. On the night side, city lights trace the outlines of the continents.',
    ],
    facts: [
      { label: 'Diameter', value: '12,742 km' },
      { label: 'Mass', value: '5.97 × 10²⁴ kg' },
      { label: 'Gravity', value: '9.81 m/s²' },
      { label: 'From Sun', value: '149.6 million km' },
      { label: 'Year', value: '365.25 days' },
      { label: 'Day', value: '23 h 56 min' },
      { label: 'Mean temp.', value: '15 °C' },
      { label: 'Atmosphere', value: '78 % N₂ · 21 % O₂' },
    ],
    moonCount: 1,
    moonsIntro:
      'Earth has one natural satellite — unusually large compared with its planet. It most likely formed 4.5 billion years ago from the debris of a collision between the young Earth and a Mars-sized body.',
    majorMoons: [
      {
        id: 'moon',
        name: 'Moon',
        radiusKm: 1737.4,
        aKm: 384_400,
        periodDays: 27.32,
        texture: 'moon.jpg',
        bump: 'moon_bump.jpg',
        blurb:
          '3,475 km across and 384,400 km away. It is tidally locked, so the same face always looks at Earth, and its pull raises our ocean tides. Twelve people have walked on it.',
      },
    ],
    minorGroups: [],
    flyby: { a: 10, b: 3.3, m: 2.0 },
  },
  {
    id: 'mars',
    name: 'Mars',
    index: '04',
    kind: 'planet',
    type: 'Terrestrial planet',
    tagline: 'A cold desert that once had rivers',
    accent: '#e0764a',
    radius: 3.6,
    orbit: 740,
    theta: 165,
    radiusKm: 3389.5,
    au: 1.524,
    tiltDeg: 25.19,
    spin: 0.034,
    texture: 'mars.jpg',
    bump: 'mars_bump.jpg',
    bumpScale: 0.028,
    atmosphere: { color: '#e9b48a', strength: 0.5, height: 0.016, terminator: 0.06, sunset: 0.0 },
    description: [
      'Mars is red because its soil is rich in iron oxide — rust. It is half Earth’s diameter, with a thin carbon-dioxide atmosphere less than 1 % as dense as ours, so liquid water cannot survive on the surface today.',
      'Dry river valleys and lake beds show it was once warmer and wetter. It holds the tallest volcano in the Solar System, Olympus Mons (22 km high), and Valles Marineris, a canyon system 4,000 km long.',
    ],
    facts: [
      { label: 'Diameter', value: '6,779 km' },
      { label: 'Mass', value: '0.107 Earths' },
      { label: 'Gravity', value: '3.71 m/s²' },
      { label: 'From Sun', value: '227.9 million km' },
      { label: 'Year', value: '687 Earth days' },
      { label: 'Day', value: '24 h 37 min' },
      { label: 'Mean temp.', value: '−63 °C' },
      { label: 'Atmosphere', value: '95 % CO₂ · 0.006 bar' },
    ],
    moonCount: 2,
    moonsIntro:
      'Mars has two tiny, potato-shaped moons, discovered in 1877 and named after the sons of the war god Ares: Fear and Dread. They may be captured asteroids or debris from an ancient impact.',
    majorMoons: [
      {
        id: 'phobos',
        name: 'Phobos',
        radiusKm: 11.1,
        aKm: 9_376,
        periodDays: 0.319,
        texture: 'phobos.jpg',
        shape: [1.18, 0.92, 0.82],
        blurb:
          'Only 22 km across and just 6,000 km above the surface. It orbits faster than Mars rotates, rising in the west three times a day, and is spiralling inward — in about 50 million years it will break up into a ring.',
      },
      {
        id: 'deimos',
        name: 'Deimos',
        radiusKm: 6.2,
        aKm: 23_463,
        periodDays: 1.263,
        texture: 'deimos.jpg',
        shape: [1.2, 0.95, 0.8],
        blurb:
          'The smaller, outer moon — about 12 km across, with a smooth surface blanketed in loose dust. From Mars it looks like a bright star and takes 30 hours to cross the sky.',
      },
    ],
    minorGroups: [],
    flyby: { a: 10, b: 3.3, m: 2.0 },
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    index: '05',
    kind: 'planet',
    type: 'Gas giant',
    tagline: 'The giant — more massive than all other planets combined',
    accent: '#d9b48a',
    radius: 26,
    orbit: 1250,
    theta: 210,
    radiusKm: 69_911,
    au: 5.203,
    tiltDeg: 3.13,
    spin: 0.06,
    texture: 'jupiter.jpg',
    limb: 0.45,
    atmosphere: { color: '#e8cfae', strength: 0.55, height: 0.012, terminator: 0.1, sunset: 0.1 },
    description: [
      'Jupiter is a ball of hydrogen and helium 11 times wider than Earth and 2.5 times more massive than all the other planets put together. It has no solid surface: the coloured bands are cloud layers of ammonia and water stretched by winds of up to 540 km/h.',
      'It spins once in under 10 hours, the shortest day of any planet. The Great Red Spot is a storm larger than Earth that has raged for at least 190 years. Jupiter’s gravity shepherds asteroids and shapes the whole Solar System.',
    ],
    facts: [
      { label: 'Diameter', value: '139,820 km' },
      { label: 'Mass', value: '318 Earths' },
      { label: 'Gravity', value: '24.79 m/s²' },
      { label: 'From Sun', value: '778.5 million km' },
      { label: 'Year', value: '11.86 Earth years' },
      { label: 'Day', value: '9 h 56 min' },
      { label: 'Cloud tops', value: '−110 °C' },
      { label: 'Atmosphere', value: '90 % H₂ · 10 % He' },
    ],
    moonCount: 101,
    moonsIntro:
      'Jupiter has 101 known moons. Four are worlds in their own right — the Galilean moons, found by Galileo in 1610. Four small moons orbit closer in, and 93 irregular moons, most of them captured fragments only a few kilometres across, swarm far outside.',
    majorMoons: [
      {
        id: 'io',
        name: 'Io',
        radiusKm: 1821.6,
        aKm: 421_800,
        periodDays: 1.769,
        texture: 'io.jpg',
        blurb:
          'The most volcanically active body in the Solar System. Tides from Jupiter flex its interior, powering over 400 active volcanoes that paint the surface yellow and red with sulfur.',
      },
      {
        id: 'europa',
        name: 'Europa',
        radiusKm: 1560.8,
        aKm: 671_100,
        periodDays: 3.551,
        texture: 'europa.jpg',
        blurb:
          'A cracked shell of water ice over a global salt-water ocean holding twice the water of all Earth’s oceans — one of the best places to look for life beyond Earth.',
      },
      {
        id: 'ganymede',
        name: 'Ganymede',
        radiusKm: 2634.1,
        aKm: 1_070_400,
        periodDays: 7.155,
        texture: 'ganymede.jpg',
        blurb:
          'The largest moon in the Solar System — bigger than Mercury — and the only moon with its own magnetic field. It too hides an ocean under its icy crust.',
      },
      {
        id: 'callisto',
        name: 'Callisto',
        radiusKm: 2410.3,
        aKm: 1_882_700,
        periodDays: 16.689,
        texture: 'callisto.jpg',
        blurb:
          'A dark, ancient world and the most heavily cratered object known. Its surface has barely changed in four billion years.',
      },
      {
        id: 'amalthea',
        name: 'Amalthea',
        radiusKm: 83.5,
        aKm: 181_400,
        periodDays: 0.498,
        texture: 'amalthea.jpg',
        shape: [1.3, 0.85, 0.75],
        blurb:
          'A reddish, irregular inner moon about 170 km long, coloured by sulfur drifting in from Io. Dust knocked off it feeds Jupiter’s faint rings.',
      },
    ],
    minorGroups: [
      {
        name: 'Inner moons',
        items: [
          { name: 'Metis', aKm: 128_000 },
          { name: 'Adrastea', aKm: 129_000 },
          { name: 'Thebe', aKm: 221_900 },
        ],
        inc: [0, 1],
        sizeKm: [8, 50],
        regular: true,
        note: 'Metis, Adrastea and Thebe orbit inside Io and supply the dust of Jupiter’s rings.',
      },
      { name: 'Themisto', count: 1, aKm: [7_400_000, 7_400_000], inc: [43, 43], sizeKm: [4, 4], note: 'A lone prograde moon between the Galileans and the Himalia group.' },
      { name: 'Himalia group', count: 9, aKm: [11_100_000, 12_300_000], inc: [26, 31], sizeKm: [2, 70], note: 'Prograde moons led by 140-km Himalia — pieces of one shattered asteroid.' },
      { name: 'Carpo & Valetudo', count: 3, aKm: [17_000_000, 19_000_000], inc: [34, 53], sizeKm: [0.5, 1.5], note: 'Oddballs that orbit prograde among the retrograde swarm.' },
      { name: 'Ananke group', count: 26, aKm: [19_500_000, 22_000_000], inc: [143, 153], retrograde: true, sizeKm: [0.5, 14], note: 'Retrograde fragments sharing the orbit of Ananke.' },
      { name: 'Carme group', count: 30, aKm: [22_500_000, 24_200_000], inc: [163, 167], retrograde: true, sizeKm: [0.5, 23], note: 'A tight retrograde family with matching reddish colour.' },
      { name: 'Pasiphae group', count: 24, aKm: [22_800_000, 24_800_000], inc: [141, 158], retrograde: true, sizeKm: [0.5, 30], note: 'A looser retrograde family that includes Pasiphae and Sinope.' },
    ],
    otherNamed: [
      'Metis', 'Adrastea', 'Thebe', 'Themisto', 'Leda', 'Ersa', 'Himalia', 'Pandia', 'Lysithea', 'Elara', 'Dia', 'Carpo', 'Valetudo',
      'Euporie', 'Eupheme', 'Mneme', 'Euanthe', 'Harpalyke', 'Orthosie', 'Helike', 'Praxidike', 'Thelxinoe', 'Thyone', 'Ananke', 'Iocaste',
      'Hermippe', 'Philophrosyne', 'Pasithee', 'Chaldene', 'Kale', 'Isonoe', 'Aitne', 'Erinome', 'Taygete', 'Carme', 'Herse', 'Eukelade',
      'Arche', 'Kalyke', 'Kallichore', 'Pasiphae', 'Megaclite', 'Sinope', 'Hegemone', 'Aoede', 'Callirrhoe', 'Autonoe', 'Eurydome', 'Sponde',
      'Cyllene', 'Kore', 'Eirene',
    ],
    provisional: 44,
    flyby: { a: 10, b: 3.4, m: 2.1 },
  },
  {
    id: 'saturn',
    name: 'Saturn',
    index: '06',
    kind: 'planet',
    type: 'Gas giant',
    tagline: 'The ringed planet, king of the moons',
    accent: '#e3cf9f',
    radius: 22,
    orbit: 1800,
    theta: 255,
    radiusKm: 58_232,
    au: 9.537,
    tiltDeg: 26.73,
    spin: 0.055,
    texture: 'saturn.jpg',
    limb: 0.45,
    atmosphere: { color: '#f0e0b8', strength: 0.5, height: 0.012, terminator: 0.1, sunset: 0.1 },
    ring: { inner: 1.239, outer: 2.27, texture: 'saturn_ring.png', kind: 'saturn', opacity: 1 },
    description: [
      'Saturn is a gas giant nine times wider than Earth but so light for its size that it is the only planet less dense than water. Fast rotation flattens it visibly at the poles.',
      'Its rings span 282,000 km yet are typically only about 10 metres thick — countless chunks of almost pure water ice, from dust grains to house-sized boulders. The dark gap is the Cassini Division, swept clear by the moon Mimas.',
    ],
    facts: [
      { label: 'Diameter', value: '116,460 km' },
      { label: 'Mass', value: '95 Earths' },
      { label: 'Gravity', value: '10.44 m/s²' },
      { label: 'From Sun', value: '1.43 billion km' },
      { label: 'Year', value: '29.45 Earth years' },
      { label: 'Day', value: '10 h 33 min' },
      { label: 'Density', value: '0.687 g/cm³' },
      { label: 'Ring span', value: '282,000 km' },
    ],
    moonCount: 285,
    moonsIntro:
      'Saturn has 285 known moons — more than all the other planets combined. Twenty-four are regular moons that formed with the planet; the other 261 are small irregular moons captured into distant, tilted and often backwards orbits.',
    majorMoons: [
      {
        id: 'mimas',
        name: 'Mimas',
        radiusKm: 198.2,
        aKm: 185_539,
        periodDays: 0.942,
        texture: 'mimas.jpg',
        blurb: 'A 396-km ice ball scarred by the giant crater Herschel, a third of its own width.',
      },
      {
        id: 'enceladus',
        name: 'Enceladus',
        radiusKm: 252.1,
        aKm: 238_042,
        periodDays: 1.37,
        texture: 'enceladus.jpg',
        blurb:
          'The brightest surface in the Solar System. Geysers at its south pole spray water from a hidden ocean into space, building Saturn’s E ring.',
      },
      {
        id: 'tethys',
        name: 'Tethys',
        radiusKm: 531.1,
        aKm: 294_672,
        periodDays: 1.888,
        texture: 'tethys.jpg',
        blurb: 'Almost pure water ice, split by Ithaca Chasma — a canyon running three-quarters of the way around it.',
      },
      {
        id: 'dione',
        name: 'Dione',
        radiusKm: 561.4,
        aKm: 377_415,
        periodDays: 2.737,
        texture: 'dione.jpg',
        blurb: 'An icy moon streaked with bright cliffs of fractured ice hundreds of metres high.',
      },
      {
        id: 'rhea',
        name: 'Rhea',
        radiusKm: 763.8,
        aKm: 527_068,
        periodDays: 4.518,
        texture: 'rhea.jpg',
        blurb: 'Saturn’s second-largest moon: a heavily cratered mix of ice and rock with a trace oxygen exosphere.',
      },
      {
        id: 'titan',
        name: 'Titan',
        radiusKm: 2574.7,
        aKm: 1_221_870,
        periodDays: 15.945,
        texture: 'titan.jpg',
        haze: '#e8a552',
        blurb:
          'Larger than Mercury and the only moon with a thick atmosphere. Under its orange haze are rivers, lakes and seas of liquid methane — the only other surface liquids known.',
      },
      {
        id: 'hyperion',
        name: 'Hyperion',
        radiusKm: 135,
        aKm: 1_481_010,
        periodDays: 21.28,
        texture: 'hyperion.jpg',
        shape: [1.3, 0.95, 0.75],
        blurb: 'A tumbling, sponge-like body so porous that 40 % of it is empty space.',
      },
      {
        id: 'iapetus',
        name: 'Iapetus',
        radiusKm: 734.5,
        aKm: 3_560_820,
        periodDays: 79.32,
        texture: 'iapetus.jpg',
        blurb: 'The two-faced moon — one hemisphere bright as snow, the other dark as coal — with a mountain ridge along its equator.',
      },
      {
        id: 'janus',
        name: 'Janus',
        radiusKm: 89.5,
        aKm: 151_460,
        periodDays: 0.695,
        texture: 'janus.jpg',
        shape: [1.12, 1, 0.84],
        blurb: 'Shares its orbit with Epimetheus; every four years the two swap places instead of colliding.',
      },
      {
        id: 'epimetheus',
        name: 'Epimetheus',
        radiusKm: 58.1,
        aKm: 151_410,
        periodDays: 0.694,
        texture: 'epimetheus.jpg',
        shape: [1.15, 0.98, 0.9],
        blurb: 'The smaller co-orbital partner of Janus, just 50 km closer to Saturn.',
      },
      {
        id: 'phoebe',
        name: 'Phoebe',
        radiusKm: 106.5,
        aKm: 12_947_780,
        periodDays: 550.3,
        texture: 'phoebe.jpg',
        retrograde: true,
        blurb: 'A dark, captured body from the outer Solar System that orbits backwards, 13 million km out.',
      },
    ],
    minorGroups: [
      {
        name: 'Ring shepherds & co-orbitals',
        items: [
          { name: 'Pan', aKm: 133_584 },
          { name: 'Daphnis', aKm: 136_505 },
          { name: 'Atlas', aKm: 137_670 },
          { name: 'Prometheus', aKm: 139_380 },
          { name: 'Pandora', aKm: 141_720 },
          { name: 'Aegaeon', aKm: 167_500 },
          { name: 'Methone', aKm: 194_440 },
          { name: 'Anthe', aKm: 197_700 },
          { name: 'Pallene', aKm: 212_280 },
          { name: 'Telesto', aKm: 294_672 },
          { name: 'Calypso', aKm: 294_672 },
          { name: 'Helene', aKm: 377_415 },
          { name: 'Polydeuces', aKm: 377_415 },
          { name: 'S/2009 S 1', aKm: 117_000 },
        ],
        inc: [0, 1],
        sizeKm: [1, 43],
        regular: true,
        note: 'Small moons that sculpt the rings (Pan, Daphnis, Prometheus, Pandora) or share the orbits of Tethys and Dione.',
      },
      { name: 'Inuit group', count: 36, aKm: [11_100_000, 18_200_000], inc: [40, 50], sizeKm: [1, 20], note: 'Prograde irregular moons tilted about 46° — Kiviuq, Ijiraq, Paaliaq, Siarnaq, Tarqeq and their fragments.' },
      { name: 'Gallic group', count: 17, aKm: [16_000_000, 19_500_000], inc: [34, 41], sizeKm: [1, 16], note: 'A prograde collisional family around Albiorix.' },
      { name: 'Norse group', count: 207, aKm: [12_900_000, 26_500_000], inc: [145, 177], retrograde: true, sizeKm: [1, 9], note: 'By far the largest family: hundreds of 1–9 km retrograde fragments from collisions among captured bodies.' },
    ],
    otherNamed: [
      'Pan', 'Daphnis', 'Atlas', 'Prometheus', 'Pandora', 'Aegaeon', 'Methone', 'Anthe', 'Pallene', 'Telesto', 'Calypso', 'Helene', 'Polydeuces',
      'Kiviuq', 'Ijiraq', 'Paaliaq', 'Siarnaq', 'Tarqeq', 'Albiorix', 'Bebhionn', 'Erriapus', 'Tarvos', 'Skathi', 'Skoll', 'Hyrrokkin', 'Greip',
      'Jarnsaxa', 'Mundilfari', 'Suttungr', 'Thrymr', 'Narvi', 'Bergelmir', 'Hati', 'Farbauti', 'Aegir', 'Bestla', 'Fenrir', 'Surtur', 'Kari',
      'Loge', 'Ymir', 'Fornjot', 'Gridr', 'Angrboda', 'Skrymir', 'Gerd', 'Eggther', 'Beli', 'Gunnlod', 'Thiazzi', 'Alvaldi', 'Geirrod',
    ],
    provisional: 222,
    flyby: { a: 11, b: 4.4, m: 4.0, lift: 1.5 },
  },
  {
    id: 'uranus',
    name: 'Uranus',
    index: '07',
    kind: 'planet',
    type: 'Ice giant',
    tagline: 'The tilted giant that rolls around the Sun',
    accent: '#a8e1e6',
    radius: 12,
    orbit: 2300,
    theta: 300,
    radiusKm: 25_362,
    au: 19.19,
    tiltDeg: 97.77,
    spin: -0.04,
    texture: 'uranus.jpg',
    limb: 0.5,
    atmosphere: { color: '#9fe3ea', strength: 0.75, height: 0.016, terminator: 0.16, sunset: 0.0 },
    ring: { inner: 1.6, outer: 2.05, kind: 'uranus', opacity: 0.34 },
    description: [
      'Uranus is an ice giant: beneath its hydrogen-helium atmosphere lies a deep, hot ocean of water, ammonia and methane ices. Methane in the upper atmosphere absorbs red light, giving the planet its pale cyan colour.',
      'It is tipped over by 98°, probably by an ancient collision, so it orbits the Sun on its side — each pole gets 42 years of sunlight followed by 42 years of darkness. It was the first planet found with a telescope, by William Herschel in 1781.',
    ],
    facts: [
      { label: 'Diameter', value: '50,724 km' },
      { label: 'Mass', value: '14.5 Earths' },
      { label: 'Gravity', value: '8.87 m/s²' },
      { label: 'From Sun', value: '2.87 billion km' },
      { label: 'Year', value: '84 Earth years' },
      { label: 'Day', value: '17 h 14 min' },
      { label: 'Min. temp.', value: '−224 °C' },
      { label: 'Axial tilt', value: '97.8°' },
    ],
    moonCount: 29,
    moonsIntro:
      'Uranus has 29 known moons, named after characters from Shakespeare and Alexander Pope. Five are large enough to be round; fourteen small inner moons crowd close to the 13 rings, and ten irregular moons orbit far out. The newest, S/2025 U 1, was found by the James Webb Space Telescope in 2025.',
    majorMoons: [
      {
        id: 'miranda',
        name: 'Miranda',
        radiusKm: 235.8,
        aKm: 129_900,
        periodDays: 1.413,
        texture: 'miranda.jpg',
        blurb: 'A jumbled patchwork of terrains with Verona Rupes, a cliff 20 km high — the tallest known in the Solar System.',
      },
      {
        id: 'ariel',
        name: 'Ariel',
        radiusKm: 578.9,
        aKm: 190_900,
        periodDays: 2.52,
        texture: 'ariel.jpg',
        blurb: 'The brightest Uranian moon, with the youngest surface, cut by wide rift valleys.',
      },
      {
        id: 'umbriel',
        name: 'Umbriel',
        radiusKm: 584.7,
        aKm: 266_000,
        periodDays: 4.144,
        texture: 'umbriel.jpg',
        blurb: 'The darkest of the five, ancient and cratered, with one mysterious bright ring on a crater floor.',
      },
      {
        id: 'titania',
        name: 'Titania',
        radiusKm: 788.4,
        aKm: 436_300,
        periodDays: 8.706,
        texture: 'titania.jpg',
        blurb: 'The largest moon of Uranus, 1,577 km across, marked by canyons up to 1,500 km long.',
      },
      {
        id: 'oberon',
        name: 'Oberon',
        radiusKm: 761.4,
        aKm: 583_500,
        periodDays: 13.463,
        texture: 'oberon.jpg',
        blurb: 'The outermost large moon — old, heavily cratered, with a mountain rising 11 km above its limb.',
      },
    ],
    minorGroups: [
      {
        name: 'Inner moons',
        items: [
          { name: 'Cordelia', aKm: 49_800 },
          { name: 'Ophelia', aKm: 53_800 },
          { name: 'S/2025 U 1', aKm: 56_000 },
          { name: 'Bianca', aKm: 59_200 },
          { name: 'Cressida', aKm: 61_800 },
          { name: 'Desdemona', aKm: 62_700 },
          { name: 'Juliet', aKm: 64_400 },
          { name: 'Portia', aKm: 66_100 },
          { name: 'Rosalind', aKm: 69_900 },
          { name: 'Cupid', aKm: 74_400 },
          { name: 'Belinda', aKm: 75_300 },
          { name: 'Perdita', aKm: 76_400 },
          { name: 'Puck', aKm: 86_000 },
          { name: 'Mab', aKm: 97_700 },
        ],
        inc: [0, 1],
        sizeKm: [5, 81],
        regular: true,
        note: 'Fourteen dark little moons packed so tightly that their orbits are slowly disturbing one another.',
      },
      {
        name: 'Irregular moons',
        items: [
          { name: 'Francisco', aKm: 4_276_000 },
          { name: 'Caliban', aKm: 7_231_000 },
          { name: 'Stephano', aKm: 8_004_000 },
          { name: 'S/2023 U 1', aKm: 7_976_000 },
          { name: 'Trinculo', aKm: 8_504_000 },
          { name: 'Sycorax', aKm: 12_179_000 },
          { name: 'Margaret', aKm: 14_345_000 },
          { name: 'Prospero', aKm: 16_256_000 },
          { name: 'Setebos', aKm: 17_418_000 },
          { name: 'Ferdinand', aKm: 20_901_000 },
        ],
        inc: [140, 170],
        retrograde: true,
        sizeKm: [4, 75],
        note: 'Ten captured bodies in distant orbits; all but Margaret travel backwards.',
      },
    ],
    flyby: { a: 10.5, b: 3.6, m: 2.6, lift: 1.2 },
  },
  {
    id: 'neptune',
    name: 'Neptune',
    index: '08',
    kind: 'planet',
    type: 'Ice giant',
    tagline: 'The windiest world, found by mathematics',
    accent: '#5b83f0',
    radius: 11.5,
    orbit: 2800,
    theta: 345,
    radiusKm: 24_622,
    au: 30.07,
    tiltDeg: 28.32,
    spin: 0.045,
    texture: 'neptune.jpg',
    limb: 0.5,
    atmosphere: { color: '#5d8dff', strength: 0.85, height: 0.016, terminator: 0.16, sunset: 0.0 },
    ring: { inner: 1.65, outer: 2.6, kind: 'neptune', opacity: 0.15 },
    description: [
      'Neptune is the most distant planet, 30 times farther from the Sun than Earth, where sunlight is 900 times dimmer. Yet it has the fastest winds in the Solar System — up to 2,100 km/h — driving dark storms the size of Earth.',
      'It was the first planet found by calculation rather than by chance: in 1846 astronomers predicted its position from tiny irregularities in the orbit of Uranus, and it was spotted within a degree of where the maths said it would be.',
    ],
    facts: [
      { label: 'Diameter', value: '49,244 km' },
      { label: 'Mass', value: '17.1 Earths' },
      { label: 'Gravity', value: '11.15 m/s²' },
      { label: 'From Sun', value: '4.5 billion km' },
      { label: 'Year', value: '164.8 Earth years' },
      { label: 'Day', value: '16 h 6 min' },
      { label: 'Cloud tops', value: '−200 °C' },
      { label: 'Top winds', value: '2,100 km/h' },
    ],
    moonCount: 16,
    moonsIntro:
      'Neptune has 16 known moons, named after sea gods and nymphs. One of them, Triton, holds 99.5 % of all the mass in orbit around the planet. Seven small moons circle inside it and seven distant irregular moons far beyond.',
    majorMoons: [
      {
        id: 'triton',
        name: 'Triton',
        radiusKm: 1353.4,
        aKm: 354_759,
        periodDays: 5.877,
        texture: 'triton.jpg',
        retrograde: true,
        blurb:
          'The only large moon that orbits backwards — almost certainly a captured Kuiper Belt object. At −235 °C it is one of the coldest places known, yet nitrogen geysers erupt from its surface.',
      },
      {
        id: 'proteus',
        name: 'Proteus',
        radiusKm: 210,
        aKm: 117_647,
        periodDays: 1.122,
        texture: 'proteus.jpg',
        shape: [1.06, 1, 0.92],
        blurb: 'A dark, lumpy moon 420 km across — about as large as a body can be without gravity pulling it into a sphere.',
      },
      {
        id: 'nereid',
        name: 'Nereid',
        radiusKm: 178.5,
        aKm: 5_513_800,
        periodDays: 360.1,
        texture: 'nereid.jpg',
        blurb: 'Follows one of the most eccentric orbits of any moon, swinging from 1.4 to 9.7 million km from Neptune.',
      },
    ],
    minorGroups: [
      {
        name: 'Inner moons',
        items: [
          { name: 'Naiad', aKm: 48_227 },
          { name: 'Thalassa', aKm: 50_075 },
          { name: 'Despina', aKm: 52_526 },
          { name: 'Galatea', aKm: 61_953 },
          { name: 'Larissa', aKm: 73_548 },
          { name: 'Hippocamp', aKm: 105_283 },
        ],
        inc: [0, 2],
        sizeKm: [17, 97],
        regular: true,
        note: 'Six small moons orbiting among Neptune’s faint rings; Galatea holds the clumpy Adams ring in place.',
      },
      {
        name: 'Irregular moons',
        items: [
          { name: 'Halimede', aKm: 16_590_000 },
          { name: 'Sao', aKm: 22_230_000 },
          { name: 'S/2002 N 5', aKm: 23_410_000 },
          { name: 'Laomedeia', aKm: 23_610_000 },
          { name: 'Psamathe', aKm: 46_700_000 },
          { name: 'Neso', aKm: 49_290_000 },
          { name: 'S/2021 N 1', aKm: 50_620_000 },
        ],
        inc: [30, 140],
        sizeKm: [12, 31],
        note: 'Seven captured moons; Neso and S/2021 N 1 take about 27 years per orbit, the longest of any known moon.',
      },
    ],
    flyby: { a: 10.5, b: 3.5, m: 2.3, lift: 1.0 },
  },
]

export const BODIES: BodyDef[] = [SUN, ...PLANETS]
export const BODY_BY_ID: Record<string, BodyDef> = Object.fromEntries(BODIES.map((b) => [b.id, b]))

export const TOTAL_MOONS = PLANETS.reduce((s, p) => s + p.moonCount, 0)

/** compressed display distance of a moon, in planet radii */
export function orbitDisplay(aKm: number, planetRadiusKm: number) {
  const x = aKm / planetRadiusKm
  return x <= 2.5 ? x : 2.5 + 2.0 * Math.log(x / 2.5)
}

/** exaggerated display radius of a moon, in planet radii */
export function moonDisplayRadius(rKm: number, planetRadiusKm: number) {
  return Math.max(0.012, 0.75 * Math.pow(rKm / planetRadiusKm, 0.62))
}

/** compressed visual orbital period in seconds */
export function visualPeriod(periodDays: number) {
  return 30 * Math.pow(Math.max(periodDays, 0.2), 0.6)
}

export const WORMHOLE = {
  id: 'wormhole',
  name: 'Wormhole',
  index: '09',
  radius: 60,
  orbit: 3500,
  theta: 390,
  au: 39.5,
  accent: '#bcd4ff',
}

export const BLACKHOLE = {
  id: 'blackhole',
  name: 'Black Hole',
  index: '10',
  accent: '#ffb070',
  /** world units per Schwarzschild radius */
  rs: 30,
}

/** display distance from the Sun -> real AU, for the telemetry read-out */
const AU_TABLE: [number, number][] = [
  [0, 0],
  [260, 0.387],
  [400, 0.723],
  [560, 1.0],
  [740, 1.524],
  [1250, 5.203],
  [1800, 9.537],
  [2300, 19.19],
  [2800, 30.07],
  [3500, 39.5],
  [6000, 60],
]
export function displayToAU(d: number) {
  for (let i = 1; i < AU_TABLE.length; i++) {
    const [d1, a1] = AU_TABLE[i]
    if (d <= d1) {
      const [d0, a0] = AU_TABLE[i - 1]
      return a0 + ((d - d0) / (d1 - d0)) * (a1 - a0)
    }
  }
  return AU_TABLE[AU_TABLE.length - 1][1]
}
