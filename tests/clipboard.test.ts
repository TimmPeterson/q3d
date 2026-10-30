import test from 'node:test';
import assert from 'node:assert/strict';
import { copySelection, parseClipboard, pasteStep, preparePaste, serializeClipboard } from '../src/model/clipboard.ts';
import { parseDiagram } from '../src/model/document.ts';
import { DiagramStore } from '../src/model/store.ts';
import { DIAGRAM_MAX_EDGES, DIAGRAM_MAX_NODES, emptyDiagram } from '../src/model/types.ts';
import type { Diagram, SelectionSet, Vec3 } from '../src/model/types.ts';

function fixture() {
  const store = new DiagramStore();
  const a = store.addNode([-2, 0.3, 1], { label: 'A', size: 0.3, shape: 'cube', color: '#557aa6', labelMode: 'fixed' });
  const b = store.addNode([2, 1.3, -1], { label: 'B', size: 0.2, shape: 'diamond' });
  const c = store.addNode([5, 2, 3]);
  const f = store.addEdge(a, b, { label: 'f', kind: 'mono', color: '#599482', width: 0.045, headScale: 0.55, bend: 0.8, start: 0.1, end: 0.8, labelMode: 'fixed' })!;
  const g = store.addEdge(b, a, { label: 'g', kind: 'epi', bend: -0.6 })!;
  const dangling = store.addEdge(b, c)!;
  const loop = store.addEdge(a, a, { kind: 'inclusion', label: 'loop', bend: 1.2 })!;
  const nodes: SelectionSet = [{ type: 'node', id: a }, { type: 'node', id: b }];
  const all: SelectionSet = [...nodes, ...[f, g, loop].map(id => ({ type: 'edge' as const, id }))];
  return { store, a, b, c, f, g, dangling, loop, nodes, all };
}

test('copying nodes alone does not implicitly copy any of their arrows', () => {
  const { store, nodes, a, b } = fixture();
  const fragment = copySelection(store.document, nodes)!;
  assert.deepEqual(fragment.nodes.map(node => node.id), [a, b]);
  assert.deepEqual(fragment.edges, []);
  assert.equal(store.document.edges.length, 4);
});

test('only explicitly selected arrows with both endpoints selected are copied, including loops', () => {
  const { store, all, dangling, f, g, loop } = fixture();
  const fragment = copySelection(store.document, [...all, { type: 'edge', id: dangling }])!;
  assert.deepEqual(fragment.edges.map(edge => edge.id), [f, g, loop]);
  assert.ok(fragment.edges.every(edge => fragment.nodes.some(node => node.id === edge.source) &&
    fragment.nodes.some(node => node.id === edge.target)));
});

test('an arrow-only or empty selection is not copied; clipboard snapshots are detached', () => {
  const { store, a, f, all } = fixture();
  assert.equal(copySelection(store.document, [{ type: 'edge', id: f }]), null);
  assert.equal(copySelection(store.document, []), null);
  const fragment = copySelection(store.document, all)!;
  store.updateNode(a, { label: 'Changed later', position: [10, 0, 0] });
  assert.equal(fragment.nodes[0].label, 'A');
  assert.deepEqual(fragment.nodes[0].position, [-2, 0.3, 1]);
  fragment.nodes[0].position[0] = -50;
  assert.equal(store.document.nodes[0].position[0], 10);
});

test('clipboard serialization round-trips every property and rejects unrelated or malformed data', () => {
  const { store, all } = fixture();
  const fragment = copySelection(store.document, all)!;
  assert.deepEqual(parseClipboard(serializeClipboard(fragment)), fragment);
  assert.equal(parseClipboard('ordinary text'), null);
  assert.equal(parseClipboard(JSON.stringify(fragment)), null);
  assert.equal(parseClipboard('null'), null);
  assert.equal(parseClipboard('{"type":"q3d-selection"}'), null);
  assert.equal(parseClipboard(serializeClipboard(emptyDiagram())), null);
  assert.equal(parseClipboard(' '.repeat(5 * 1024 * 1024 + 1)), null);
  const broken = structuredClone(fragment);
  broken.edges[0].target = 'missing';
  assert.equal(parseClipboard(serializeClipboard(broken)), null);
});

test('pasting remaps endpoints and IDs, preserves all properties and relative positions, and selects every copy', () => {
  const { store, all, a, b } = fixture();
  const before = structuredClone(store.document);
  const fragment = copySelection(before, all)!;
  const untouched = structuredClone(fragment);
  const selection = store.paste(fragment, pasteStep('XZ'));
  assert.equal(selection.length, 5);
  const nodes = store.document.nodes.slice(before.nodes.length);
  const edges = store.document.edges.slice(before.edges.length);
  const ids = new Map([[a, nodes[0].id], [b, nodes[1].id]]);
  const oldIds = new Set([...before.nodes, ...before.edges].map(item => item.id));
  assert.ok([...nodes, ...edges].every(item => !oldIds.has(item.id)));
  for (let i = 0; i < nodes.length; i++) {
    assert.deepEqual({ ...nodes[i], id: fragment.nodes[i].id, position: fragment.nodes[i].position }, fragment.nodes[i]);
  }
  for (let i = 0; i < edges.length; i++) {
    const original = fragment.edges[i];
    assert.deepEqual(edges[i], { ...original, id: edges[i].id, source: ids.get(original.source), target: ids.get(original.target) });
  }
  const delta = nodes[0].position.map((value, axis) => value - fragment.nodes[0].position[axis]);
  for (let i = 1; i < nodes.length; i++) nodes[i].position.forEach((value, axis) => {
    assert.ok(Math.abs(value - fragment.nodes[i].position[axis] - delta[axis]) < 1e-10);
  });
  assert.deepEqual(fragment, untouched);
  assert.deepEqual(store.document.nodes.slice(0, before.nodes.length), before.nodes);
  assert.deepEqual(store.document.edges.slice(0, before.edges.length), before.edges);
  assert.deepEqual(parseDiagram(store.document), store.document);
});

test('each paste, including a group of arrows, is one undo/redo action', () => {
  const { store, all } = fixture();
  const before = structuredClone(store.document);
  const fragment = copySelection(before, all)!;
  let emissions = 0;
  store.subscribe(() => emissions++);
  store.paste(fragment, pasteStep('XZ'));
  const pasted = structuredClone(store.document);
  assert.equal(emissions, 1);
  store.undo();
  assert.deepEqual(store.document, before);
  store.redo();
  assert.deepEqual(store.document, pasted);
});

test('paste commits an earlier editing transaction separately', () => {
  const { store, a, nodes } = fixture();
  const before = structuredClone(store.document);
  store.beginTransaction();
  store.updateNode(a, { label: 'Edited' });
  const edited = structuredClone(store.document);
  store.paste(copySelection(store.document, nodes)!, pasteStep('XZ'));
  store.undo();
  assert.deepEqual(store.document, edited);
  store.undo();
  assert.deepEqual(store.document, before);
});

test('repeated pastes find free positions and work after the source diagram is deleted', () => {
  const { store, all } = fixture();
  const fragment = copySelection(store.document, all)!;
  const target = new DiagramStore();
  target.paste(fragment, pasteStep('XZ'));
  target.paste(fragment, pasteStep('XZ'));
  target.paste(fragment, pasteStep('XZ'));
  const nodes = target.document.nodes;
  assert.equal(nodes.length, 6);
  assert.equal(target.document.edges.length, 9);
  assert.equal(new Set([...nodes, ...target.document.edges].map(item => item.id)).size, 15);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    assert.ok(Math.hypot(...nodes[i].position.map((value, axis) => value - nodes[j].position[axis])) > 0.4);
  }
  assert.ok(nodes.every(node => !fragment.nodes.some(original => original.id === node.id)));
});

test('pasting a long group can move sideways, and coordinate bounds preserve group geometry', () => {
  const long = new DiagramStore();
  const selected: SelectionSet = Array.from({ length: 300 }, (_, i) => ({ type: 'node', id: long.addNode([i / 2, 0, -i / 2]) }));
  const fragment = copySelection(long.document, selected)!;
  const added = preparePaste(long.document, fragment, pasteStep('XZ'));
  assert.equal(added.nodes.length, 300);
  const corner = new DiagramStore();
  const id = corner.addNode([100000, 0, -100000]);
  const addedAtBoundary = preparePaste(corner.document, copySelection(corner.document, [{ type: 'node', id }])!, pasteStep('XZ'));
  assert.ok(addedAtBoundary.nodes[0].position.every(value => Math.abs(value) <= 100000));
  assert.notDeepEqual(addedAtBoundary.nodes[0].position, corner.document.nodes[0].position);
  assert.deepEqual(pasteStep('XY'), [0.5, -0.5, 0]);
  assert.deepEqual(pasteStep('YZ'), [0, -0.5, -0.5]);
});

test('empty fragments and document limits leave the document and history intact', () => {
  const { store, nodes } = fixture();
  const fragment = copySelection(store.document, nodes)!;
  const before = structuredClone(store.document);
  assert.deepEqual(store.paste(emptyDiagram(), pasteStep('XZ')), []);
  assert.deepEqual(store.document, before);
  const node = fragment.nodes[0];
  const full: Diagram = { version: 1, nodes: Array.from({ length: DIAGRAM_MAX_NODES }, (_, i) => ({ ...node, id: `n${i}`, position: [i, 0, 0] as Vec3 })), edges: [] };
  const fullStore = new DiagramStore(full);
  assert.throws(() => fullStore.paste(fragment, pasteStep('XZ')), /Diagram limit reached/);
  assert.deepEqual(fullStore.document, full);
  assert.equal(fullStore.canUndo, false);
  const edge = { ...store.document.edges[0], source: node.id, target: node.id };
  const fullEdges: Diagram = { version: 1, nodes: [node], edges: Array.from({ length: DIAGRAM_MAX_EDGES }, (_, i) => ({ ...edge, id: `edge${i}` })) };
  const edgeStore = new DiagramStore(fullEdges);
  assert.throws(() => edgeStore.paste({ ...fragment, edges: [{ ...edge, id: 'new-edge' }] }, pasteStep('XZ')), /Diagram limit reached/);
  assert.equal(edgeStore.canUndo, false);
  assert.deepEqual(edgeStore.document, fullEdges);
});
