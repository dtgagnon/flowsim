import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { useStore } from "../state/store";
import type { TubeData } from "../state/types";
import { fmtFlow, regimeColor } from "../format";

function TubeEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
  });

  const d = data as unknown as TubeData | undefined;
  const result = useStore((s) => s.results?.edges[id]);

  // Line weight scales with tube ID so bigger bore reads as heavier.
  const idMm = d?.sizeIdMm ?? 3.2;
  const width = Math.max(2, Math.min(9, 1.4 + idMm * 0.55));
  const color = result ? regimeColor(result.regime) : "#adb5bd";

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: selected ? width + 2 : width,
          opacity: selected ? 1 : 0.9,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={`edge-label${selected ? " selected" : ""}`}
          style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
        >
          <div className="edge-label-size">⌀{idMm} mm</div>
          {result && (
            <div className="edge-label-flow" style={{ color }}>
              {fmtFlow(result.flow)}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const TubeEdge = memo(TubeEdgeInner);
