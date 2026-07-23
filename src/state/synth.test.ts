import { test } from "node:test";
import assert from "node:assert/strict";
import { synthesizeLoop, type DesignParams } from "./synth.ts";
import { buildAndSolve } from "./network.ts";
import { flowFromM3s } from "../physics/units.ts";

test("series design: pump reaches target directly, minimal topology", () => {
  const params: DesignParams = {
    sensorCount: 3,
    targetFlowValue: 30,
    targetFlowUnit: "mL/min",
    pumpMinValue: 10,
    pumpMaxValue: 100,
    pumpFlowUnit: "mL/min",
  };
  const r = synthesizeLoop(params, "water20");
  assert.equal(r.topology, "series");
  assert.ok(r.ok);
  // reservoir + pump + 3 sensors + outlet = 6 nodes; 5 tubes
  assert.equal(r.nodeCount, 6);
  assert.equal(r.edgeCount, 5);
  const achievedMlMin = flowFromM3s(r.achievedFlow!, "mL/min");
  assert.ok(Math.abs(achievedMlMin - 30) < 0.5, `achieved ${achievedMlMin}`);

  // Every sensor should read ~30 mL/min (series mass conservation).
  const res = buildAndSolve(r.nodes, r.edges, "water20");
  for (const n of r.nodes) {
    if (n.data.kind === "sensor") {
      const q = flowFromM3s(Math.abs(res.nodes[n.id].flow ?? 0), "mL/min");
      assert.ok(Math.abs(q - 30) < 0.5, `sensor ${n.id} = ${q}`);
    }
  }
});

test("divider design: sub-minimum target sized to within 5%", () => {
  const params: DesignParams = {
    sensorCount: 1,
    targetFlowValue: 100,
    targetFlowUnit: "µL/min",
    pumpMinValue: 20,
    pumpMaxValue: 50,
    pumpFlowUnit: "mL/min",
  };
  const r = synthesizeLoop(params, "water20");
  assert.equal(r.topology, "divider");
  assert.ok(r.ok);
  const achievedUl = flowFromM3s(r.achievedFlow!, "µL/min");
  assert.ok(Math.abs(achievedUl - 100) / 100 < 0.05, `achieved ${achievedUl} µL/min`);
  // Divider adds exactly one branch: tee + bypass sensor + 2 outlets.
  assert.ok(r.nodeCount >= 7, `nodes ${r.nodeCount}`);
});

test("infeasible: target above pump maximum is rejected", () => {
  const params: DesignParams = {
    sensorCount: 1,
    targetFlowValue: 100,
    targetFlowUnit: "mL/min",
    pumpMinValue: 5,
    pumpMaxValue: 50,
    pumpFlowUnit: "mL/min",
  };
  const r = synthesizeLoop(params, "water20");
  assert.equal(r.topology, "infeasible");
  assert.ok(!r.ok);
  assert.equal(r.nodeCount, 0);
});
