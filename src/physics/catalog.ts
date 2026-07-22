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
// Connector catalog. `k` is the total minor-loss coefficient for the fitting;
// `ports` is how many tube ports it exposes (2 = inline, 3 = branching).
// ---------------------------------------------------------------------------

export type ConnectorKind =
  | "barbStraight"
  | "barbElbow"
  | "barbReducer"
  | "barbY"
  | "barbTee"
  | "luerMale"
  | "luerFemale"
  | "luerY"
  | "luerTee"
  | "quickConnect"
  | "stopcock";

export interface ConnectorType {
  kind: ConnectorKind;
  name: string;
  ports: number;
  /** total minor-loss coefficient K */
  k: number;
  note?: string;
}

export const CONNECTORS: Record<ConnectorKind, ConnectorType> = {
  barbStraight: { kind: "barbStraight", name: "Barbed straight union", ports: 2, k: 0.15 },
  barbElbow: { kind: "barbElbow", name: "Barbed 90° elbow", ports: 2, k: 1.0 },
  barbReducer: { kind: "barbReducer", name: "Barbed reducer", ports: 2, k: 0.5, note: "Steps tube ID" },
  barbY: { kind: "barbY", name: "Barbed Y-connector", ports: 3, k: 0.5 },
  barbTee: { kind: "barbTee", name: "Barbed T-connector", ports: 3, k: 0.9 },
  luerMale: { kind: "luerMale", name: "Male luer lock", ports: 2, k: 0.3, note: "Narrow-bore" },
  luerFemale: { kind: "luerFemale", name: "Female luer lock", ports: 2, k: 0.3, note: "Narrow-bore" },
  luerY: { kind: "luerY", name: "Luer Y-site", ports: 3, k: 0.6 },
  luerTee: { kind: "luerTee", name: "Luer T-manifold", ports: 3, k: 1.0 },
  quickConnect: { kind: "quickConnect", name: "Quick-connect coupling", ports: 2, k: 0.4 },
  stopcock: { kind: "stopcock", name: "3-way stopcock", ports: 3, k: 1.5, note: "Directional valve" },
};

export const CONNECTOR_LIST = Object.values(CONNECTORS);
