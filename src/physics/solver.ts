// Hydraulic network solver.
//
// The loop is solved with the electrical analogy: node pressure ↔ voltage,
// volumetric flow ↔ current, hydraulic resistance ↔ resistance. Pumps are
// prescribed-flow (current) sources; reservoirs are prescribed-pressure
// (voltage) sources; an open outlet is a ground reference at 0 Pa gauge.
//
// Because tube resistance depends on flow once the regime turns turbulent, the
// linear nodal system is re-solved in a fixed-point loop with under-relaxation
// until the branch flows converge.

import {
  reynolds,
  regimeFor,
  velocity,
  tubeResistance,
  frictionPressureDrop,
  minorPressureDrop,
  type FlowRegime,
} from "./hydraulics";

export interface SolverNode {
  id: string;
  /** reference node held at 0 Pa gauge */
  ground?: boolean;
  /** prescribed pressure (Pa gauge), e.g. a reservoir */
  fixedPressure?: number;
}

export interface TubeBranch {
  id: string;
  a: string;
  b: string;
  idM: number;
  lengthM: number;
  roughness: number;
  /** summed minor-loss K from fittings at both ends, applied at this tube's velocity */
  minorK: number;
}

export interface FlowSource {
  id: string;
  /** flow is pushed from `from` to `to` */
  from: string;
  to: string;
  /** volumetric flow, m^3/s */
  q: number;
}

export interface HydraulicNetwork {
  nodes: SolverNode[];
  tubes: TubeBranch[];
  flowSources: FlowSource[];
  density: number;
  viscosity: number;
}

export interface TubeResult {
  id: string;
  /** signed flow from a→b, m^3/s */
  flow: number;
  velocity: number;
  reynolds: number;
  regime: FlowRegime;
  /** friction pressure drop magnitude, Pa */
  frictionDrop: number;
  /** minor (fitting) pressure drop magnitude, Pa */
  minorDrop: number;
  /** total pressure drop magnitude, Pa */
  pressureDrop: number;
}

export interface SolveResult {
  pressures: Record<string, number>;
  tubes: Record<string, TubeResult>;
  converged: boolean;
  iterations: number;
  warnings: string[];
}

// Dense Gaussian elimination with partial pivoting. n is small (loop scale).
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  // augment
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // pivot
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-18) return null; // singular
    [M[col], M[piv]] = [M[piv], M[col]];
    const pivVal = M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / pivVal;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x;
}

export function solve(net: HydraulicNetwork): SolveResult {
  const warnings: string[] = [];
  const nodeById = new Map(net.nodes.map((n) => [n.id, n]));

  // Determine known-pressure nodes (ground + reservoirs) vs free unknowns.
  const known = new Map<string, number>();
  for (const n of net.nodes) {
    if (n.ground) known.set(n.id, 0);
    else if (n.fixedPressure !== undefined) known.set(n.id, n.fixedPressure);
  }

  // A network driven only by flow sources is defined up to an additive
  // constant; ground one node so the system is non-singular. For a closed
  // pumped loop this is physically correct (pressures are relative).
  if (known.size === 0) {
    const ref = net.flowSources[0]?.from ?? net.nodes[0]?.id;
    if (ref) {
      known.set(ref, 0);
      warnings.push(
        "No reservoir or open outlet: pressures are reported relative to a grounded reference node.",
      );
    }
  }

  const freeNodes = net.nodes.filter((n) => !known.has(n.id));
  const freeIndex = new Map(freeNodes.map((n, i) => [n.id, i]));
  const nFree = freeNodes.length;

  // Initialise branch flows at zero → first pass uses laminar resistance.
  const flow = new Map<string, number>(net.tubes.map((t) => [t.id, 0]));

  const RELAX = 0.5;
  const MAX_ITERS = 200;
  let converged = false;
  let iterations = 0;
  const pressures: Record<string, number> = {};

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    iterations = iter + 1;

    // Conductance for each tube at the current operating point.
    const cond = new Map<string, number>();
    for (const t of net.tubes) {
      const q = flow.get(t.id) ?? 0;
      const R = tubeResistance(
        q,
        t.idM,
        t.lengthM,
        t.roughness,
        t.minorK,
        net.density,
        net.viscosity,
      );
      cond.set(t.id, R > 0 ? 1 / R : 0);
    }

    // Assemble nodal system for the free nodes.
    const A: number[][] = Array.from({ length: nFree }, () => new Array(nFree).fill(0));
    const rhs = new Array(nFree).fill(0);

    // Tiny leak-to-ground on every node regularises disconnected islands.
    const EPS_G = 1e-15;
    for (let i = 0; i < nFree; i++) A[i][i] += EPS_G;

    for (const t of net.tubes) {
      const g = cond.get(t.id) ?? 0;
      if (g === 0) continue;
      const ai = freeIndex.get(t.a);
      const bi = freeIndex.get(t.b);
      const aKnown = known.get(t.a);
      const bKnown = known.get(t.b);

      if (ai !== undefined) {
        A[ai][ai] += g;
        if (bi !== undefined) A[ai][bi] -= g;
        else if (bKnown !== undefined) rhs[ai] += g * bKnown;
      }
      if (bi !== undefined) {
        A[bi][bi] += g;
        if (ai !== undefined) A[bi][ai] -= g;
        else if (aKnown !== undefined) rhs[bi] += g * aKnown;
      }
    }

    // Flow sources inject current: leaves `from`, enters `to`.
    for (const fs of net.flowSources) {
      const fi = freeIndex.get(fs.from);
      const ti = freeIndex.get(fs.to);
      if (fi !== undefined) rhs[fi] -= fs.q;
      if (ti !== undefined) rhs[ti] += fs.q;
    }

    const x = solveLinear(A, rhs);
    if (!x) {
      warnings.push("Solver could not resolve the network (singular system).");
      break;
    }

    // Node pressures for this iteration.
    const p = new Map<string, number>(known);
    freeNodes.forEach((n, i) => p.set(n.id, x[i]));

    // Update branch flows from the new pressures (under-relaxed).
    let maxDelta = 0;
    let scale = 0;
    for (const t of net.tubes) {
      const g = cond.get(t.id) ?? 0;
      const pa = p.get(t.a) ?? 0;
      const pb = p.get(t.b) ?? 0;
      const qNew = g * (pa - pb); // a→b positive
      const qOld = flow.get(t.id) ?? 0;
      const qRelaxed = qOld + RELAX * (qNew - qOld);
      maxDelta = Math.max(maxDelta, Math.abs(qRelaxed - qOld));
      scale = Math.max(scale, Math.abs(qRelaxed));
      flow.set(t.id, qRelaxed);
    }

    for (const [id, v] of p) pressures[id] = v;

    // Convergence: relative change in branch flows is negligible.
    const tol = 1e-12 + 1e-6 * scale;
    if (maxDelta < tol) {
      converged = true;
      break;
    }
  }

  if (!converged && iterations >= MAX_ITERS) {
    warnings.push("Flow solution did not fully converge; results are approximate.");
  }

  // Build per-tube results at the converged operating point.
  const tubes: Record<string, TubeResult> = {};
  for (const t of net.tubes) {
    const q = flow.get(t.id) ?? 0;
    const re = reynolds(q, t.idM, net.density, net.viscosity);
    const fric = frictionPressureDrop(
      q,
      t.idM,
      t.lengthM,
      t.roughness,
      net.density,
      net.viscosity,
    );
    const minor = minorPressureDrop(q, t.idM, t.minorK, net.density);
    tubes[t.id] = {
      id: t.id,
      flow: q,
      velocity: velocity(q, t.idM),
      reynolds: re,
      regime: regimeFor(re),
      frictionDrop: fric,
      minorDrop: minor,
      pressureDrop: fric + minor,
    };
  }

  // Sanity: flag nodes that ended up isolated.
  for (const n of net.nodes) {
    if (!(n.id in pressures)) pressures[n.id] = 0;
  }
  void nodeById;

  return { pressures, tubes, converged, iterations, warnings };
}
