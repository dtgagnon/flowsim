import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, type HydraulicNetwork } from "./solver.ts";
import { area, valveResistance } from "./hydraulics.ts";

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

test("flow divider throttles high pump flow to microliter sampling", () => {
  // 50 mL/min pump; wide bypass + fine sample capillary. Verify the split is
  // resolved accurately at a ~500:1 resistance ratio and mass is conserved.
  const Q = 50 / 60e6; // m^3/s
  const net: HydraulicNetwork = {
    nodes: [
      { id: "src", ground: true },
      { id: "pout" },
      { id: "tee" },
      { id: "out_bp", ground: true },
      { id: "out_sm", ground: true },
    ],
    tubes: [
      { id: "feed", a: "pout", b: "tee", idM: 0.0095, lengthM: 0.4, roughness: 1.5e-6, minorK: 0 },
      // wide bypass, low resistance
      { id: "bypass", a: "tee", b: "out_bp", idM: 0.0064, lengthM: 0.25, roughness: 1.5e-6, minorK: 0 },
      // fine sample capillary, high resistance
      { id: "sample", a: "tee", b: "out_sm", idM: 0.0016, lengthM: 0.5, roughness: 0.5e-6, minorK: 0 },
    ],
    flowSources: [{ id: "pump", from: "src", to: "pout", q: Q }],
    ...WATER,
  };
  const r = solve(net);
  assert.ok(r.converged);
  const qSample = Math.abs(r.tubes.sample.flow);
  const qBypass = Math.abs(r.tubes.bypass.flow);
  // Mass conservation: bypass + sample ≈ pump flow.
  assert.ok(Math.abs(qSample + qBypass - Q) / Q < 0.02, `sum ${qSample + qBypass} vs ${Q}`);
  // Sample tap should land in the microliter-per-minute range.
  const sampleUlMin = qSample * 60e9;
  assert.ok(sampleUlMin > 40 && sampleUlMin < 300, `sample ${sampleUlMin} µL/min`);
  // Deeply laminar in the capillary.
  assert.equal(r.tubes.sample.regime, "laminar");
});

test("valveResistance grows as the valve closes and blocks when shut", () => {
  const D = 0.004;
  const open = valveResistance(D, WATER.viscosity, 100);
  const half = valveResistance(D, WATER.viscosity, 50);
  const nearly = valveResistance(D, WATER.viscosity, 5);
  assert.ok(half > open * 10, "half-open is far more resistive than open");
  assert.ok(nearly > half * 10, "nearly-closed is far more resistive than half");
  assert.ok(valveResistance(D, WATER.viscosity, 0) > 1e14, "closed blocks");
});

test("closing a valve diverts flow to the parallel path even at low flow", () => {
  // Two parallel tubes between a fixed pressure and ground; one carries a valve.
  const build = (openPercent: number): HydraulicNetwork => ({
    nodes: [
      { id: "in", fixedPressure: 500 },
      { id: "out", ground: true },
    ],
    tubes: [
      { id: "open", a: "in", b: "out", idM: 0.004, lengthM: 0.5, roughness: 1.5e-6, minorK: 0 },
      {
        id: "valved",
        a: "in",
        b: "out",
        idM: 0.004,
        lengthM: 0.5,
        roughness: 1.5e-6,
        minorK: 0.1,
        extraR: valveResistance(0.004, WATER.viscosity, openPercent),
      },
    ],
    flowSources: [],
    ...WATER,
  });

  const share = (r: ReturnType<typeof solve>) =>
    Math.abs(r.tubes.valved.flow) /
    (Math.abs(r.tubes.valved.flow) + Math.abs(r.tubes.open.flow));

  assert.ok(share(solve(build(100))) > 0.4, "open valve carries a fair share");
  assert.ok(share(solve(build(5))) < 0.02, "nearly-closed valve is throttled to a trickle");
  assert.ok(share(solve(build(0))) < 1e-6, "closed valve blocks its branch");
});

test("closed loop: reservoir is both supply and return", () => {
  // Pump draws from the reservoir and the loop feeds back into it. The
  // reservoir (a single fixed-pressure node) sources and sinks the same flow,
  // with no open outlet anywhere.
  const Q = 5e-6;
  const net: HydraulicNetwork = {
    nodes: [
      { id: "res", fixedPressure: 0 },
      { id: "a" },
      { id: "b" },
    ],
    tubes: [
      { id: "loop1", a: "a", b: "b", idM: 0.006, lengthM: 0.4, roughness: 1.5e-6, minorK: 0.3 },
      { id: "return", a: "b", b: "res", idM: 0.006, lengthM: 0.4, roughness: 1.5e-6, minorK: 0.3 },
    ],
    flowSources: [{ id: "pump", from: "res", to: "a", q: Q }],
    ...WATER,
  };
  const r = solve(net);
  assert.ok(r.converged);
  // Every segment carries the full recirculating flow (mass conserved).
  assert.ok(Math.abs(Math.abs(r.tubes.loop1.flow) - Q) / Q < 0.02, `loop ${r.tubes.loop1.flow}`);
  assert.ok(Math.abs(Math.abs(r.tubes.return.flow) - Q) / Q < 0.02, `return ${r.tubes.return.flow}`);
  // No warning about a missing reference — the reservoir supplies it.
  assert.ok(!r.warnings.some((w) => w.includes("reference")), r.warnings.join(";"));
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
