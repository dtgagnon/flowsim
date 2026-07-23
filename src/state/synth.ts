// Loop design synthesizer.
//
// Given a target number of sensors, a target flow at those sensors, and the
// flow range the pump can deliver, generate the *minimal* loop that meets the
// spec and verify it with the real solver.
//
// Each sensor sits at an independent device sampling location, so sensors are
// NEVER placed in series — a device downstream of one sensor would perturb the
// others, and a shared series path forces one flow through all of them.
// Instead every sensor gets its own parallel branch off a manifold, so the
// branches are hydraulically independent and each can hold the target flow.
//
// Optimization principle (fewest nodes/edges):
//   • If the pump can output N × target (all branches together), run the pump
//     at exactly that and split into N identical parallel branches — each then
//     carries the target with no bypass. This is the minimal parallel loop.
//   • If N × target is below the pump's minimum, the pump must run faster than
//     the branches need, so add exactly one bypass branch to shed the excess;
//     the N sample branches are sized (and solver-verified) to the target.
//   • If N × target exceeds the pump's maximum, no single-pump loop can supply
//     that much — report infeasible.

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

export type Topology = "parallel" | "divider" | "infeasible";

export interface DesignResult {
  ok: boolean;
  topology: Topology;
  message: string;
  nodes: ComponentNode[];
  edges: TubeEdge[];
  nodeCount: number;
  edgeCount: number;
  /** chosen pump flow, m^3/s */
  pumpFlow?: number;
  /** mean achieved flow at the sensors, m^3/s */
  achievedFlow?: number;
  /** relative spread between branches (max-min)/mean */
  branchSpread?: number;
  warnings: string[];
}

let uid = 0;
const id = (p: string) => `${p}_${++uid}`;

function node(data: ComponentData, x: number, y: number): ComponentNode {
  return {
    id: id(data.kind === "connector" ? data.connector : data.kind),
    type: "component",
    position: { x, y },
    data,
  };
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
    data: { sizeIdMm, materialId, lengthValue: Math.max(0.5, lengthCm), lengthUnit: "cm" },
  };
}

const RES = (): ComponentData => ({ kind: "reservoir", label: "Reservoir", pressureValue: 0, pressureUnit: "mmHg" });
const OUT = (label: string): ComponentData => ({ kind: "outlet", label });
const SENS = (label: string): ComponentData => ({ kind: "sensor", label });
const TEE = (): ComponentData => ({ kind: "connector", label: "Manifold tee", connector: "barbTee" });
const PUMP = (flowValue: number, flowUnit: FlowUnit): ComponentData => ({ kind: "pump", label: "Pump", flowValue, flowUnit });

// Candidate sample-line inner diameters (mm), fine → coarse.
const SAMPLE_DIAMETERS = [0.25, 0.5, 0.75, 1.6, 3.2, 4.8, 6.4];

interface BranchSpec {
  sample: boolean; // true = device sample branch (has sensor), false = bypass
  idMm: number;
  totalLenCm: number;
  label: string;
}

export function synthesizeLoop(params: DesignParams, fluidId: string): DesignResult {
  uid = 0;
  const warnings: string[] = [];
  const n = Math.max(1, Math.round(params.sensorCount));
  const Qt = flowToM3s(params.targetFlowValue, params.targetFlowUnit);
  const Qmin = flowToM3s(params.pumpMinValue, params.pumpFlowUnit);
  const Qmax = flowToM3s(params.pumpMaxValue, params.pumpFlowUnit);
  const fluid = getFluid(fluidId);
  const total = n * Qt;

  const empty = { nodes: [] as ComponentNode[], edges: [] as TubeEdge[], nodeCount: 0, edgeCount: 0 };

  if (!(Qt > 0) || !(Qmin >= 0) || !(Qmax > 0) || Qmax < Qmin) {
    return { ok: false, topology: "infeasible", message: "Enter a positive target flow and a valid pump range (min ≤ max).", warnings, ...empty };
  }

  // ---- Infeasible: combined demand exceeds what the pump can push ----
  if (total > Qmax * 1.0000001) {
    return {
      ok: false,
      topology: "infeasible",
      message: `Combined demand of ${n} × ${params.targetFlowValue} ${params.targetFlowUnit} = ${fmt(total)} exceeds the pump's maximum (${params.pumpMaxValue} ${params.pumpFlowUnit}). Raise the pump limit, lower the target, or reduce the sensor count.`,
      warnings,
      ...empty,
    };
  }

  // ---- Direct parallel: pump can supply the combined demand exactly ----
  if (total >= Qmin - 1e-15 && total <= Qmax + 1e-15) {
    const branches: BranchSpec[] = Array.from({ length: n }, (_, i) => ({
      sample: true,
      idMm: 3.2,
      totalLenCm: 25,
      label: n === 1 ? "Sensor" : `Sensor ${i + 1}`,
    }));
    const built = buildManifold(total, branches);
    const res = buildAndSolve(built.nodes, built.edges, fluidId);
    const stat = sensorStats(res, built.sensorIds);
    if (stat.spread > 0.05) {
      warnings.push(`Branch flows vary by ${(stat.spread * 100).toFixed(0)}% due to manifold trunk drop — add a trim valve per branch to balance exactly.`);
    }
    return {
      ok: true,
      topology: "parallel",
      message: `Parallel manifold: the pump runs at the combined demand and splits into ${n} independent branch${n > 1 ? "es" : ""}, each holding the target. No sensors in series.`,
      nodes: built.nodes,
      edges: built.edges,
      nodeCount: built.nodes.length,
      edgeCount: built.edges.length,
      pumpFlow: total,
      achievedFlow: stat.mean,
      branchSpread: stat.spread,
      warnings,
    };
  }

  // ---- Divider: combined demand below pump minimum → add one bypass ----
  const Qpump = Qmin;
  const Qbypass = Qpump - total;

  // Analytic first cut for a single sample branch's resistance, then choose a
  // diameter with a buildable length and refine with the solver.
  const bypassIdMm = 6.4;
  const bypassLenCm = 15;
  const rBypass = poiseuilleR(bypassIdMm / 1000, bypassLenCm / 100, fluid.viscosity);
  const pManifold = Qbypass * rBypass; // ~manifold pressure (bypass dominates)
  const rBranchNeeded = pManifold / Qt;

  let chosenD = SAMPLE_DIAMETERS[0];
  let chosenLenCm = 40;
  let bestScore = Infinity;
  for (const dmm of SAMPLE_DIAMETERS) {
    const lenM = (rBranchNeeded * Math.PI * Math.pow(dmm / 1000, 4)) / (128 * fluid.viscosity);
    const lenCm = lenM * 100;
    const score = lenCm < 4 || lenCm > 300 ? 1e6 + Math.abs(lenCm - 40) : Math.abs(lenCm - 40);
    if (score < bestScore) {
      bestScore = score;
      chosenD = dmm;
      chosenLenCm = Math.min(300, Math.max(4, lenCm));
    }
  }

  // Bypass FIRST: it carries the bulk flow, so tapping it off the earliest tee
  // keeps the rest of the trunk (feeding the sample branches) nearly drop-free,
  // which is what lets the independent branches hold equal target flow.
  const makeBranches = (lenCm: number): BranchSpec[] => [
    { sample: false, idMm: bypassIdMm, totalLenCm: bypassLenCm, label: "Bypass" },
    ...Array.from({ length: n }, (_, i) => ({
      sample: true,
      idMm: chosenD,
      totalLenCm: lenCm,
      label: n === 1 ? "Sensor" : `Sensor ${i + 1}`,
    })),
  ];

  // Refine sample length against the real solver (laminar R ∝ L, branch flow ∝
  // 1/R, so L *= achieved/target converges in a few steps).
  let lenCm = chosenLenCm;
  let stat = { mean: 0, spread: 0 };
  let built = buildManifold(Qpump, makeBranches(lenCm));
  for (let i = 0; i < 14; i++) {
    const res = buildAndSolve(built.nodes, built.edges, fluidId);
    stat = sensorStats(res, built.sensorIds);
    if (stat.mean <= 0) break;
    const err = stat.mean / Qt;
    if (Math.abs(err - 1) < 0.005) break;
    lenCm = Math.min(2000, Math.max(1, lenCm * err));
    built = buildManifold(Qpump, makeBranches(lenCm));
  }

  const achievedUl = flowFromM3s(stat.mean, "µL/min");
  const targetUl = flowFromM3s(Qt, "µL/min");
  if (Math.abs(achievedUl - targetUl) / targetUl > 0.05) {
    warnings.push("Could not size the sample lines to within 5% of target — adjust sample tube length/diameter manually to fine-tune.");
  }
  if (stat.spread > 0.05) {
    warnings.push(`Branch flows vary by ${(stat.spread * 100).toFixed(0)}% across the manifold — add a trim valve per branch to balance exactly.`);
  }

  return {
    ok: true,
    topology: "divider",
    message: `Flow divider manifold: the pump runs at its ${params.pumpMinValue} ${params.pumpFlowUnit} minimum, a wide bypass sheds the excess, and ${n} independent ${chosenD} mm sample branch${n > 1 ? "es" : ""} (~${Math.round(lenCm)} cm each) throttle to target. No sensors in series.`,
    nodes: built.nodes,
    edges: built.edges,
    nodeCount: built.nodes.length,
    edgeCount: built.edges.length,
    pumpFlow: Qpump,
    achievedFlow: stat.mean,
    branchSpread: stat.spread,
    warnings,
  };
}

// ---- manifold builder ----
//
// reservoir → pump → chain of tees; each tee drops one branch, the last tee
// feeds two. A branch is either a device sample line (tube → sensor → tube →
// outlet) or a plain bypass (tube → outlet). Trunk segments are short and wide
// so the branches see nearly equal manifold pressure.
function buildManifold(pumpFlowM3s: number, branches: BranchSpec[]) {
  const flowUnit = pickFlowUnit(pumpFlowM3s);
  const nodes: ComponentNode[] = [];
  const edges: TubeEdge[] = [];
  const trunkY = 220;
  const trunkIdMm = 9.5; // wide trunk → minimal drop between branch taps

  const res = node(RES(), 40, trunkY);
  const pump = node(PUMP(round3(flowFromM3s(pumpFlowM3s, flowUnit)), flowUnit), 220, trunkY);
  nodes.push(res, pump);
  edges.push(tube(res.id, pump.id, trunkIdMm, 20, "p", "in"));

  const B = branches.length;
  const sensorIds: string[] = [];

  // Resolve the (source node, handle) each branch hangs from.
  const teeNodes: ComponentNode[] = [];
  for (let i = 0; i < B - 1; i++) {
    const tee = node(TEE(), 420 + i * 170, trunkY);
    teeNodes.push(tee);
    nodes.push(tee);
  }
  // Trunk: pump → tee0 → tee1 → ... (via each tee's 'a' handle)
  if (teeNodes.length > 0) {
    edges.push(tube(pump.id, teeNodes[0].id, trunkIdMm, 5, "out", "in"));
    for (let i = 0; i < teeNodes.length - 1; i++) {
      edges.push(tube(teeNodes[i].id, teeNodes[i + 1].id, trunkIdMm, 5, "a", "in"));
    }
  }

  const branchSource = (i: number): { nodeId: string; handle: string; x: number } => {
    if (B === 1) return { nodeId: pump.id, handle: "out", x: 420 };
    if (i < B - 1) return { nodeId: teeNodes[i].id, handle: "b", x: 420 + i * 170 };
    // last branch shares the final tee's 'a' handle
    const t = teeNodes[teeNodes.length - 1];
    return { nodeId: t.id, handle: "a", x: t.position.x + 120 };
  };

  branches.forEach((br, i) => {
    const src = branchSource(i);
    const by = trunkY + 150 + (i % 2) * 80;
    const outY = by + 100;
    if (br.sample) {
      const half = br.totalLenCm / 2;
      const sensor = node(SENS(br.label), src.x, by);
      const outlet = node(OUT(`${br.label} drain`), src.x, outY);
      nodes.push(sensor, outlet);
      edges.push(tube(src.nodeId, sensor.id, br.idMm, half, src.handle, "l", "ptfe"));
      edges.push(tube(sensor.id, outlet.id, br.idMm, half, "r", "p", "ptfe"));
      sensorIds.push(sensor.id);
    } else {
      const outlet = node(OUT(br.label + " outlet"), src.x, by);
      nodes.push(outlet);
      edges.push(tube(src.nodeId, outlet.id, br.idMm, br.totalLenCm, src.handle, "p"));
    }
  });

  return { nodes, edges, sensorIds };
}

// ---- helpers ----

function poiseuilleR(dM: number, lM: number, mu: number): number {
  return (128 * mu * lM) / (Math.PI * Math.pow(dM, 4));
}

function sensorStats(
  res: { nodes: Record<string, { flow?: number }> },
  sensorIds: string[],
): { mean: number; spread: number } {
  if (sensorIds.length === 0) return { mean: 0, spread: 0 };
  const flows = sensorIds.map((sid) => Math.abs(res.nodes[sid]?.flow ?? 0));
  const mean = flows.reduce((a, b) => a + b, 0) / flows.length;
  if (mean <= 0) return { mean: 0, spread: 0 };
  const spread = (Math.max(...flows) - Math.min(...flows)) / mean;
  return { mean, spread };
}

function pickFlowUnit(qM3s: number): FlowUnit {
  const mlmin = flowFromM3s(qM3s, "mL/min");
  if (mlmin < 1) return "µL/min";
  if (mlmin >= 1000) return "L/min";
  return "mL/min";
}

function fmt(qM3s: number): string {
  const mlmin = flowFromM3s(qM3s, "mL/min");
  if (mlmin < 1) return `${flowFromM3s(qM3s, "µL/min").toFixed(0)} µL/min`;
  return `${mlmin.toFixed(mlmin >= 100 ? 0 : 1)} mL/min`;
}

function round3(v: number): number {
  if (v === 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 2);
  return Math.round(v / mag) * mag;
}
