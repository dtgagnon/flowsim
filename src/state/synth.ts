// Loop design synthesizer.
//
// Given a target number of sensors, a target flow at those sensors, and the
// flow range the pump can deliver, generate the *minimal* loop that meets the
// spec and verify it with the real solver.
//
// Optimization principle (fewest nodes/edges):
//   • If the pump can output the target flow directly, put every sensor in a
//     single SERIES line — by mass conservation each sensor then sees exactly
//     the pump flow. This is the provably minimal topology: one path, no
//     branches, N sensors + pump + reservoir + outlet.
//   • If the target is below the pump's minimum, the pump must run faster than
//     the sensors need, so add exactly one branch: a wide bypass to shed the
//     excess and a fine sample line (sensors in series) sized to the target.
//     This adds the fewest possible elements (one tee, one bypass, one outlet).
//   • If the target exceeds the pump's maximum, no single-pump loop can push
//     that much through a sensor — report infeasible.

import type { ComponentNode, TubeEdge, ComponentData } from "./types";
import type { FlowUnit } from "../physics/units";
import { flowToM3s, flowFromM3s } from "../physics/units";
import { getFluid } from "../physics/fluids";
import { buildAndSolve } from "./network";

export interface DesignParams {
  sensorCount: number;
  targetFlowValue: number;
  targetFlowUnit: FlowUnit;
  pumpMinValue: number;
  pumpMaxValue: number;
  pumpFlowUnit: FlowUnit;
}

export interface DesignResult {
  ok: boolean;
  topology: "series" | "divider" | "infeasible";
  message: string;
  nodes: ComponentNode[];
  edges: TubeEdge[];
  nodeCount: number;
  edgeCount: number;
  /** chosen pump flow, m^3/s */
  pumpFlow?: number;
  /** achieved flow at the sensors, m^3/s */
  achievedFlow?: number;
  warnings: string[];
}

let uid = 0;
const id = (p: string) => `${p}_${++uid}`;

function node(data: ComponentData, x: number, y: number): ComponentNode {
  return { id: id(data.kind === "connector" ? data.connector : data.kind), type: "component", position: { x, y }, data };
}

function tube(
  source: string,
  target: string,
  sizeIdMm: number,
  lengthCm: number,
  sourceHandle: string,
  targetHandle: string,
  materialId = "silicone",
): TubeEdge {
  return {
    id: id("tube"),
    source,
    target,
    sourceHandle,
    targetHandle,
    type: "tube",
    data: { sizeIdMm, materialId, lengthValue: lengthCm, lengthUnit: "cm" },
  };
}

const RES = (): ComponentData => ({ kind: "reservoir", label: "Reservoir", pressureValue: 0, pressureUnit: "mmHg" });
const OUT = (label = "Outlet"): ComponentData => ({ kind: "outlet", label });
const SENS = (label: string): ComponentData => ({ kind: "sensor", label });
const TEE = (): ComponentData => ({ kind: "connector", label: "Split tee", connector: "barbTee" });
const PUMP = (flowValue: number, flowUnit: FlowUnit): ComponentData => ({ kind: "pump", label: "Pump", flowValue, flowUnit });

function sensorChain(count: number, prefix: string): ComponentData[] {
  return Array.from({ length: count }, (_, i) =>
    SENS(count === 1 ? `${prefix}` : `${prefix} ${i + 1}`),
  );
}

// Candidate sample-line inner diameters (mm), fine → coarse.
const SAMPLE_DIAMETERS = [0.25, 0.5, 0.75, 1.6, 3.2, 4.8, 6.4];

export function synthesizeLoop(params: DesignParams, fluidId: string): DesignResult {
  uid = 0;
  const warnings: string[] = [];
  const n = Math.max(1, Math.round(params.sensorCount));
  const Qt = flowToM3s(params.targetFlowValue, params.targetFlowUnit);
  const Qmin = flowToM3s(params.pumpMinValue, params.pumpFlowUnit);
  const Qmax = flowToM3s(params.pumpMaxValue, params.pumpFlowUnit);
  const fluid = getFluid(fluidId);

  const empty = { nodes: [] as ComponentNode[], edges: [] as TubeEdge[], nodeCount: 0, edgeCount: 0 };

  if (!(Qt > 0) || !(Qmin >= 0) || !(Qmax > 0) || Qmax < Qmin) {
    return { ok: false, topology: "infeasible", message: "Enter a positive target flow and a valid pump range (min ≤ max).", warnings, ...empty };
  }

  // ---- Infeasible: target exceeds what the pump can push through a sensor ----
  if (Qt > Qmax * 1.0000001) {
    return {
      ok: false,
      topology: "infeasible",
      message: `Target ${params.targetFlowValue} ${params.targetFlowUnit} exceeds the pump's maximum (${params.pumpMaxValue} ${params.pumpFlowUnit}). A single sensor can see at most the full pump flow — raise the pump limit or lower the target.`,
      warnings,
      ...empty,
    };
  }

  // ---- Series: pump can hit the target directly → minimal single line ----
  if (Qt >= Qmin - 1e-15 && Qt <= Qmax + 1e-15) {
    const built = buildSeries(n, Qt);
    const res = buildAndSolve(built.nodes, built.edges, fluidId);
    const achieved = sensorFlow(res, built.sensorIds);
    return {
      ok: true,
      topology: "series",
      message: `Series loop: all ${n} sensor${n > 1 ? "s" : ""} carry the full pump flow. Pump set to the target directly.`,
      nodes: built.nodes,
      edges: built.edges,
      nodeCount: built.nodes.length,
      edgeCount: built.edges.length,
      pumpFlow: Qt,
      achievedFlow: achieved,
      warnings,
    };
  }

  // ---- Divider: target below pump minimum → bypass + sized sample line ----
  const Qpump = Qmin; // lowest feasible pump flow keeps the split least extreme
  const Qbypass = Qpump - Qt;

  // Analytic first cut for the sample-line resistance, then pick the diameter
  // giving a sensible physical length and refine with the solver.
  const bypassIdMm = 6.4;
  const bypassLenCm = 15;
  const rBypass = poiseuilleR(bypassIdMm / 1000, bypassLenCm / 100, fluid.viscosity);
  const pTee = Qbypass * rBypass; // ~tee pressure (bypass dominates conductance)
  const rSampleNeeded = pTee / Qt;

  let chosenD = SAMPLE_DIAMETERS[0];
  let chosenLenCm = 40;
  let bestScore = Infinity;
  for (const dmm of SAMPLE_DIAMETERS) {
    const lenM = (rSampleNeeded * Math.PI * Math.pow(dmm / 1000, 4)) / (128 * fluid.viscosity);
    const lenCm = lenM * 100;
    // prefer a total sample length in a buildable band, nearest ~40 cm
    const score = lenCm < 4 || lenCm > 300 ? 1e6 + Math.abs(lenCm - 40) : Math.abs(lenCm - 40);
    if (score < bestScore) {
      bestScore = score;
      chosenD = dmm;
      chosenLenCm = Math.min(300, Math.max(4, lenCm));
    }
  }

  // Refine the total sample length against the real solver (laminar R ∝ L, and
  // sensor flow ∝ 1/R, so L *= achieved/target converges in a few steps).
  let lenCm = chosenLenCm;
  let achieved = 0;
  let built = buildDivider(n, Qpump, chosenD, lenCm, bypassIdMm, bypassLenCm);
  for (let i = 0; i < 12; i++) {
    const res = buildAndSolve(built.nodes, built.edges, fluidId);
    achieved = sensorFlow(res, built.sensorIds);
    if (achieved <= 0) break;
    const err = achieved / Qt;
    if (Math.abs(err - 1) < 0.01) break;
    lenCm = Math.min(1000, Math.max(1, lenCm * err));
    built = buildDivider(n, Qpump, chosenD, lenCm, bypassIdMm, bypassLenCm);
  }

  const achievedUl = flowFromM3s(achieved, "µL/min");
  const targetUl = flowFromM3s(Qt, "µL/min");
  if (Math.abs(achievedUl - targetUl) / targetUl > 0.05) {
    warnings.push("Could not size the sample line to within 5% of target — adjust the sample tube length/diameter manually to fine-tune.");
  }

  return {
    ok: true,
    topology: "divider",
    message: `Flow divider: pump runs at its ${params.pumpMinValue} ${params.pumpFlowUnit} minimum; a wide bypass sheds the excess while a ${chosenD} mm sample line (~${Math.round(lenCm)} cm) throttles the ${n} in-series sensor${n > 1 ? "s" : ""} to target.`,
    nodes: built.nodes,
    edges: built.edges,
    nodeCount: built.nodes.length,
    edgeCount: built.edges.length,
    pumpFlow: Qpump,
    achievedFlow: achieved,
    warnings,
  };
}

// ---- topology builders ----

function buildSeries(n: number, Qt: number) {
  const flowUnit = pickFlowUnit(Qt);
  const nodes: ComponentNode[] = [];
  const edges: TubeEdge[] = [];
  const y = 200;
  let x = 40;

  const res = node(RES(), x, y);
  x += 180;
  const pump = node(PUMP(round3(flowFromM3s(Qt, flowUnit)), flowUnit), x, y);
  nodes.push(res, pump);
  edges.push(tube(res.id, pump.id, 6.4, 20, "p", "in"));

  let prev = pump.id;
  let prevHandle = "out";
  const sensorIds: string[] = [];
  for (const data of sensorChain(n, "Sensor")) {
    x += 180;
    const s = node(data, x, y);
    nodes.push(s);
    edges.push(tube(prev, s.id, 6.4, 20, prevHandle, "l"));
    sensorIds.push(s.id);
    prev = s.id;
    prevHandle = "r";
  }
  x += 180;
  const out = node(OUT(), x, y);
  nodes.push(out);
  edges.push(tube(prev, out.id, 6.4, 20, prevHandle, "p"));

  return { nodes, edges, sensorIds };
}

function buildDivider(
  n: number,
  Qpump: number,
  sampleIdMm: number,
  sampleTotalLenCm: number,
  bypassIdMm: number,
  bypassLenCm: number,
) {
  const flowUnit = pickFlowUnit(Qpump);
  const nodes: ComponentNode[] = [];
  const edges: TubeEdge[] = [];

  const res = node(RES(), 40, 230);
  const pump = node(PUMP(round3(flowFromM3s(Qpump, flowUnit)), flowUnit), 220, 220);
  const tee = node(TEE(), 400, 230);
  nodes.push(res, pump, tee);
  edges.push(tube(res.id, pump.id, 9.5, 20, "p", "in"));
  edges.push(tube(pump.id, tee.id, 9.5, 20, "out", "in"));

  // Wide bypass: tee.a → sensor(bypass) → outlet
  const bp = node(SENS("Bypass"), 620, 110);
  const bpOut = node(OUT("Bypass outlet"), 820, 110);
  nodes.push(bp, bpOut);
  edges.push(tube(tee.id, bp.id, bypassIdMm, bypassLenCm * 0.6, "a", "l"));
  edges.push(tube(bp.id, bpOut.id, bypassIdMm, bypassLenCm * 0.4, "r", "p"));

  // Sample line: tee.b → [seg] sensor_1 → [seg] ... sensor_n → [seg] outlet
  const segs = n + 1;
  const segLen = sampleTotalLenCm / segs;
  const mat = "ptfe";
  let prev = tee.id;
  let prevHandle = "b";
  const sensorIds: string[] = [];
  let y = 360;
  let x = 620;
  const chain = sensorChain(n, "Sample");
  for (let i = 0; i < chain.length; i++) {
    const s = node(chain[i], x, y);
    nodes.push(s);
    edges.push(tube(prev, s.id, sampleIdMm, segLen, prevHandle, "l", mat));
    sensorIds.push(s.id);
    prev = s.id;
    prevHandle = "r";
    x += 180;
  }
  const smOut = node(OUT("Sample outlet"), x, y);
  nodes.push(smOut);
  edges.push(tube(prev, smOut.id, sampleIdMm, segLen, prevHandle, "p", mat));

  return { nodes, edges, sensorIds };
}

// ---- helpers ----

function poiseuilleR(dM: number, lM: number, mu: number): number {
  return (128 * mu * lM) / (Math.PI * Math.pow(dM, 4));
}

function sensorFlow(res: { nodes: Record<string, { flow?: number }> }, sensorIds: string[]): number {
  // Sensors are in series and see the same flow; take the max magnitude read.
  let best = 0;
  for (const sid of sensorIds) {
    const f = Math.abs(res.nodes[sid]?.flow ?? 0);
    if (f > best) best = f;
  }
  return best;
}

function pickFlowUnit(qM3s: number): FlowUnit {
  const mlmin = flowFromM3s(qM3s, "mL/min");
  if (mlmin < 1) return "µL/min";
  if (mlmin >= 1000) return "L/min";
  return "mL/min";
}

function round3(v: number): number {
  if (v === 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 2);
  return Math.round(v / mag) * mag;
}
