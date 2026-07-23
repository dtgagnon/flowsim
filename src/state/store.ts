import { create } from "zustand";
import {
  addEdge as rfAddEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import type { ComponentNode, TubeEdge, ComponentData, Results } from "./types";
import { buildAndSolve } from "./network";
import { synthesizeLoop, type DesignParams, type DesignResult } from "./synth";
import { CONNECTORS, DEFAULT_CONVERSION, type ConnectorKind } from "../physics/catalog";

let idSeq = 1;
const nextId = (prefix: string) => `${prefix}_${idSeq++}`;

const DEFAULT_TUBE = {
  sizeIdMm: 6.4,
  materialId: "silicone",
  lengthValue: 30,
  lengthUnit: "cm" as const,
};

export type PaletteKind = "pump" | "reservoir" | "outlet" | "sensor" | ConnectorKind;

function makeComponentData(kind: PaletteKind): ComponentData {
  switch (kind) {
    case "pump":
      return { kind: "pump", label: "Pump", flowValue: 500, flowUnit: "mL/min" };
    case "reservoir":
      return { kind: "reservoir", label: "Reservoir", pressureValue: 0, pressureUnit: "mmHg" };
    case "outlet":
      return { kind: "outlet", label: "Open outlet" };
    case "sensor":
      return { kind: "sensor", label: "Sensor" };
    default: {
      const c = CONNECTORS[kind];
      const base = { kind: "connector" as const, label: c.name, connector: kind };
      if (kind === "barbReducer") {
        return { ...base, fromMm: DEFAULT_CONVERSION.largeMm, toMm: DEFAULT_CONVERSION.smallMm };
      }
      if (kind === "barbExpander") {
        return { ...base, fromMm: DEFAULT_CONVERSION.smallMm, toMm: DEFAULT_CONVERSION.largeMm };
      }
      return { ...base, ...(c.isValve ? { opening: 100 } : {}) };
    }
  }
}

interface Store {
  nodes: ComponentNode[];
  edges: TubeEdge[];
  fluidId: string;
  selectedId: string | null;
  selectedKind: "node" | "edge" | null;
  results: Results | null;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  addComponent: (kind: PaletteKind, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, patch: Partial<ComponentData>) => void;
  updateEdgeData: (id: string, patch: Partial<TubeEdge["data"]>) => void;
  select: (id: string | null, kind: "node" | "edge" | null) => void;
  deleteSelected: () => void;
  setFluid: (id: string) => void;
  loadExample: () => void;
  loadDivider: () => void;
  loadSchematic: (s: { nodes: ComponentNode[]; edges: TubeEdge[]; fluidId?: string }) => void;
  exportSchematic: () => string;
  importSchematic: (json: string) => { ok: boolean; error?: string };
  synthesize: (params: DesignParams) => DesignResult;
  clear: () => void;
  recompute: () => void;
}

const SCHEMATIC_VERSION = 1;

// Set the id counter beyond any existing numeric suffix so new components
// (and imported/generated ones) never collide.
function seqBeyond(nodes: ComponentNode[], edges: TubeEdge[]): number {
  let max = 0;
  for (const item of [...nodes, ...edges]) {
    const m = /_(\d+)$/.exec(item.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export const useStore = create<Store>((set, get) => {
  const recompute = () => {
    const { nodes, edges, fluidId } = get();
    const results = nodes.length ? buildAndSolve(nodes, edges, fluidId) : null;
    set({ results });
  };

  return {
    nodes: [],
    edges: [],
    fluidId: "water20",
    selectedId: null,
    selectedKind: null,
    results: null,

    onNodesChange: (changes) => {
      set({ nodes: applyNodeChanges(changes, get().nodes) as ComponentNode[] });
      if (changes.some((c) => c.type === "remove" || c.type === "position")) recompute();
    },
    onEdgesChange: (changes) => {
      set({ edges: applyEdgeChanges(changes, get().edges) as TubeEdge[] });
      if (changes.some((c) => c.type === "remove")) recompute();
    },
    onConnect: (c) => {
      const edge: TubeEdge = {
        id: nextId("tube"),
        source: c.source!,
        target: c.target!,
        sourceHandle: c.sourceHandle ?? undefined,
        targetHandle: c.targetHandle ?? undefined,
        type: "tube",
        data: { ...DEFAULT_TUBE },
      };
      set({ edges: rfAddEdge(edge, get().edges) as TubeEdge[] });
      recompute();
    },
    addComponent: (kind, position) => {
      const id = nextId(kind);
      const node: ComponentNode = {
        id,
        type: "component",
        position,
        data: makeComponentData(kind),
      };
      set({ nodes: [...get().nodes, node] });
      recompute();
    },
    updateNodeData: (id, patch) => {
      set({
        nodes: get().nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } as ComponentData } : n,
        ),
      });
      recompute();
    },
    updateEdgeData: (id, patch) => {
      set({
        edges: get().edges.map((e) =>
          e.id === id ? { ...e, data: { ...e.data!, ...patch } } : e,
        ),
      });
      recompute();
    },
    select: (id, kind) => set({ selectedId: id, selectedKind: kind }),
    deleteSelected: () => {
      const { selectedId, selectedKind } = get();
      if (!selectedId) return;
      if (selectedKind === "node") {
        set({
          nodes: get().nodes.filter((n) => n.id !== selectedId),
          edges: get().edges.filter((e) => e.source !== selectedId && e.target !== selectedId),
          selectedId: null,
          selectedKind: null,
        });
      } else {
        set({
          edges: get().edges.filter((e) => e.id !== selectedId),
          selectedId: null,
          selectedKind: null,
        });
      }
      recompute();
    },
    setFluid: (id) => {
      set({ fluidId: id });
      recompute();
    },
    loadExample: () => {
      const ex = buildExample();
      idSeq = ex.nextSeq;
      set({ nodes: ex.nodes, edges: ex.edges, selectedId: null, selectedKind: null });
      recompute();
    },
    loadDivider: () => {
      const ex = buildDividerExample();
      idSeq = ex.nextSeq;
      set({ nodes: ex.nodes, edges: ex.edges, selectedId: null, selectedKind: null });
      recompute();
    },
    loadSchematic: ({ nodes, edges, fluidId }) => {
      idSeq = seqBeyond(nodes, edges);
      set({
        nodes,
        edges,
        ...(fluidId ? { fluidId } : {}),
        selectedId: null,
        selectedKind: null,
      });
      recompute();
    },
    exportSchematic: () => {
      const { nodes, edges, fluidId } = get();
      const payload = {
        app: "flowsim",
        version: SCHEMATIC_VERSION,
        fluidId,
        nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          type: e.type,
          data: e.data,
        })),
      };
      return JSON.stringify(payload, null, 2);
    },
    importSchematic: (json) => {
      try {
        const p = JSON.parse(json);
        if (p?.app !== "flowsim" || !Array.isArray(p.nodes) || !Array.isArray(p.edges)) {
          return { ok: false, error: "Not a FlowSim schematic file." };
        }
        const nodes = p.nodes.map((n: any) => ({
          id: String(n.id),
          type: "component",
          position: { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 },
          data: n.data,
        })) as ComponentNode[];
        const edges = p.edges.map((e: any) => ({
          id: String(e.id),
          source: String(e.source),
          target: String(e.target),
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
          type: "tube",
          data: e.data,
        })) as TubeEdge[];
        get().loadSchematic({ nodes, edges, fluidId: p.fluidId });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Invalid JSON." };
      }
    },
    synthesize: (params) => {
      const result = synthesizeLoop(params, get().fluidId);
      if (result.ok) {
        get().loadSchematic({ nodes: result.nodes, edges: result.edges });
      }
      return result;
    },
    clear: () => {
      set({ nodes: [], edges: [], results: null, selectedId: null, selectedKind: null });
    },
    recompute,
  };
});

// A representative test loop: reservoir → pump → sensor → Y-split → outlet.
function buildExample() {
  const n = (id: string, kind: PaletteKind, x: number, y: number): ComponentNode => ({
    id,
    type: "component",
    position: { x, y },
    data: makeComponentData(kind),
  });

  const nodes: ComponentNode[] = [
    n("reservoir_1", "reservoir", 40, 200),
    n("pump_1", "pump", 240, 190),
    n("sensor_1", "sensor", 460, 200),
    n("barbY_1", "barbY", 660, 200),
    n("sensor_2", "sensor", 880, 110),
    n("outlet_1", "outlet", 1080, 110),
    n("outlet_2", "outlet", 880, 300),
  ];
  (nodes.find((x) => x.id === "pump_1")!.data as any).flowValue = 800;

  const tube = (
    id: string,
    source: string,
    target: string,
    sizeIdMm: number,
    lengthValue: number,
    sourceHandle?: string,
    targetHandle?: string,
  ): TubeEdge => ({
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: "tube",
    data: { sizeIdMm, materialId: "silicone", lengthValue, lengthUnit: "cm" },
  });

  const edges: TubeEdge[] = [
    tube("tube_1", "reservoir_1", "pump_1", 9.5, 20, "p", "in"),
    tube("tube_2", "pump_1", "sensor_1", 9.5, 25, "out", "l"),
    tube("tube_3", "sensor_1", "barbY_1", 9.5, 25, "r", "in"),
    tube("tube_4", "barbY_1", "sensor_2", 6.4, 40, "a", "l"),
    tube("tube_5", "sensor_2", "outlet_1", 6.4, 30, "r", "p"),
    tube("tube_6", "barbY_1", "outlet_2", 6.4, 40, "b", "p"),
  ];

  return { nodes, edges, nextSeq: 100 };
}

// Flow-divider loop: a 50 mL/min pump is split at a tee into a wide-bore
// bypass (carries the bulk of the flow) and a fine-bore sample capillary sized
// so the sampling tap sees ~100 µL/min. This is the "pump high, throttle down
// with tubing physics" pattern used to reach microliter-per-minute sampling.
function buildDividerExample() {
  const n = (id: string, kind: PaletteKind, x: number, y: number): ComponentNode => ({
    id,
    type: "component",
    position: { x, y },
    data: makeComponentData(kind),
  });

  const nodes: ComponentNode[] = [
    n("reservoir_1", "reservoir", 40, 230),
    n("pump_1", "pump", 220, 220),
    n("barbTee_1", "barbTee", 420, 230),
    n("sensor_bypass", "sensor", 640, 110),
    n("outlet_bypass", "outlet", 860, 110),
    n("sensor_sample", "sensor", 640, 360),
    n("outlet_sample", "outlet", 860, 360),
  ];
  const pump = nodes.find((x) => x.id === "pump_1")!.data as any;
  pump.flowValue = 50;
  pump.flowUnit = "mL/min";
  (nodes.find((x) => x.id === "sensor_bypass")!.data as any).label = "Bypass";
  (nodes.find((x) => x.id === "sensor_sample")!.data as any).label = "Sample point";

  const tube = (
    id: string,
    source: string,
    target: string,
    sizeIdMm: number,
    lengthValue: number,
    materialId: string,
    sourceHandle?: string,
    targetHandle?: string,
  ): TubeEdge => ({
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: "tube",
    data: { sizeIdMm, materialId, lengthValue, lengthUnit: "cm" },
  });

  const edges: TubeEdge[] = [
    tube("tube_1", "reservoir_1", "pump_1", 9.5, 20, "silicone", "p", "in"),
    tube("tube_2", "pump_1", "barbTee_1", 9.5, 20, "silicone", "out", "in"),
    // Wide-bore bypass — low resistance, carries almost all of the 50 mL/min.
    tube("tube_3", "barbTee_1", "sensor_bypass", 6.4, 15, "silicone", "a", "l"),
    tube("tube_4", "sensor_bypass", "outlet_bypass", 6.4, 10, "silicone", "r", "p"),
    // Fine-bore sample capillary — high resistance, throttles to ~100 µL/min.
    tube("tube_5", "barbTee_1", "sensor_sample", 1.6, 40, "ptfe", "b", "l"),
    tube("tube_6", "sensor_sample", "outlet_sample", 1.6, 10, "ptfe", "r", "p"),
  ];

  return { nodes, edges, nextSeq: 100 };
}
