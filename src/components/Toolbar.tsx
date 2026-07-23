import { useRef, useState } from "react";
import { useStore } from "../state/store";
import { DesignDialog } from "./DesignDialog";

export function Toolbar() {
  const loadExample = useStore((s) => s.loadExample);
  const loadDivider = useStore((s) => s.loadDivider);
  const exportSchematic = useStore((s) => s.exportSchematic);
  const importSchematic = useStore((s) => s.importSchematic);
  const clear = useStore((s) => s.clear);
  const count = useStore((s) => s.nodes.length);

  const [showDesign, setShowDesign] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const onExport = () => {
    const json = exportSchematic();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowsim-loop.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importSchematic(String(reader.result));
      if (!res.ok) alert(`Import failed: ${res.error}`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <>
      <header className="toolbar">
        <div className="brand">
          <span className="brand-mark">≋</span>
          <div>
            <div className="brand-name">FlowSim</div>
            <div className="brand-tag">Medical device test-loop simulator</div>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setShowDesign(true)}>
            ✦ Design loop
          </button>
          <span className="toolbar-sep" />
          <button className="btn" onClick={loadExample}>
            Example loop
          </button>
          <button className="btn" onClick={loadDivider}>
            Flow divider (µL/min)
          </button>
          <span className="toolbar-sep" />
          <button className="btn" onClick={onExport} disabled={count === 0}>
            Export
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <button className="btn btn-ghost" onClick={clear} disabled={count === 0}>
            Clear
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={onImportFile}
          />
        </div>
      </header>
      {showDesign && <DesignDialog onClose={() => setShowDesign(false)} />}
    </>
  );
}
