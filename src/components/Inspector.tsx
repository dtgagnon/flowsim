import { useStore } from "../state/store";
import { TUBING_MATERIALS, TUBING_SIZES } from "../physics/catalog";
import { FLUIDS } from "../physics/fluids";
import type { ComponentData } from "../state/types";
import { fmtPressure, fmtFlow, fmtVelocity, fmtReynolds, regimeColor } from "../format";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function NodeInspector({ id }: { id: string }) {
  const node = useStore((s) => s.nodes.find((n) => n.id === id));
  const update = useStore((s) => s.updateNodeData);
  const result = useStore((s) => s.results?.nodes[id]);
  if (!node) return null;
  const d = node.data as ComponentData;

  return (
    <div className="inspector-body">
      <Field label="Label">
        <input value={d.label} onChange={(e) => update(id, { label: e.target.value })} />
      </Field>

      {d.kind === "pump" && (
        <>
          <Field label="Flow rate">
            <div className="row">
              <input
                type="number"
                value={d.flowValue}
                min={0}
                onChange={(e) => update(id, { flowValue: Number(e.target.value) })}
              />
              <select
                value={d.flowUnit}
                onChange={(e) => update(id, { flowUnit: e.target.value as never })}
              >
                <option>µL/min</option>
                <option>mL/min</option>
                <option>L/min</option>
                <option>mL/s</option>
              </select>
            </div>
          </Field>
          {result?.head !== undefined && (
            <div className="result-line">
              Pump head developed: <b>{fmtPressure(result.head)}</b>
            </div>
          )}
        </>
      )}

      {d.kind === "reservoir" && (
        <Field label="Set pressure">
          <div className="row">
            <input
              type="number"
              value={d.pressureValue}
              onChange={(e) => update(id, { pressureValue: Number(e.target.value) })}
            />
            <select
              value={d.pressureUnit}
              onChange={(e) => update(id, { pressureUnit: e.target.value as never })}
            >
              <option>mmHg</option>
              <option>kPa</option>
              <option>psi</option>
              <option>Pa</option>
            </select>
          </div>
        </Field>
      )}

      {d.kind === "connector" && (
        <div className="result-line muted">Fitting — minor loss applied to attached tubing.</div>
      )}

      {result && (
        <div className="result-block">
          <div className="result-line">
            Pressure: <b>{fmtPressure(result.pressure)}</b>
          </div>
          {result.flow !== undefined && (
            <div className="result-line">
              Flow: <b>{fmtFlow(result.flow)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EdgeInspector({ id }: { id: string }) {
  const edge = useStore((s) => s.edges.find((e) => e.id === id));
  const update = useStore((s) => s.updateEdgeData);
  const result = useStore((s) => s.results?.edges[id]);
  if (!edge || !edge.data) return null;
  const d = edge.data;

  return (
    <div className="inspector-body">
      <Field label="Inner diameter">
        <select
          value={d.sizeIdMm}
          onChange={(e) => update(id, { sizeIdMm: Number(e.target.value) })}
        >
          {TUBING_SIZES.map((s) => (
            <option key={s.label} value={s.idMm}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Material">
        <select value={d.materialId} onChange={(e) => update(id, { materialId: e.target.value })}>
          {TUBING_MATERIALS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Length">
        <div className="row">
          <input
            type="number"
            value={d.lengthValue}
            min={0}
            onChange={(e) => update(id, { lengthValue: Number(e.target.value) })}
          />
          <select
            value={d.lengthUnit}
            onChange={(e) => update(id, { lengthUnit: e.target.value as never })}
          >
            <option>mm</option>
            <option>cm</option>
            <option>m</option>
            <option>in</option>
          </select>
        </div>
      </Field>

      {result && (
        <div className="result-block">
          <div className="result-line">
            Flow: <b>{fmtFlow(result.flow)}</b>
          </div>
          <div className="result-line">
            Velocity: <b>{fmtVelocity(result.velocity)}</b>
          </div>
          <div className="result-line">
            Reynolds: <b>{fmtReynolds(result.reynolds)}</b>{" "}
            <span className="regime-chip" style={{ background: regimeColor(result.regime) }}>
              {result.regime}
            </span>
          </div>
          <div className="result-line">
            Pressure drop: <b>{fmtPressure(result.pressureDrop)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

export function Inspector() {
  const { selectedId, selectedKind } = useStore((s) => ({
    selectedId: s.selectedId,
    selectedKind: s.selectedKind,
  }));
  const fluidId = useStore((s) => s.fluidId);
  const setFluid = useStore((s) => s.setFluid);
  const deleteSelected = useStore((s) => s.deleteSelected);

  return (
    <div className="inspector">
      <div className="panel-title">Working fluid</div>
      <div className="inspector-body">
        <Field label="Fluid">
          <select value={fluidId} onChange={(e) => setFluid(e.target.value)}>
            {FLUIDS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="panel-title with-action">
        <span>{selectedKind === "edge" ? "Tubing" : selectedKind === "node" ? "Component" : "Selection"}</span>
        {selectedId && (
          <button className="btn-danger-sm" onClick={deleteSelected}>
            Delete
          </button>
        )}
      </div>
      {selectedId && selectedKind === "node" && <NodeInspector id={selectedId} />}
      {selectedId && selectedKind === "edge" && <EdgeInspector id={selectedId} />}
      {!selectedId && (
        <div className="inspector-body muted">
          Select a component or a tube to edit its properties and see local results.
        </div>
      )}
    </div>
  );
}
