import { test } from "node:test";
import assert from "node:assert/strict";
import { synthesizeLoop, type DesignParams } from "./synth.ts";
import { buildAndSolve } from "./network.ts";
import { flowFromM3s } from "../physics/units.ts";

test("parallel design: pump supplies combined demand, sensors independent", () => {
  const params: DesignParams = {
    sensorCount: 3,
    targetFlowValue: 30,
    targetFlowUnit: "mL/min",
    pumpMinValue: 10,
    pumpMaxValue: 200,
    pumpFlowUnit: "mL/min",
  };
  const r = synthesizeLoop(params, "water20");
  assert.equal(r.topology, "parallel");
  assert.ok(r.ok);

  // No two sensors share a series path: each is its own branch to its own drain.
  const sensors = r.nodes.filter((n) => n.data.kind === "sensor");
  assert.equal(sensors.length, 3);
  const outlets = r.nodes.filter((n) => n.data.kind === "outlet");
  assert.equal(outlets.length, 3, "one independent drain per sensor branch");

  // Every sensor reads ~30 mL/min (they split the pump flow in parallel).
  const res = buildAndSolve(r.nodes, r.edges, "water20");
  for (const s of sensors) {
    const q = flowFromM3s(Math.abs(res.nodes[s.id].flow ?? 0), "mL/min");
    assert.ok(Math.abs(q - 30) / 30 < 0.06, `sensor ${s.id} = ${q}`);
  }
});

test("divider design: many independent sample branches sized to target", () => {
  const params: DesignParams = {
    sensorCount: 4,
    targetFlowValue: 100,
    targetFlowUnit: "µL/min",
    pumpMinValue: 20,
    pumpMaxValue: 50,
    pumpFlowUnit: "mL/min",
  };
  const r = synthesizeLoop(params, "water20");
  assert.equal(r.topology, "divider");
  assert.ok(r.ok);

  const sensors = r.nodes.filter((n) => n.data.kind === "sensor");
  assert.equal(sensors.length, 4);

  const res = buildAndSolve(r.nodes, r.edges, "water20");
  for (const s of sensors) {
    const q = flowFromM3s(Math.abs(res.nodes[s.id].flow ?? 0), "µL/min");
    assert.ok(Math.abs(q - 100) / 100 < 0.08, `sensor ${s.id} = ${q} µL/min`);
  }
});

test("single sensor below pump minimum uses a divider", () => {
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
  const achievedUl = flowFromM3s(r.achievedFlow!, "µL/min");
  assert.ok(Math.abs(achievedUl - 100) / 100 < 0.05, `achieved ${achievedUl} µL/min`);
});

test("infeasible: combined demand above pump maximum is rejected", () => {
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
