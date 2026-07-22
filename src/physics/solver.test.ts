import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, type HydraulicNetwork } from "./solver.ts";
import { area } from "./hydraulics.ts";

const WATER = { density: 998.2, viscosity: 1.002e-3 };

test("laminar single tube matches Hagen–Poiseuille", () => {
  const D = 0.003;
  const L = 1.0;
  const P = 1000; // Pa
  const net: HydraulicNetwork = {
    nodes: [
      { id: "in", fixedPressure: P },
      { id: "out", ground: true },
    ],
    tubes: [{ id: "t1", a: "in", b: "out", idM: D, lengthM: L, roughness: 1.5e-6, minorK: 0 }],
    flowSources: [],
    ...WATER,
  };
  const r = solve(net);
  const R = (128 * WATER.viscosity * L) / (Math.PI * Math.pow(D, 4));
  const expectedQ = P / R;
  assert.ok(r.converged, "should converge");
  assert.ok(
    Math.abs(r.tubes.t1.flow - expectedQ) / expectedQ < 0.02,
    `flow ${r.tubes.t1.flow} vs expected ${expectedQ}`,
  );
  assert.equal(r.tubes.t1.regime, "laminar");
});

test("flow source conserves mass through series tubes", () => {
  const Q = 2e-6; // m^3/s ~ 120 mL/min
  const net: HydraulicNetwork = {
    nodes: [
      { id: "p_in", ground: true },
      { id: "p_out" },
      { id: "mid" },
      { id: "sink" },
    ],
    tubes: [
      { id: "t1", a: "p_out", b: "mid", idM: 0.004, lengthM: 0.5, roughness: 1.5e-6, minorK: 0.2 },
      { id: "t2", a: "mid", b: "sink", idM: 0.004, lengthM: 0.5, roughness: 1.5e-6, minorK: 0.2 },
    ],
    // pump draws from ground reference and pushes into the loop, sink returns
    flowSources: [
      { id: "pump", from: "p_in", to: "p_out", q: Q },
      { id: "return", from: "sink", to: "p_in", q: Q },
    ],
    ...WATER,
  };
  const r = solve(net);
  assert.ok(r.converged);
  // Series flow: both tubes carry the full pump flow.
  assert.ok(Math.abs(Math.abs(r.tubes.t1.flow) - Q) / Q < 0.02, `t1 ${r.tubes.t1.flow}`);
  assert.ok(Math.abs(Math.abs(r.tubes.t2.flow) - Q) / Q < 0.02, `t2 ${r.tubes.t2.flow}`);
});

test("parallel branches split flow by conductance", () => {
  // Two equal parallel tubes should each carry half the flow.
  const Q = 4e-6;
  const net: HydraulicNetwork = {
    nodes: [
      { id: "src", ground: true }, // reference
      { id: "n1" },
      { id: "a" },
      { id: "b" },
    ],
    tubes: [
      { id: "feed", a: "n1", b: "a", idM: 0.006, lengthM: 0.1, roughness: 1.5e-6, minorK: 0 },
      { id: "p1", a: "a", b: "b", idM: 0.003, lengthM: 0.5, roughness: 1.5e-6, minorK: 0 },
      { id: "p2", a: "a", b: "b", idM: 0.003, lengthM: 0.5, roughness: 1.5e-6, minorK: 0 },
      { id: "drain", a: "b", b: "src", idM: 0.006, lengthM: 0.1, roughness: 1.5e-6, minorK: 0 },
    ],
    // pump forces Q from the reference into n1, driving the whole loop
    flowSources: [{ id: "pump", from: "src", to: "n1", q: Q }],
    ...WATER,
  };
  const r = solve(net);
  assert.ok(r.converged);
  assert.ok(
    Math.abs(Math.abs(r.tubes.p1.flow) - Q / 2) / (Q / 2) < 0.03,
    `p1 ${r.tubes.p1.flow}`,
  );
  assert.ok(
    Math.abs(Math.abs(r.tubes.p2.flow) - Q / 2) / (Q / 2) < 0.03,
    `p2 ${r.tubes.p2.flow}`,
  );
});

test("turbulent regime detected at high flow", () => {
  const Q = 5e-5; // m^3/s, high flow in small tube
  const D = 0.004;
  const net: HydraulicNetwork = {
    nodes: [
      { id: "in", ground: true },
      { id: "out" },
    ],
    tubes: [{ id: "t1", a: "in", b: "out", idM: D, lengthM: 1, roughness: 1.5e-6, minorK: 0 }],
    flowSources: [{ id: "pump", from: "in", to: "out", q: Q }],
    ...WATER,
  };
  const r = solve(net);
  const v = Q / area(D);
  const re = (WATER.density * v * D) / WATER.viscosity;
  assert.ok(re > 4000, `Re should be turbulent, got ${re}`);
  assert.equal(r.tubes.t1.regime, "turbulent");
  assert.ok(r.tubes.t1.pressureDrop > 0);
});
