import { CONNECTOR_LIST, DEFAULT_CONVERSION } from "../physics/catalog";
import type { PaletteKind } from "../state/store";

interface PaletteItem {
  kind: PaletteKind;
  label: string;
  icon: string;
  sub?: string;
}

const SOURCES: PaletteItem[] = [
  { kind: "pump", label: "Pump", icon: "⊚", sub: "Prescribed flow" },
  { kind: "reservoir", label: "Reservoir", icon: "▭", sub: "Fixed pressure" },
  { kind: "outlet", label: "Open outlet", icon: "◇", sub: "Ambient (0)" },
  { kind: "sensor", label: "Sensor probe", icon: "◉", sub: "P, Q, v readout" },
];

function onDragStart(e: React.DragEvent, kind: PaletteKind) {
  e.dataTransfer.setData("application/flowsim", kind);
  e.dataTransfer.effectAllowed = "move";
}

function Item({ item }: { item: PaletteItem }) {
  return (
    <div
      className="palette-item"
      draggable
      onDragStart={(e) => onDragStart(e, item.kind)}
      title={item.sub}
    >
      <span className="palette-icon">{item.icon}</span>
      <span className="palette-labels">
        <span className="palette-label">{item.label}</span>
        {item.sub && <span className="palette-sub">{item.sub}</span>}
      </span>
    </div>
  );
}

export function Palette() {
  return (
    <div className="palette">
      <div className="palette-hint">Drag components onto the canvas, then drag between ports to connect with tubing.</div>

      <div className="palette-group-title">Sources &amp; probes</div>
      {SOURCES.map((it) => (
        <Item key={it.kind} item={it} />
      ))}

      <div className="palette-group-title">Connectors &amp; fittings</div>
      {CONNECTOR_LIST.filter((c) => !c.isValve).map((c) => {
        const isStep = c.kind === "barbReducer" || c.kind === "barbExpander";
        const sub = isStep
          ? `${DEFAULT_CONVERSION.largeLabel}↔${DEFAULT_CONVERSION.smallLabel} · ${c.note}`
          : `${c.ports} port · K=${c.k}`;
        return (
          <Item
            key={c.kind}
            item={{
              kind: c.kind,
              label: c.name,
              icon: c.ports >= 3 ? "⊻" : "⊹",
              sub,
            }}
          />
        );
      })}

      <div className="palette-group-title">Valves (adjustable)</div>
      {CONNECTOR_LIST.filter((c) => c.isValve).map((c) => (
        <Item
          key={c.kind}
          item={{
            kind: c.kind,
            label: c.name,
            icon: "⧗",
            sub: `${c.note ?? "valve"} · K₀=${c.k}`,
          }}
        />
      ))}
    </div>
  );
}
