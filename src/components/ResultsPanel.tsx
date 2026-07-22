import { useStore } from "../state/store";
import { fmtPressure, fmtFlow } from "../format";

export function ResultsPanel() {
  const nodes = useStore((s) => s.nodes);
  const results = useStore((s) => s.results);
  const select = useStore((s) => s.select);

  const sensors = nodes.filter((n) => n.data.kind === "sensor");
  const pumps = nodes.filter((n) => n.data.kind === "pump");

  return (
    <div className="results-panel">
      <div className="panel-title">Measurement points</div>

      {results?.warnings.length ? (
        <div className="warnings">
          {results.warnings.map((w, i) => (
            <div key={i} className="warning">
              ⚠ {w}
            </div>
          ))}
        </div>
      ) : null}

      {sensors.length === 0 && (
        <div className="muted small">
          Drop a <b>Sensor probe</b> onto the loop to designate a measurement location.
        </div>
      )}

      {sensors.map((s) => {
        const r = results?.nodes[s.id];
        return (
          <div key={s.id} className="measure-card" onClick={() => select(s.id, "node")}>
            <div className="measure-name">◉ {s.data.label}</div>
            <div className="measure-grid">
              <div>
                <span className="measure-k">Pressure</span>
                <span className="measure-v">{r ? fmtPressure(r.pressure) : "—"}</span>
              </div>
              <div>
                <span className="measure-k">Flow</span>
                <span className="measure-v">
                  {r?.flow !== undefined ? fmtFlow(r.flow) : "—"}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {pumps.length > 0 && <div className="panel-title">Pumps</div>}
      {pumps.map((p) => {
        const r = results?.nodes[p.id];
        return (
          <div key={p.id} className="measure-card" onClick={() => select(p.id, "node")}>
            <div className="measure-name">⊚ {p.data.label}</div>
            <div className="measure-grid">
              <div>
                <span className="measure-k">Flow</span>
                <span className="measure-v">{r?.flow !== undefined ? fmtFlow(r.flow) : "—"}</span>
              </div>
              <div>
                <span className="measure-k">Head</span>
                <span className="measure-v">{r?.head !== undefined ? fmtPressure(r.head) : "—"}</span>
              </div>
            </div>
          </div>
        );
      })}

      {results && (
        <div className={`solve-status ${results.converged ? "ok" : "warn"}`}>
          {results.converged ? "● Solved" : "● Approximate"}
        </div>
      )}
    </div>
  );
}
