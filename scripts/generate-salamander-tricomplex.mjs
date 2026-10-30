import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseDiagram } from '../src/model/document.ts';

export const SOURCE_URL = 'https://chatgpt.com/share/6ae4faaf-ac14-83ed-b86b-aaaf1b36580c';
export const LATTICE_SPACING = 0.5;

// Coordinates are transcribed from the source table without changing the axes.
export const INVARIANTS = {
  R123: [-1, -1, -1],
  R12: [-1, -1, 0], R13: [-1, 0, -1], R23: [0, -1, -1],
  P1: [-1, 0, 0], P2: [0, -1, 0], P3: [0, 0, -1],
  H1: [-1, 1, 0], H2: [0, -1, 1], H3: [1, 0, -1],
  M: [0, 0, 0],
  Q1: [0, 1, 0], Q2: [0, 0, 1], Q3: [1, 0, 0],
  D12: [0, 1, 1], D13: [1, 1, 0], D23: [1, 0, 1],
  D123: [1, 1, 1],
};

// A --d3--> B --d1--> C --d2--> D --d3--> E.
export const VERTICES = {
  A: [0, 0, 0], B: [0, 0, 4], C: [4, 0, 4], D: [4, 4, 4], E: [4, 4, 8],
};

export const COLORS = {
  black: '#15191e', context: '#b8bec7', corner: '#df5265',
  face: '#72a19a', mixed: '#7293bd', homology: '#9983b0',
  first: '#447bc5', middle: '#329987', last: '#c28a39', bridge: '#9ca5b1',
};

export const EXPANSIONS = [
  { id: 'first', color: COLORS.first, points: ['D123(A)', 'P3(B)', 'M(B)', 'Q1(B)', 'D12(B)'] },
  { id: 'middle', color: COLORS.middle, points: ['D123(B)', 'P1(C)', 'M(C)', 'Q2(C)', 'R123(D)'] },
  { id: 'last', color: COLORS.last, points: ['R12(D)', 'P1(D)', 'M(D)', 'Q3(D)', 'R123(E)'] },
];

export const BRIDGES = [
  ['D12(B)', 'D123(B)'],
  ['R123(D)', 'R12(D)'],
];

export const PANELS = {
  expanded: [-1, 1.5, -2],
};

const sum = (a, b) => a.map((value, axis) => value + b[axis]);
const key = point => point.join(',');
const worldPosition = (panel, point) => sum(PANELS[panel], point.map(value => value * LATTICE_SPACING));

export function referenceId(panel, reference) {
  const [, kind, vertex] = reference.match(/^([A-Z][A-Z0-9]*)\(([A-E])\)$/) ?? [];
  assert.ok(kind in INVARIANTS && vertex in VERTICES, `Unknown invariant ${reference}`);
  return kind === 'M' ? `${panel}.vertex.${vertex}` : `${panel}.${vertex}.${kind}`;
}

function invariantStyle(kind) {
  if (kind === 'D123' || kind === 'R123') return { shape: 'diamond', color: COLORS.corner };
  if (kind.startsWith('D') || kind.startsWith('R')) return { shape: 'cube', color: COLORS.face };
  return { shape: 'sphere', color: kind.startsWith('H') ? COLORS.homology : COLORS.mixed };
}

export function createSalamanderDiagram() {
  const diagram = { version: 1, nodes: [], edges: [] };
  const nodeIds = new Set();
  const usedInvariants = { expanded: new Set() };
  const namedVertices = new Map(Object.entries(VERTICES).map(([name, position]) => [key(position), name]));

  function node(id, position, shape, size, color) {
    if (nodeIds.has(id)) return;
    nodeIds.add(id);
    diagram.nodes.push({ id, position, shape, size, color, label: '', labelMode: 'billboard' });
  }

  function invariant(panel, reference) {
    const id = referenceId(panel, reference);
    usedInvariants[panel].add(reference);
    if (nodeIds.has(id)) return id;
    const [, kind, vertex] = reference.match(/^([A-Z][A-Z0-9]*)\(([A-E])\)$/);
    const style = invariantStyle(kind);
    node(id, worldPosition(panel, sum(VERTICES[vertex], INVARIANTS[kind])), style.shape, 0.1, style.color);
    return id;
  }

  function path(panel, name, points, color) {
    const ids = points.map(reference => invariant(panel, reference));
    for (let i = 1; i < ids.length; i++) diagram.edges.push({
      id: `${panel}.${name}.${i}`, source: ids[i - 1], target: ids[i],
      kind: 'arrow', color, width: color === COLORS.bridge ? 0.015 : 0.02,
      bend: 0, start: 0, end: 1, label: '', labelMode: 'billboard',
    });
  }

  for (const panel of Object.keys(PANELS)) {
    // Two face-adjacent cubes share four vertices: 12 vertices in total.
    for (const x of [0, 4]) for (const y of [0, 4]) for (const z of [0, 4, 8]) {
      const position = [x, y, z];
      const name = namedVertices.get(key(position));
      node(`${panel}.vertex.${name ?? position.join('-')}`, worldPosition(panel, position), 'sphere',
        name ? 0.15 : 0.1, name ? COLORS.black : COLORS.context);
    }
  }

  for (const expansion of EXPANSIONS) path('expanded', expansion.id, expansion.points, expansion.color);
  BRIDGES.forEach((points, i) => path('expanded', `bridge-${i + 1}`, points, COLORS.bridge));

  const result = parseDiagram(diagram);
  assert.equal(result.nodes.length, 24);
  assert.equal(result.edges.length, 14);
  assert.equal(new Set(result.nodes.map(n => key(n.position))).size, result.nodes.length);
  return {
    diagram: result,
    manifest: {
      source: SOURCE_URL,
      latticeSpacing: LATTICE_SPACING,
      baseEdgeLength: 4 * LATTICE_SPACING,
      vertices: VERTICES,
      invariantOffsets: INVARIANTS,
      panelOrigins: PANELS,
      expansions: EXPANSIONS,
      bridges: BRIDGES,
      contractionBlocks: [4, 1, 4, 1, 4],
      usedInvariants: Object.fromEntries(Object.entries(usedInvariants).map(([panel, refs]) => [panel, [...refs]])),
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { diagram, manifest } = createSalamanderDiagram();
  await mkdir(new URL('../examples/', import.meta.url), { recursive: true });
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await writeFile(new URL('../examples/salamander-tricomplex.q3d.json', import.meta.url), JSON.stringify(diagram, null, 2) + '\n');
  await writeFile(new URL('../artifacts/salamander-tricomplex-construction.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ nodes: diagram.nodes.length, arrows: diagram.edges.length, panels: 1,
    latticeSpacing: LATTICE_SPACING, baseEdgeLength: 4 * LATTICE_SPACING,
    expansionLengths: EXPANSIONS.map(e => e.points.length - 1) }, null, 2));
}
