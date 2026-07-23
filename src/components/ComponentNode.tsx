import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ComponentData } from "../state/types";
import { useStore } from "../state/store";
import { CONNECTORS } from "../physics/catalog";
import { fmtPressure, fmtFlow } from "../format";

interface HandleDef {
  id: string;
  position: Position;
  top?: string;
}

function handlesFor(data: ComponentData): HandleDef[] {
  switch (data.kind) {
    case "pump":
      return [
        { id: "in", position: Position.Left },
        { id: "out", position: Position.Right },
      ];
    case "reservoir":
      return [{ id: "p", position: Position.Right }];
    case "outlet":
      return [{ id: "p", position: Position.Left }];
    case "sensor":
      return [
        { id: "l", position: Position.Left },
        { id: "r", position: Position.Right },
      ];
    case "connector": {
      // 3-port fittings expose a branch handle at the bottom.
      const threePort = ["barbY", "barbTee", "luerY", "luerTee", "stopcock"];
      if (threePort.includes(data.connector)) {
        return [
          { id: "in", position: Position.Left },
          { id: "a", position: Position.Right },
          { id: "b", position: Position.Bottom },
        ];
      }
      return [
        { id: "l", position: Position.Left },
        { id: "r", position: Position.Right },
      ];
    }
  }
}

const ICONS: Record<string, string> = {
  pump: "⊚",
  reservoir: "▭",
  outlet: "◇",
  sensor: "◉",
  connector: "⊹",
};

function ComponentNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ComponentData;
  const result = useStore((s) => s.results?.nodes[id]);
  const handles = handlesFor(d);

  const isValve = d.kind === "connector" && CONNECTORS[d.connector].isValve;
  const icon = isValve ? "⧗" : (ICONS[d.kind] ?? "⊹");
  const badgeClass = `node-card node-${d.kind}${isValve ? " node-valve" : ""}${selected ? " selected" : ""}`;

  return (
    <div className={badgeClass}>
      {handles.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={h.position}
          className="port"
        />
      ))}
      <div className="node-icon">{icon}</div>
      <div className="node-body">
        <div className="node-title">{d.label}</div>
        {isValve && d.kind === "connector" && (
          <div className="node-sub">{`${d.opening ?? 100}% open`}</div>
        )}
        {d.kind === "pump" && (
          <div className="node-sub">{`${d.flowValue} ${d.flowUnit}`}</div>
        )}
        {d.kind === "reservoir" && (
          <div className="node-sub">{`${d.pressureValue} ${d.pressureUnit}`}</div>
        )}
        {result && d.kind === "sensor" && (
          <div className="node-readout">
            <span>{fmtPressure(result.pressure)}</span>
            {result.flow !== undefined && <span>{fmtFlow(result.flow)}</span>}
          </div>
        )}
        {result && d.kind === "pump" && result.head !== undefined && (
          <div className="node-readout">
            <span>Δ{fmtPressure(result.head)}</span>
          </div>
        )}
        {result && (d.kind === "connector" || d.kind === "outlet") && (
          <div className="node-readout">
            <span>{fmtPressure(result.pressure)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeInner);
