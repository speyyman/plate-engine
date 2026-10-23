/**
 * The moon's phase, computed offline. Low-precision ephemeris after Meeus,
 * "Astronomical Algorithms": new and full moons land within about ten minutes
 * of the published times.
 */

const RAD = Math.PI / 180
const DAY_MS = 86_400_000
const J2000 = 2_451_545
const SUN_KM = 149_598_000

/** Mean length of a lunar month in days. */
export const SYNODIC_DAYS = 29.530589

/** Days since J2000.0. */
const days = (t: number) => t / DAY_MS + 2_440_587.5 - J2000

function sunLongitude(d: number) {
  const M = RAD * (357.5291 + 0.98560028 * d)
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  // Perihelion longitude drifts with precession, so both bodies share the equinox of date.
  return M + C + RAD * (102.9372 + 0.0000470684 * d) + Math.PI
}

function moonEcliptic(d: number) {
  const L = RAD * (218.316 + 13.176396 * d) // mean longitude
  const M = RAD * (134.963 + 13.064993 * d) // mean anomaly
  const F = RAD * (93.272 + 13.22935 * d) // distance from the ascending node
  const D = RAD * (297.85 + 12.190749 * d) // elongation from the sun
  const S = RAD * (357.529 + 0.98560028 * d) // the sun's mean anomaly
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
  return { l, b, km }
}

/** The moon's phase at one moment. */
export type MoonPhase = {
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
  phase: number
  /** Fraction of the disc that is lit, 0..1. */
  lit: number
  /** Earth–moon distance in kilometres. */
  km: number
}

/**
 * The moon's elongation from the sun along the ecliptic (which is how the
 * phases are defined), the lit fraction of the disc and the distance.
 * @param date A `Date` or a Unix time in milliseconds.
 */
export function moonPhase(date: Date | number): MoonPhase {
  const d = days(typeof date === 'number' ? date : date.getTime())
  const sL = sunLongitude(d)
  const m = moonEcliptic(d)
  const elongation = (((m.l - sL) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  // Angle between sun and moon seen from Earth, then the sun–moon–Earth angle.
  const psi = Math.acos(Math.cos(m.b) * Math.cos(m.l - sL))
  const i = Math.atan2(SUN_KM * Math.sin(psi), m.km - SUN_KM * Math.cos(psi))
  return { phase: elongation / (2 * Math.PI), lit: (1 + Math.cos(i)) / 2, km: m.km }
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
] as const

/** The conventional name of a phase (0..1), to the nearest eighth. */
export const phaseName = (phase: number): string => NAMES[Math.round(phase * 8) % 8]
