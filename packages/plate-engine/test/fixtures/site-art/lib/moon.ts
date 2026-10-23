/**
 * The moon from where you stand, computed in the browser. Low-precision
 * ephemeris (after Meeus, "Astronomical Algorithms"): new and full moons land
 * within about ten minutes of the published times, rise and set within a few.
 */

const RAD = Math.PI / 180
const OBLIQUITY = 23.4397 * RAD
const DAY_MS = 86_400_000
const J2000 = 2_451_545
const SUN_KM = 149_598_000
export const SYNODIC_DAYS = 29.530589

/** Days since J2000.0. */
const days = (t: number) => t / DAY_MS + 2_440_587.5 - J2000

const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l))
const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l))

function sunCoords(d: number) {
  const M = RAD * (357.5291 + 0.98560028 * d)
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  // Perihelion longitude drifts with precession, so both bodies share the equinox of date.
  const L = M + C + RAD * (102.9372 + 0.0000470684 * d) + Math.PI
  return { L, ra: rightAscension(L, 0), dec: declination(L, 0) }
}

function moonCoords(d: number) {
  const L = RAD * (218.316 + 13.176396 * d) // mean longitude
  const M = RAD * (134.963 + 13.064993 * d) // mean anomaly
  const F = RAD * (93.272 + 13.22935 * d) // distance from the ascending node
  const D = RAD * (297.85 + 12.190749 * d) // elongation from the sun
  const S = RAD * (357.529 + 0.98560028 * d) // the sun's mean anomaly
  // The largest periodic terms: equation of centre, evection, variation, annual equation and the next seven.
  const l =
    L +
    RAD *
      (6.289 * Math.sin(M) +
        1.274 * Math.sin(2 * D - M) +
        0.658 * Math.sin(2 * D) +
        0.214 * Math.sin(2 * M) -
        0.186 * Math.sin(S) -
        0.114 * Math.sin(2 * F) +
        0.0588 * Math.sin(2 * D - 2 * M) +
        0.0571 * Math.sin(2 * D - S - M) +
        0.0533 * Math.sin(2 * D + M) +
        0.0458 * Math.sin(2 * D - S) +
        0.0409 * Math.sin(M - S) -
        0.0347 * Math.sin(D) -
        0.0304 * Math.sin(S + M))
  const b = RAD * (5.128 * Math.sin(F) + 0.281 * Math.sin(M + F) + 0.278 * Math.sin(M - F))
  const km = 385_001 - 20_905 * Math.cos(M) - 3_699 * Math.cos(2 * D - M) - 2_956 * Math.cos(2 * D)
  return { l, b, ra: rightAscension(l, b), dec: declination(l, b), km }
}

/**
 * 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter: the moon's
 * elongation from the sun along the ecliptic, which is how the phases are defined.
 * Plus the lit fraction of the disc and the distance.
 */
export function moonPhase(t: number) {
  const d = days(t)
  const s = sunCoords(d)
  const m = moonCoords(d)
  const elongation = (((m.l - s.L) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  // Angle between sun and moon seen from Earth, then the sun-moon-Earth angle.
  const psi = Math.acos(Math.cos(m.b) * Math.cos(m.l - s.L))
  const i = Math.atan2(SUN_KM * Math.sin(psi), m.km - SUN_KM * Math.cos(psi))
  return { phase: elongation / (2 * Math.PI), lit: (1 + Math.cos(i)) / 2, km: m.km }
}

/** Altitude above the horizon in degrees, for a place in degrees (east positive). */
export function moonAltitude(t: number, lat: number, lon: number) {
  const d = days(t)
  const m = moonCoords(d)
  const H = RAD * (280.16 + 360.9856235 * d) + RAD * lon - m.ra
  const phi = lat * RAD
  return Math.asin(Math.sin(phi) * Math.sin(m.dec) + Math.cos(phi) * Math.cos(m.dec) * Math.cos(H)) / RAD
}

const NAMES = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full moon',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
]
export const phaseName = (phase: number) => NAMES[Math.round(phase * 8) % 8]

/** Narrow a change in `test` between a and b down to the minute. */
function bisect(a: number, b: number, test: (t: number) => boolean) {
  const start = test(a)
  while (b - a > 60_000) {
    const mid = (a + b) / 2
    if (test(mid) === start) a = mid
    else b = mid
  }
  return b
}

/**
 * The next moonrise and moonset after `t`. The moon's centre sits about 0.13°
 * above the horizon at the moment it appears (parallax less refraction and radius).
 */
export function nextRiseSet(t: number, lat: number, lon: number) {
  const up = (x: number) => moonAltitude(x, lat, lon) > 0.133
  const step = 10 * 60_000
  let rise: number | null = null
  let set: number | null = null
  let prev = up(t)
  for (let x = t + step; x <= t + 2 * DAY_MS && (rise === null || set === null); x += step) {
    const now = up(x)
    if (now !== prev) {
      const at = bisect(x - step, x, up)
      if (now && rise === null) rise = at
      if (!now && set === null) set = at
    }
    prev = now
  }
  return { rise, set }
}

/** The next full and new moons after `t`: the moments the phase crosses 0.5, and wraps to 0. */
export function nextFullNew(t: number) {
  const waxing = (x: number) => moonPhase(x).phase < 0.5
  const step = 6 * 3_600_000
  let full: number | null = null
  let fresh: number | null = null
  let prev = waxing(t)
  for (let x = t + step; x <= t + 32 * DAY_MS && (full === null || fresh === null); x += step) {
    const now = waxing(x)
    if (now !== prev) {
      const at = bisect(x - step, x, waxing)
      if (now) fresh ??= at
      else full ??= at
    }
    prev = now
  }
  return { full, new: fresh }
}
