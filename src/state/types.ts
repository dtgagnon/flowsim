import type { Node, Edge } from "@xyflow/react";
import type { ConnectorKind } from "../physics/catalog";
import type { PressureUnit, FlowUnit, LengthUnit } from "../physics/units";

// ---- Component node data (React Flow nodes) ----

// React Flow requires node/edge `data` to be index-signature compatible.
interface Indexable {
  [key: string]: unknown;
}

export interface PumpData extends Indexable {
  kind: "pump";
  label: string;
  flowValue: number;
  flowUnit: FlowUnit;
}

export interface ReservoirData extends Indexable {
  kind: "reservoir";
  label: string;
  pressureValue: number;
  pressureUnit: PressureUnit;
}

export interface OutletData extends Indexable {
  kind: "outlet";
  label: string;
}

export interface ConnectorData extends Indexable {
  kind: "connector";
  label: string;
  connector: ConnectorKind;
  /** valve opening 0–100% (only meaningful for valve connector kinds) */
  opening?: number;
  /** inlet bore, mm (only meaningful for reducer/expander fittings) */
  fromMm?: number;
  /** outlet bore, mm (only meaningful for reducer/expander fittings) */
  toMm?: number;
}

export interface SensorData extends Indexable {
  kind: "sensor";
  label: string;
}

export type ComponentData =
  | PumpData
  | ReservoirData
  | OutletData
  | ConnectorData
  | SensorData;

export type ComponentNode = Node<ComponentData>;

// ---- Tubing edge data (React Flow edges) ----

export interface TubeData extends Indexable {
  sizeIdMm: number;
  materialId: string;
  lengthValue: number;
  lengthUnit: LengthUnit;
}

export type TubeEdge = Edge<TubeData>;

// ---- Result overlays ----

export interface NodeResult {
  /** Pa gauge */
  pressure: number;
  /** m^3/s, if a flow can be attributed (sensors, pumps) */
  flow?: number;
  /** pump head, Pa */
  head?: number;
}

export interface EdgeResult {
  flow: number; // m^3/s signed (source→target positive)
  velocity: number;
  reynolds: number;
  regime: string;
  pressureDrop: number; // Pa
}

export interface Results {
  nodes: Record<string, NodeResult>;
  edges: Record<string, EdgeResult>;
  warnings: string[];
  converged: boolean;
}
