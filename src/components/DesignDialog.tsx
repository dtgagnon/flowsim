import { useState } from "react";
import { useStore } from "../state/store";
import type { DesignParams, DesignResult } from "../state/synth";
import type { FlowUnit } from "../physics/units";
import { fmtFlow } from "../format";

const FLOW_UNITS: FlowUnit[] = ["µL/min", "mL/min", "L/min", "mL/s"];

export function DesignDialog({ onClose }: { onClose: () => void }) {
  const synthesize = useStore((s) => s.synthesize);

  const [sensorCount, setSensorCount] = useState(1);
  const [targetFlowValue, setTargetFlowValue] = useState(100);
  const [targetFlowUnit, setTargetFlowUnit] = useState<FlowUnit>("µL/min");
  const [pumpMinValue, setPumpMinValue] = useState(20);
  const [pumpMaxValue, setPumpMaxValue] = useState(50);
  const [pumpFlowUnit, setPumpFlowUnit] = useState<FlowUnit>("mL/min");
  const [result, setResult] = useState<DesignResult | null>(null);

  const run = () => {
    const params: DesignParams = {
      sensorCount,
      targetFlowValue,
      targetFlowUnit,
      pumpMinValue,
      pumpMaxValue,
      pumpFlowUnit,
    };
    setResult(synthesize(params));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Design a loop</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="modal-intro">
          Specify what the sensors need and what the pump can do. FlowSim builds the loop
          with the fewest nodes and edges that meets the spec, then solves it to confirm.
        </p>

        <div className="design-form">
          <label className="field">
            <span className="field-label">Number of sensors</span>
            <input
              type="number"
              min={1}
              max={12}
              value={sensorCount}
              onChange={(e) => setSensorCount(Number(e.target.value))}
            />
          </label>

          <label className="field">
            <span className="field-label">Target flow at each sensor</span>
            <div className="row">
              <input
                type="number"
                min={0}
                value={targetFlowValue}
                onChange={(e) => setTargetFlowValue(Number(e.target.value))}
              />
              <select
                value={targetFlowUnit}
                onChange={(e) => setTargetFlowUnit(e.target.value as FlowUnit)}
              >
                {FLOW_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          </label>

          <div className="field">
            <span className="field-label">Pump flow range (min – max)</span>
            <div className="row">
              <input
                type="number"
                min={0}
                value={pumpMinValue}
                onChange={(e) => setPumpMinValue(Number(e.target.value))}
              />
              <span className="range-dash">–</span>
              <input
                type="number"
                min={0}
                value={pumpMaxValue}
                onChange={(e) => setPumpMaxValue(Number(e.target.value))}
              />
              <select
                value={pumpFlowUnit}
                onChange={(e) => setPumpFlowUnit(e.target.value as FlowUnit)}
              >
                {FLOW_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={run}>
            Generate loop
          </button>
        </div>

        {result && (
          <div className={`design-result ${result.ok ? "ok" : "bad"}`}>
            {result.ok ? (
              <>
                <div className="design-result-head">
                  <span className={`topo-badge topo-${result.topology}`}>{result.topology}</span>
                  <span>
                    {result.nodeCount} nodes · {result.edgeCount} edges
                  </span>
                </div>
                <p>{result.message}</p>
                {result.achievedFlow !== undefined && (
                  <p className="design-achieved">
                    Achieved at sensors: <b>{fmtFlow(result.achievedFlow)}</b>
                    {result.pumpFlow !== undefined && (
                      <>
                        {" "}
                        · pump <b>{fmtFlow(result.pumpFlow)}</b>
                      </>
                    )}
                  </p>
                )}
                {result.warnings.map((w, i) => (
                  <p key={i} className="design-warn">
                    ⚠ {w}
                  </p>
                ))}
                <p className="design-hint">Loaded onto the canvas — close to view and fine-tune.</p>
              </>
            ) : (
              <p>{result.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
