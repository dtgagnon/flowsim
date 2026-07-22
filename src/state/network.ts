// Adapter: translate the visual schematic (React Flow nodes + tube edges) into
// the abstract hydraulic network the solver understands, then map the solver
// output back onto nodes and edges for display.

import {
  solve,
  type HydraulicNetwork,
  type SolverNode,
  type TubeBranch,
  type FlowSource,
} from "../physics/solver";
import { getFluid } from "../physics/fluids";
import { getTubingMaterial, CONNECTORS } from "../physics/catalog";
import { mmToM, lengthToM } from "../physics/units";
import type { ComponentNode, TubeEdge, Results } from "./types";

// A pump exposes two handles; every other component collapses to one node.
function solverNodeId(nodeId: string, handle: string | null | undefined, isPump: boolean): string {
  if (isPump) {
    return handle === "in" ? `${nodeId}:in` : `${nodeId}:out`;
  }
  return nodeId;
}

export function buildAndSolve(
  nodes: ComponentNode[],
  edges: TubeEdge[],
  fluidId: string,
): Results {
  const fluid = getFluid(fluidId);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Degree (incident tube count) of each connector, to split its minor loss.
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const solverNodes: SolverNode[] = [];
  const flowSources: FlowSource[] = [];
  const seen = new Set<string>();

  const pushNode = (n: SolverNode) => {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      solverNodes.push(n);
    }
  };

  for (const n of nodes) {
    const d = n.data;
    switch (d.kind) {
      case "pump": {
        pushNode({ id: `${n.id}:in` });
        pushNode({ id: `${n.id}:out` });
        const q = flowToM3sSafe(d.flowValue, d.flowUnit);
        flowSources.push({ id: n.id, from: `${n.id}:in`, to: `${n.id}:out`, q });
        break;
      }
      case "reservoir":
        pushNode({ id: n.id, fixedPressure: pressureToPaSafe(d.pressureValue, d.pressureUnit) });
        break;
      case "outlet":
        pushNode({ id: n.id, ground: true });
        break;
      default:
        pushNode({ id: n.id });
    }
  }

  // Minor-loss K contributed to a tube by the component at one of its ends.
  const kAtEnd = (nodeId: string): number => {
    const comp = byId.get(nodeId);
    if (!comp || comp.data.kind !== "connector") return 0;
    const c = CONNECTORS[comp.data.connector];
    const deg = Math.max(1, degree.get(nodeId) ?? 1);
    return c.k / deg;
  };

  const tubes: TubeBranch[] = edges.map((e) => {
    const srcIsPump = byId.get(e.source)?.data.kind === "pump";
    const tgtIsPump = byId.get(e.target)?.data.kind === "pump";
    const a = solverNodeId(e.source, e.sourceHandle, srcIsPump);
    const b = solverNodeId(e.target, e.targetHandle, tgtIsPump);
    const data = e.data;
    const idM = mmToM(data?.sizeIdMm ?? 3.2);
    const lengthM = Math.max(1e-4, lengthToM(data?.lengthValue ?? 30, data?.lengthUnit ?? "cm"));
    const material = getTubingMaterial(data?.materialId ?? "silicone");
    return {
      id: e.id,
      a,
      b,
      idM,
      lengthM,
      roughness: material.roughness,
      minorK: kAtEnd(e.source) + kAtEnd(e.target),
    };
  });

  const net: HydraulicNetwork = {
    nodes: solverNodes,
    tubes,
    flowSources,
    density: fluid.density,
    viscosity: fluid.viscosity,
  };

  const raw = solve(net);

  // ---- Map results back to display entities ----
  const results: Results = {
    nodes: {},
    edges: {},
    warnings: [...raw.warnings],
    converged: raw.converged,
  };

  for (const e of edges) {
    const t = raw.tubes[e.id];
    if (!t) continue;
    results.edges[e.id] = {
      flow: t.flow,
      velocity: t.velocity,
      reynolds: t.reynolds,
      regime: t.regime,
      pressureDrop: t.pressureDrop,
    };
  }

  for (const n of nodes) {
    if (n.data.kind === "pump") {
      const pin = raw.pressures[`${n.id}:in`] ?? 0;
      const pout = raw.pressures[`${n.id}:out`] ?? 0;
      const q = flowSources.find((f) => f.id === n.id)?.q ?? 0;
      results.nodes[n.id] = { pressure: pout, flow: q, head: pout - pin };
    } else {
      const p = raw.pressures[n.id] ?? 0;
      // Attribute a flow to inline sensors from an incident tube.
      let flow: number | undefined;
      if (n.data.kind === "sensor") {
        const incident = edges.filter((e) => e.source === n.id || e.target === n.id);
        flow = incident.reduce((m, e) => {
          const f = Math.abs(raw.tubes[e.id]?.flow ?? 0);
          return f > Math.abs(m) ? raw.tubes[e.id]!.flow : m;
        }, 0);
      }
      results.nodes[n.id] = { pressure: p, flow };
    }
  }

  // Guidance warnings for incomplete loops.
  const hasPump = nodes.some((n) => n.data.kind === "pump");
  const hasRef = nodes.some((n) => n.data.kind === "outlet" || n.data.kind === "reservoir");
  if (!hasPump && !nodes.some((n) => n.data.kind === "reservoir")) {
    results.warnings.unshift("Add a pump or reservoir to drive flow.");
  }
  if (hasPump && !hasRef) {
    results.warnings.unshift(
      "Add an open outlet or reservoir so the pump has a return path / pressure reference.",
    );
  }

  return results;
}

function flowToM3sSafe(v: number, unit: string): number {
  if (unit === "µL/min") return v / 60e9;
  if (unit === "L/min") return v / 60e3;
  if (unit === "mL/s") return v / 1e6;
  return v / 60e6; // mL/min
}

function pressureToPaSafe(v: number, unit: string): number {
  if (unit === "kPa") return v * 1000;
  if (unit === "psi") return v * 6894.757;
  if (unit === "Pa") return v;
  return v * 133.322; // mmHg
}
