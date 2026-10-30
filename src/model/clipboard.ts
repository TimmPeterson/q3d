import { parseDiagram } from './document.ts';
import { selectedItems, translatedPositions } from './selection.ts';
import { DIAGRAM_MAX_EDGES, DIAGRAM_MAX_NODES, emptyDiagram } from './types.ts';
import type { Diagram, DiagramNode, SelectionSet, Vec3, WorkPlane } from './types.ts';

export const CLIPBOARD_MIME = 'application/x-q3d-selection+json';
const CLIPBOARD_TYPE = 'q3d-selection';
const MAX_CLIPBOARD_LENGTH = 5 * 1024 * 1024;

export function copySelection(diagram: Diagram, selection: SelectionSet): Diagram | null {
  const { nodes, edges } = selectedItems(diagram, selection);
  if (!nodes.length) return null;
  const ids = new Set(nodes.map(node => node.id));
  return structuredClone({
    version: 1,
    nodes,
    edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)),
  });
}

export function serializeClipboard(fragment: Diagram): string {
  return JSON.stringify({ type: CLIPBOARD_TYPE, ...fragment });
}

export function parseClipboard(text: string): Diagram | null {
  if (!text || text.length > MAX_CLIPBOARD_LENGTH) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object' || !('type' in data) || data.type !== CLIPBOARD_TYPE) return null;
    const fragment = parseDiagram(data);
    return fragment.nodes.length ? fragment : null;
  } catch {
    return null;
  }
}

export function pasteStep(plane: WorkPlane): Vec3 {
  if (plane === 'XY') return [0.5, -0.5, 0];
  if (plane === 'YZ') return [0, -0.5, -0.5];
  return [0.5, 0, -0.5];
}

const radius = (node: DiagramNode): number => node.size * (
  node.shape === 'cube' ? Math.sqrt(3) / 2 : node.shape === 'diamond' ? 0.67 : 0.5
);

function pastePositions(fragment: Diagram, existing: Diagram, step: Vec3): Map<string, Vec3> {
  const initial = new Map(fragment.nodes.map(node => [node.id, node.position]));
  const obstacles = existing.nodes.map(node => ({ position: node.position, radius: radius(node) }));
  const direction = step.every(value => value === 0) ? pasteStep('XZ') : step;
  const axes = [0, 1, 2].filter(axis => direction[axis] !== 0);
  const a = axes[0], b = axes[1] ?? (a + 1) % 3;
  const side: Vec3 = [0, 0, 0];
  side[a] = -direction[b];
  side[b] = direction[a];
  const tried = new Set<string>();
  for (let ring = 1; ring <= 256; ring++) for (const [forward, across] of [
    [ring, 0], [ring, ring], [0, ring], [-ring, ring], [-ring, 0], [-ring, -ring], [0, -ring], [ring, -ring],
  ]) {
    const positions = translatedPositions(initial, direction.map((value, axis) => value * forward + side[axis] * across) as Vec3);
    const first = fragment.nodes[0];
    const offset = positions.get(first.id)!.map((value, axis) => value - first.position[axis]).join(',');
    if (tried.has(offset)) continue;
    tried.add(offset);
    const free = fragment.nodes.every(node => {
      const point = positions.get(node.id)!;
      const size = radius(node);
      return obstacles.every(other => Math.hypot(...point.map((value, axis) => value - other.position[axis]))
        > size + other.radius + 0.3);
    });
    if (free) return positions;
  }
  throw new Error('Could not find space to paste.');
}

export function preparePaste(existing: Diagram, input: Diagram, step: Vec3): Diagram {
  const fragment = parseDiagram(input);
  if (!fragment.nodes.length) return emptyDiagram();
  if (existing.nodes.length + fragment.nodes.length > DIAGRAM_MAX_NODES ||
    existing.edges.length + fragment.edges.length > DIAGRAM_MAX_EDGES) {
    throw new Error('Diagram limit reached.');
  }
  const positions = pastePositions(fragment, existing, step);
  const used = new Set([...existing.nodes, ...existing.edges, ...fragment.nodes, ...fragment.edges].map(item => item.id));
  const nextId = (): string => {
    let id: string;
    do { id = crypto.randomUUID(); } while (used.has(id));
    used.add(id);
    return id;
  };
  const ids = new Map(fragment.nodes.map(node => [node.id, nextId()]));
  return {
    version: 1,
    nodes: fragment.nodes.map(node => ({ ...node, id: ids.get(node.id)!, position: positions.get(node.id)! })),
    edges: fragment.edges.map(edge => ({
      ...edge, id: nextId(), source: ids.get(edge.source)!, target: ids.get(edge.target)!,
    })),
  };
}
