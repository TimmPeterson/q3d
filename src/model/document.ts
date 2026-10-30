import type { ArrowKind, Diagram, DiagramEdge, DiagramNode, LabelMode, Shape, Vec3 } from './types.ts';
import { ARROW_HEAD_SCALE_MAX, ARROW_HEAD_SCALE_MIN, ARROW_MIN_SPAN, DIAGRAM_MAX_EDGES, DIAGRAM_MAX_NODES, EDGE_DEFAULTS } from './types.ts';

const fail = (): never => { throw new Error('Invalid diagram file'); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
};
const text = (value: unknown, max = 160): string => {
  if (typeof value !== 'string' || value.length > max) return fail();
  return value;
};
const number = (value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail();
  return value;
};
const choice = <T extends string>(value: unknown, choices: readonly T[]): T => {
  if (!choices.includes(value as T)) return fail();
  return value as T;
};
const color = (value: unknown): string => {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) return fail();
  return value.toLowerCase();
};

export function parseDiagram(input: unknown): Diagram {
  const root = record(input);
  if (root.version !== 1 || !Array.isArray(root.nodes) || !Array.isArray(root.edges)) return fail();
  if (root.nodes.length > DIAGRAM_MAX_NODES || root.edges.length > DIAGRAM_MAX_EDGES) return fail();

  const ids = new Set<string>();
  const id = (value: unknown): string => {
    const result = text(value, 100);
    if (!result || ids.has(result)) return fail();
    ids.add(result);
    return result;
  };
  const nodes: DiagramNode[] = root.nodes.map((item) => {
    const node = record(item);
    if (!Array.isArray(node.position) || node.position.length !== 3) return fail();
    return {
      id: id(node.id),
      position: node.position.map((value) => number(value, -100000, 100000)) as Vec3,
      shape: choice<Shape>(node.shape, ['sphere', 'cube', 'diamond']),
      size: number(node.size, 0.1, 4),
      color: color(node.color),
      label: text(node.label),
      labelMode: choice<LabelMode>(node.labelMode, ['billboard', 'fixed']),
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: DiagramEdge[] = root.edges.map((item) => {
    const edge = record(item);
    const source = text(edge.source, 100);
    const target = text(edge.target, 100);
    if (!nodeIds.has(source) || !nodeIds.has(target)) return fail();
    const start = edge.start === undefined ? 0 : number(edge.start, 0, 1);
    const end = edge.end === undefined ? 1 : number(edge.end, 0, 1);
    if (end - start < ARROW_MIN_SPAN - 1e-9) return fail();
    return {
      id: id(edge.id), source, target,
      kind: choice<ArrowKind>(edge.kind === 'mono-epi' ? 'mono' : edge.kind, ['arrow', 'mono', 'epi', 'inclusion']),
      color: color(edge.color),
      width: number(edge.width, 0.015, 0.12),
      headScale: edge.headScale === undefined ? EDGE_DEFAULTS.headScale : number(edge.headScale, ARROW_HEAD_SCALE_MIN, ARROW_HEAD_SCALE_MAX),
      bend: number(edge.bend, -4, 4),
      start, end,
      label: text(edge.label),
      labelMode: choice<LabelMode>(edge.labelMode, ['billboard', 'fixed']),
    };
  });
  return { version: 1, nodes, edges };
}

export const serializeDiagram = (diagram: Diagram): string => JSON.stringify(diagram, null, 2);
