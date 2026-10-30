import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagramStore } from '../src/model/store.ts';
import { parseDiagram } from '../src/model/document.ts';
import { chooseSelection, nodeCenter, pruneSelection, selectedItems, selectionKey, sharedValue, translatedPositions } from '../src/model/selection.ts';
import type { SelectionSet, Vec3 } from '../src/model/types.ts';

test('Shift toggles items; a normal click replaces the selection and empty Shift-click keeps it', () => {
  const a = { type: 'node' as const, id: 'a' };
  const b = { type: 'node' as const, id: 'b' };
  const edge = { type: 'edge' as const, id: 'f' };
  let selection = chooseSelection([], a, false);
  selection = chooseSelection(selection, b, true);
  selection = chooseSelection(selection, edge, true);
  assert.equal(selection.length, 3);
  assert.equal(selectionKey(selection), selectionKey([edge, b, a]));
  assert.deepEqual(chooseSelection(selection, null, true), selection);
  assert.deepEqual(chooseSelection(selection, b, true), [a, edge]);
  assert.deepEqual(chooseSelection(selection, b, false), [b]);
  assert.deepEqual(chooseSelection(selection, null, false), []);
});

test('shared values distinguish common, mixed and empty selections', () => {
  assert.equal(sharedValue(['sphere', 'sphere']), 'sphere');
  assert.equal(sharedValue(['sphere', 'cube']), undefined);
  assert.equal(sharedValue([0.2, 0.6]), undefined);
  assert.equal(sharedValue(['', '']), '');
  assert.equal(sharedValue([]), undefined);
});

test('group movement preserves relative positions and clamps the entire group at workspace bounds', () => {
  const initial = new Map<string, Vec3>([['a', [99999, 0.2, 3]], ['b', [99995, 2.7, -1]]]);
  const moved = translatedPositions(initial, [5, 0.5, -2]);
  assert.deepEqual(moved.get('a'), [100000, 0.7, 1]);
  assert.deepEqual(moved.get('b'), [99996, 3.2, -3]);
  assert.deepEqual(initial.get('a'), [99999, 0.2, 3]);
  assert.deepEqual(nodeCenter([{ position: [0, 0, 0] }, { position: [4, 2, -2] }]), [2, 1, -1]);
});

test('editing different primitives changes only the requested property in one undo step', () => {
  const store = new DiagramStore();
  const a = store.addNode([-2, 0, 0], { shape: 'sphere', size: 0.2, label: 'A' });
  const b = store.addNode([2, 1, 0], { shape: 'cube', size: 0.6, label: 'B', color: '#557aa6' });
  const c = store.addNode([0, 0, -3]);
  const original = structuredClone(store.document);
  let changes = 0;
  store.subscribe(() => { changes++; });
  store.updateNodes([a, b], { color: '#7b6ba6' });
  assert.equal(changes, 1);
  assert.deepEqual(store.document.nodes.map((node) => node.shape), ['sphere', 'cube', 'sphere']);
  assert.deepEqual(store.document.nodes.map((node) => node.size), [0.2, 0.6, 0.2]);
  assert.equal(store.document.nodes.find((node) => node.id === c)!.color, original.nodes[2].color);
  store.undo();
  assert.deepEqual(store.document, original);
  store.redo();
  assert.ok(store.document.nodes.filter((node) => node.id !== c).every((node) => node.color === '#7b6ba6'));
});

test('mixed node/arrow editing applies common fields atomically and preserves all type-specific fields', () => {
  const store = new DiagramStore();
  const a = store.addNode([0, 0, 0], { label: 'A', shape: 'diamond' });
  const b = store.addNode([3, 0, 0]);
  const f = store.addEdge(a, b, { kind: 'mono', label: 'f', width: 0.06 })!;
  const original = structuredClone(store.document);
  const selection: SelectionSet = [{ type: 'node', id: a }, { type: 'edge', id: f }];
  store.updateCommon(selection, { labelMode: 'fixed', color: '#599482' });
  assert.equal(store.document.nodes[0].labelMode, 'fixed');
  assert.equal(store.document.edges[0].labelMode, 'fixed');
  assert.equal(store.document.nodes[0].label, 'A');
  assert.equal(store.document.edges[0].label, 'f');
  assert.equal(store.document.nodes[0].shape, 'diamond');
  assert.equal(store.document.edges[0].kind, 'mono');
  assert.equal(store.document.edges[0].width, 0.06);
  assert.deepEqual(store.document.nodes[1], original.nodes[1]);
  store.undo();
  assert.deepEqual(store.document, original);
});

test('group dragging is one undo step and leaves connected arrow endpoints intact', () => {
  const store = new DiagramStore();
  const a = store.addNode([-2, 0.2, 0]);
  const b = store.addNode([2, 0.7, 1]);
  const c = store.addNode([0, 4, 0]);
  store.addEdge(a, b);
  store.addEdge(a, c);
  const original = structuredClone(store.document);
  const initial = new Map<string, Vec3>(original.nodes.filter((node) => node.id !== c).map((node) => [node.id, node.position]));
  store.beginTransaction();
  store.setNodePositions(translatedPositions(initial, [0.5, 0, 0]));
  store.setNodePositions(translatedPositions(initial, [1.5, 0, 0]));
  store.finishTransaction();
  assert.deepEqual(store.document.nodes[0].position, [-0.5, 0.2, 0]);
  assert.deepEqual(store.document.nodes[1].position, [3.5, 0.7, 1]);
  assert.deepEqual(store.document.nodes[2], original.nodes[2]);
  assert.deepEqual(store.document.edges, original.edges);
  store.undo();
  assert.deepEqual(store.document, original);
});

test('changing a group center translates its members instead of stacking them', () => {
  const store = new DiagramStore();
  const a = store.addNode([-2, 0, 0]);
  const b = store.addNode([2, 1, 0]);
  store.translateNodes([a, b], [3, 0, 0]);
  assert.deepEqual(store.document.nodes.map((node) => node.position), [[1, 0, 0], [5, 1, 0]]);
  assert.deepEqual(nodeCenter(store.document.nodes), [3, 0.5, 0]);
});

test('bulk shortening respects every selected arrow without changing its opposite end', () => {
  const store = new DiagramStore();
  const a = store.addNode([0, 0, 0]);
  const b = store.addNode([4, 0, 0]);
  const f = store.addEdge(a, b, { end: 0.4 })!;
  const g = store.addEdge(a, b, { start: 0.5, end: 0.9 })!;
  const h = store.addEdge(b, a)!;
  store.updateEdges([f, g], { start: 0.8 });
  assert.ok(store.document.edges.slice(0, 2).every((edge) => Math.abs(edge.start - 0.35) < 1e-10));
  assert.deepEqual(store.document.edges.slice(0, 2).map((edge) => edge.end), [0.4, 0.9]);
  assert.equal(store.document.edges.find((edge) => edge.id === h)!.start, 0);
  store.updateEdges([f, g], { end: 0.1 });
  assert.ok(store.document.edges.slice(0, 2).every((edge) => Math.abs(edge.end - 0.4) < 1e-10));
  assert.deepEqual(parseDiagram(JSON.parse(JSON.stringify(store.document))), store.document);
});

test('resizing heads in a group preserves arrow types and thickness and is one undo step', () => {
  const store = new DiagramStore();
  const a = store.addNode([0, 0, 0]);
  const b = store.addNode([4, 0, 0]);
  const f = store.addEdge(a, b, { kind: 'epi', headScale: 0.5, width: 0.02 })!;
  const g = store.addEdge(b, a, { kind: 'inclusion', headScale: 2, width: 0.06 })!;
  store.addEdge(a, a);
  const before = structuredClone(store.document);
  store.beginTransaction();
  store.updateEdges([f, g], { headScale: 1.25 });
  store.updateEdges([f, g], { headScale: 0.4 });
  store.finishTransaction();
  assert.deepEqual(store.document.edges, before.edges.map((edge, i) => i < 2 ? { ...edge, headScale: 0.4 } : edge));
  const resized = structuredClone(store.document);
  store.undo();
  assert.deepEqual(store.document, before);
  store.redo();
  assert.deepEqual(store.document, resized);
});

test('deleting a mixed selection cascades once, retains unrelated arrows and supports undo', () => {
  const store = new DiagramStore();
  const a = store.addNode([0, 0, 0]);
  const b = store.addNode([2, 0, 0]);
  const c = store.addNode([4, 0, 0]);
  store.addEdge(a, b);
  const f = store.addEdge(b, c)!;
  const keep = store.addEdge(c, c)!;
  const original = structuredClone(store.document);
  const selection: SelectionSet = [{ type: 'node', id: a }, { type: 'edge', id: f }];
  store.removeSelection(selection);
  assert.deepEqual(store.document.edges.map((edge) => edge.id), [keep]);
  assert.deepEqual(pruneSelection(store.document, selection), []);
  store.undo();
  assert.deepEqual(store.document, original);
  assert.equal(selectedItems(store.document, selection).nodes.length, 1);
  assert.equal(selectedItems(store.document, selection).edges.length, 1);
});

test('bulk reversal reverses each arrow independently and is undone as one action', () => {
  const store = new DiagramStore();
  const a = store.addNode([0, 0, 0]);
  const b = store.addNode([4, 0, 0]);
  const f = store.addEdge(a, b, { start: 0.1, end: 0.7 })!;
  const g = store.addEdge(b, a, { start: 0.2, end: 0.8, kind: 'epi' })!;
  const original = structuredClone(store.document);
  store.reverseEdges([f, g]);
  assert.equal(store.document.edges[0].source, b);
  assert.equal(store.document.edges[1].source, a);
  assert.ok(Math.abs(store.document.edges[0].start - 0.3) < 1e-10);
  assert.equal(store.document.edges[1].kind, 'epi');
  store.undo();
  assert.deepEqual(store.document, original);
});
