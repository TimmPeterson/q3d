export type Vec3 = [number, number, number];
export type Shape = 'sphere' | 'cube' | 'diamond';
export type LabelMode = 'billboard' | 'fixed';
export type ArrowKind = 'arrow' | 'mono' | 'epi' | 'inclusion';
export type Tool = 'select' | 'arrow';
export type WorkPlane = 'XY' | 'XZ' | 'YZ';
export type Projection = 'perspective' | 'orthographic';
export const ARROW_MIN_SPAN = 0.05;

export interface DiagramNode {
  id: string;
  position: Vec3;
  shape: Shape;
  size: number;
  color: string;
  label: string;
  labelMode: LabelMode;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  kind: ArrowKind;
  color: string;
  width: number;
  bend: number;
  start: number;
  end: number;
  label: string;
  labelMode: LabelMode;
}

export interface Diagram {
  version: 1;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export type SelectionItem = { type: 'node' | 'edge'; id: string };
export type Selection = SelectionItem | null;
export type SelectionSet = readonly SelectionItem[];
export type CommonProperties = Pick<DiagramNode, 'label' | 'color' | 'labelMode'>;

export const NODE_DEFAULTS: Omit<DiagramNode, 'id' | 'position'> = {
  shape: 'sphere',
  size: 0.2,
  color: '#45494f',
  label: '',
  labelMode: 'billboard',
};

export const EDGE_DEFAULTS: Omit<DiagramEdge, 'id' | 'source' | 'target'> = {
  kind: 'arrow',
  color: '#45494f',
  width: 0.035,
  bend: 0,
  start: 0,
  end: 1,
  label: '',
  labelMode: 'billboard',
};

export const emptyDiagram = (): Diagram => ({ version: 1, nodes: [], edges: [] });
