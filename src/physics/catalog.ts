// Catalog of tubing materials, standard sizes, and connector types common to
// medical-device test-loop assembly. Loss coefficients (K) are representative
// values for minor (local) losses; roughness is used for turbulent friction.

export interface TubingMaterial {
  id: string;
  name: string;
  /** absolute roughness, meters. Plastic/elastomer tubing is hydraulically smooth. */
  roughness: number;
  note?: string;
}

export const TUBING_MATERIALS: TubingMaterial[] = [
  { id: "silicone", name: "Silicone", roughness: 1.5e-6, note: "Peristaltic-safe, biocompatible" },
  { id: "pvc", name: "PVC (Tygon)", roughness: 1.5e-6, note: "General purpose, clear" },
  { id: "cflex", name: "C-Flex", roughness: 1.5e-6, note: "Thermoplastic elastomer" },
  { id: "pharmed", name: "PharMed BPT", roughness: 1.5e-6, note: "Long peristaltic pump life" },
  { id: "pu", name: "Polyurethane", roughness: 1.5e-6, note: "Kink resistant" },
  { id: "ptfe", name: "PTFE", roughness: 0.5e-6, note: "Chemically inert" },
  { id: "platinumSilicone", name: "Platinum-cured silicone", roughness: 1.5e-6, note: "High purity" },
];

export function getTubingMaterial(id: string): TubingMaterial {
  return TUBING_MATERIALS.find((m) => m.id === id) ?? TUBING_MATERIALS[0];
}

// Standard tubing inner diameters. mm value is what the solver uses; the label
// carries the fractional-inch call-out that shops actually order by.
export interface TubingSize {
  label: string;
  idMm: number;
}

export const TUBING_SIZES: TubingSize[] = [
  { label: "Capillary (0.25 mm)", idMm: 0.25 },
  { label: "Capillary (0.50 mm)", idMm: 0.5 },
  { label: "Microbore (0.75 mm)", idMm: 0.75 },
  { label: '1/32" (0.8 mm)', idMm: 0.8 },
  { label: '1/16" (1.6 mm)', idMm: 1.6 },
  { label: '3/32" (2.4 mm)', idMm: 2.4 },
  { label: '1/8" (3.2 mm)', idMm: 3.2 },
  { label: '3/16" (4.8 mm)', idMm: 4.8 },
  { label: '1/4" (6.4 mm)', idMm: 6.4 },
  { label: '5/16" (7.9 mm)', idMm: 7.9 },
  { label: '3/8" (9.5 mm)', idMm: 9.5 },
  { label: '1/2" (12.7 mm)', idMm: 12.7 },
  { label: '5/8" (15.9 mm)', idMm: 15.9 },
  { label: '3/4" (19.1 mm)', idMm: 19.1 },
];

// ---------------------------------------------------------------------------
// Standard diameter conversions (reducers / expanders).
//
// A barbed reducer/expander is a stock fitting whose two ends are two different
// barb sizes. Real catalogs only carry a limited set of size steps: fittings
// bridge *adjacent* nominal sizes, not arbitrary jumps — there is no off-the-
// shelf reducer from 1/2" straight down to 1/32". We model that by generating
// conversions only between the standard barb sizes below, and only when the two
// ends are within MAX_STEP nominal sizes of each other.
//
// The sub-millimeter capillary / microbore sizes in TUBING_SIZES are luer or
// microfluidic territory, not barbed step fittings, so they are deliberately
// excluded from the reducer size ladder.
// ---------------------------------------------------------------------------

interface BarbSize {
  /** compact fractional-inch call-out, e.g. `1/4"` */
  label: string;
  idMm: number;
}

const BARB_SIZES: BarbSize[] = [
  { label: '1/16"', idMm: 1.6 },
  { label: '3/32"', idMm: 2.4 },
  { label: '1/8"', idMm: 3.2 },
  { label: '3/16"', idMm: 4.8 },
  { label: '1/4"', idMm: 6.4 },
  { label: '5/16"', idMm: 7.9 },
  { label: '3/8"', idMm: 9.5 },
  { label: '1/2"', idMm: 12.7 },
  { label: '5/8"', idMm: 15.9 },
  { label: '3/4"', idMm: 19.1 },
];

/** A reducer/expander spans at most this many nominal barb sizes. */
const MAX_STEP = 2;

export interface SizeStep {
  /** larger bore, mm */
  largeMm: number;
  /** smaller bore, mm */
  smallMm: number;
  largeLabel: string;
  smallLabel: string;
}

// The realistic conversion set: every ordered pair of standard barb sizes that
// is at most MAX_STEP apart. A reducer uses a step large→small, an expander
// uses the same step small→large — they are the same physical fittings.
export const REDUCER_CONVERSIONS: SizeStep[] = (() => {
  const out: SizeStep[] = [];
  for (let i = 0; i < BARB_SIZES.length; i++) {
    for (let j = i + 1; j <= Math.min(i + MAX_STEP, BARB_SIZES.length - 1); j++) {
      out.push({
        largeMm: BARB_SIZES[j].idMm,
        smallMm: BARB_SIZES[i].idMm,
        largeLabel: BARB_SIZES[j].label,
        smallLabel: BARB_SIZES[i].label,
      });
    }
  }
  return out.sort((a, b) => a.largeMm - b.largeMm || a.smallMm - b.smallMm);
})();

export function findConversion(largeMm: number, smallMm: number): SizeStep | undefined {
  return REDUCER_CONVERSIONS.find((c) => c.largeMm === largeMm && c.smallMm === smallMm);
}

// Default fitting: 3/8" ↔ 1/4", a ubiquitous stock step-down/step-up.
export const DEFAULT_CONVERSION: SizeStep = findConversion(9.5, 6.4)!;

// ---------------------------------------------------------------------------
// Connector catalog. `k` is the total minor-loss coefficient for the fitting;
// `ports` is how many tube ports it exposes (2 = inline, 3 = branching).
// ---------------------------------------------------------------------------

export type ConnectorKind =
  | "barbStraight"
  | "barbElbow"
  | "barbReducer"
  | "barbExpander"
  | "barbY"
  | "barbTee"
  | "luerMale"
  | "luerFemale"
  | "luerY"
  | "luerTee"
  | "quickConnect"
  | "stopcock"
  | "pinchValve"
  | "needleValve"
  | "ballValve";

export interface ConnectorType {
  kind: ConnectorKind;
  name: string;
  ports: number;
  /** total minor-loss coefficient K (for valves, K at fully open) */
  k: number;
  /** true if the fitting throttles flow via an adjustable opening */
  isValve?: boolean;
  note?: string;
}

export const CONNECTORS: Record<ConnectorKind, ConnectorType> = {
  barbStraight: { kind: "barbStraight", name: "Barbed straight union", ports: 2, k: 0.15 },
  barbElbow: { kind: "barbElbow", name: "Barbed 90° elbow", ports: 2, k: 1.0 },
  barbReducer: { kind: "barbReducer", name: "Barbed reducer", ports: 2, k: 0.5, note: "Steps tube ID down" },
  barbExpander: { kind: "barbExpander", name: "Barbed expander", ports: 2, k: 0.8, note: "Steps tube ID up" },
  barbY: { kind: "barbY", name: "Barbed Y-connector", ports: 3, k: 0.5 },
  barbTee: { kind: "barbTee", name: "Barbed T-connector", ports: 3, k: 0.9 },
  luerMale: { kind: "luerMale", name: "Male luer lock", ports: 2, k: 0.3, note: "Narrow-bore" },
  luerFemale: { kind: "luerFemale", name: "Female luer lock", ports: 2, k: 0.3, note: "Narrow-bore" },
  luerY: { kind: "luerY", name: "Luer Y-site", ports: 3, k: 0.6 },
  luerTee: { kind: "luerTee", name: "Luer T-manifold", ports: 3, k: 1.0 },
  quickConnect: { kind: "quickConnect", name: "Quick-connect coupling", ports: 2, k: 0.4 },
  stopcock: { kind: "stopcock", name: "3-way stopcock", ports: 3, k: 1.5, note: "Directional valve" },
  pinchValve: { kind: "pinchValve", name: "Pinch valve", ports: 2, k: 0.2, isValve: true, note: "Tubing-occluding" },
  needleValve: { kind: "needleValve", name: "Needle valve", ports: 2, k: 3.0, isValve: true, note: "Fine metering" },
  ballValve: { kind: "ballValve", name: "Ball valve", ports: 2, k: 0.1, isValve: true, note: "Quarter-turn" },
};

export const CONNECTOR_LIST = Object.values(CONNECTORS);
