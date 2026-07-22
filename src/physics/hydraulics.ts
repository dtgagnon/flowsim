// Single-element hydraulics. All SI: diameter m, length m, flow m^3/s,
// density kg/m^3, viscosity Pa·s, pressure Pa.
//
// The test-loop model is lumped-parameter: each tube segment is a resistive
// branch whose pressure drop is friction (Hagen–Poiseuille in laminar flow,
// Darcy–Weisbach with a turbulent friction factor otherwise) plus minor
// (local) losses from the fittings at its ends, ΔP = K·½ρv².

export const LAMINAR_RE = 2300;
export const TURBULENT_RE = 4000;

export function area(diameterM: number): number {
  const r = diameterM / 2;
  return Math.PI * r * r;
}

export function velocity(flowM3s: number, diameterM: number): number {
  return flowM3s / area(diameterM);
}

export function reynolds(
  flowM3s: number,
  diameterM: number,
  density: number,
  viscosity: number,
): number {
  const v = Math.abs(velocity(flowM3s, diameterM));
  return (density * v * diameterM) / viscosity;
}

export type FlowRegime = "laminar" | "transitional" | "turbulent" | "static";

export function regimeFor(re: number): FlowRegime {
  if (re <= 1e-9) return "static";
  if (re < LAMINAR_RE) return "laminar";
  if (re < TURBULENT_RE) return "transitional";
  return "turbulent";
}

// Darcy friction factor. Laminar: 64/Re. Turbulent: Haaland explicit
// approximation to Colebrook. Transitional: linear blend between the two so
// the resistance curve stays continuous (avoids solver chatter at Re≈2300).
export function frictionFactor(re: number, diameterM: number, roughness: number): number {
  if (re <= 1e-9) return 0;
  const laminarF = 64 / Math.max(re, 1e-6);
  if (re < LAMINAR_RE) return laminarF;

  const turbF = (r: number) => {
    const term = Math.pow(roughness / (3.7 * diameterM), 1.11) + 6.9 / r;
    const s = -1.8 * Math.log10(term);
    return 1 / (s * s);
  };

  if (re >= TURBULENT_RE) return turbF(re);

  // transitional blend
  const t = (re - LAMINAR_RE) / (TURBULENT_RE - LAMINAR_RE);
  const fl = 64 / LAMINAR_RE;
  const ft = turbF(TURBULENT_RE);
  return fl + t * (ft - fl);
}

// Friction pressure drop across a tube for a given (signed) flow. Returns the
// magnitude of the loss; sign is applied by the caller from flow direction.
export function frictionPressureDrop(
  flowM3s: number,
  diameterM: number,
  lengthM: number,
  roughness: number,
  density: number,
  viscosity: number,
): number {
  const q = Math.abs(flowM3s);
  if (q <= 1e-15) return 0;
  const re = reynolds(q, diameterM, density, viscosity);
  const v = velocity(q, diameterM);
  const f = frictionFactor(re, diameterM, roughness);
  return f * (lengthM / diameterM) * 0.5 * density * v * v;
}

// Minor (fitting) loss: ΔP = K · ½ρv², evaluated at the tube's velocity.
export function minorPressureDrop(
  flowM3s: number,
  diameterM: number,
  kSum: number,
  density: number,
): number {
  const v = velocity(Math.abs(flowM3s), diameterM);
  return kSum * 0.5 * density * v * v;
}

// Effective linear resistance R = ΔP / Q for a tube branch at an operating
// point, combining friction and minor losses. Used to build the nodal
// conductance matrix; recomputed each iteration as Q evolves.
//
// At near-zero flow the friction term collapses to the exact Hagen–Poiseuille
// resistance (a finite constant), so the branch never becomes singular.
export function tubeResistance(
  flowM3s: number,
  diameterM: number,
  lengthM: number,
  roughness: number,
  kSum: number,
  density: number,
  viscosity: number,
): number {
  const q = Math.abs(flowM3s);

  // Hagen–Poiseuille laminar resistance — the small-flow limit.
  const rPoiseuille = (128 * viscosity * lengthM) / (Math.PI * Math.pow(diameterM, 4));

  if (q <= 1e-12) {
    return rPoiseuille;
  }

  const dpFric = frictionPressureDrop(q, diameterM, lengthM, roughness, density, viscosity);
  const dpMinor = minorPressureDrop(q, diameterM, kSum, density);
  const r = (dpFric + dpMinor) / q;

  // The Poiseuille resistance is the physical floor for the friction part;
  // clamping there keeps the transitional region well-behaved.
  return Math.max(r, rPoiseuille);
}
