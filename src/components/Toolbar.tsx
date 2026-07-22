import { useStore } from "../state/store";

export function Toolbar() {
  const loadExample = useStore((s) => s.loadExample);
  const clear = useStore((s) => s.clear);
  const count = useStore((s) => s.nodes.length);

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">≋</span>
        <div>
          <div className="brand-name">FlowSim</div>
          <div className="brand-tag">Medical device test-loop simulator</div>
        </div>
      </div>
      <div className="toolbar-actions">
        <button className="btn" onClick={loadExample}>
          Load example loop
        </button>
        <button className="btn btn-ghost" onClick={clear} disabled={count === 0}>
          Clear
        </button>
      </div>
    </header>
  );
}
