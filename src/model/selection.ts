import type { Diagram, DiagramNode, Selection, SelectionSet, Vec3 } from './types.ts';

export function selectionKey(selection: SelectionSet): string {
  return JSON.stringify(selection.map((item) => [item.type, item.id]).sort(([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d)));
}

export function chooseSelection(current: SelectionSet, hit: Selection, additive: boolean): SelectionSet {
  if (!additive) return hit ? [hit] : [];
  if (!hit) return current;
  const exists = current.some((item) => item.id === hit.id && item.type === hit.type);
  return exists ? current.filter((item) => item.id !== hit.id || item.type !== hit.type) : [...current, hit];
}

export function selectedItems(diagram: Diagram, selection: SelectionSet) {
  const nodeIds = new Set(selection.filter((item) => item.type === 'node').map((item) => item.id));
  const edgeIds = new Set(selection.filter((item) => item.type === 'edge').map((item) => item.id));
  return {
    nodes: diagram.nodes.filter((node) => nodeIds.has(node.id)),
    edges: diagram.edges.filter((edge) => edgeIds.has(edge.id)),
  };
}

export function pruneSelection(diagram: Diagram, selection: SelectionSet): SelectionSet {
  const { nodes, edges } = selectedItems(diagram, selection);
  const ids = new Set([...nodes, ...edges].map((item) => item.id));
  return selection.filter((item) => ids.has(item.id));
}

export function sharedValue<T>(values: readonly T[]): T | undefined {
  const first = values[0];
  return values.length && values.every((value) => Object.is(value, first)) ? first : undefined;
}

export function nodeCenter(nodes: readonly Pick<DiagramNode, 'position'>[]): Vec3 | null {
  if (!nodes.length) return null;
  const center: Vec3 = [0, 0, 0];
  nodes.forEach((node) => node.position.forEach((value, axis) => { center[axis] += value / nodes.length; }));
  return center;
}

export function translatedPositions(initial: ReadonlyMap<string, Vec3>, delta: Vec3): Map<string, Vec3> {
  const allowed = [...delta] as Vec3;
  for (let axis = 0; axis < 3; axis++) {
    let min = -Infinity;
    let max = Infinity;
    initial.forEach((position) => {
      min = Math.max(min, -100000 - position[axis]);
      max = Math.min(max, 100000 - position[axis]);
    });
    allowed[axis] = Math.max(min, Math.min(max, allowed[axis]));
  }
  return new Map([...initial].map(([id, position]) => [id, position.map((value, axis) => value + allowed[axis]) as Vec3]));
}
