import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagramStore } from '../src/model/store.ts';
import { parseDiagram, serializeDiagram } from '../src/model/document.ts';

test('deleting a node removes its arrows; undo restores the entire diagram', () => {
  const store = new DiagramStore();
  const a = store.addNode([0, 0, 0]);
  const b = store.addNode([1, 0, 1]);
  store.addEdge(a, b, { kind: 'mono' });
  store.addEdge(a, a);
  const original = structuredClone(store.document);
  store.remove({ type: 'node', id: a });
  assert.equal(store.document.nodes.length, 1);
  assert.equal(store.document.edges.length, 0);
  store.undo();
  assert.deepEqual(store.document, original);
  store.redo();
  assert.equal(store.document.edges.length, 0);
});

test('a drag is one undo step and a new edit invalidates redo', () => {
  const store = new DiagramStore();
  const id = store.addNode([0, 0, 0]);
  store.beginTransaction();
  store.updateNode(id, { position: [1, 2, 3] });
  store.updateNode(id, { position: [5, 6, 7] });
  store.finishTransaction();
  store.undo();
  assert.deepEqual(store.document.nodes[0].position, [0, 0, 0]);
  store.redo();
  assert.deepEqual(store.document.nodes[0].position, [5, 6, 7]);
  store.undo();
  store.updateNode(id, { label: 'A' });
  assert.equal(store.canRedo, false);
});

test('parallel and opposite arrows get separate curves', () => {
  const store = new DiagramStore();
  const a = store.addNode([0, 0, 0]);
  const b = store.addNode([3, 0, 0]);
  store.addEdge(a, b);
  store.addEdge(a, b);
  store.addEdge(b, a);
  const bends = store.document.edges.map((edge) => edge.source === a ? edge.bend : -edge.bend);
  assert.equal(new Set(bends).size, 3);
});

test('reversing an arrow preserves its curve and can be undone', () => {
  const store = new DiagramStore();
  const a = store.addNode([0, 0, 0]);
  const b = store.addNode([3, 0, 0]);
  const edge = store.addEdge(a, b, { bend: 1.2 })!;
  store.reverseEdge(edge);
  assert.equal(store.document.edges[0].source, b);
  assert.equal(store.document.edges[0].target, a);
  assert.equal(store.document.edges[0].bend, -1.2);
  store.undo();
  assert.equal(store.document.edges[0].source, a);
});

test('saved diagrams round-trip all object and arrow properties', () => {
  const store = new DiagramStore();
  const a = store.addNode([-3, 1, 7], { shape: 'diamond', label: 'A ⊗ B', labelMode: 'fixed', color: '#557aa6' });
  store.addEdge(a, a, { kind: 'epi', label: 'id', bend: 2 });
  assert.deepEqual(parseDiagram(JSON.parse(serializeDiagram(store.document))), store.document);
});

test('import rejects broken references, duplicate ids, unsafe numbers and unsupported versions', () => {
  const store = new DiagramStore();
  const a = store.addNode([0, 0, 0]);
  store.addEdge(a, a);
  const doc = store.document;
  assert.throws(() => parseDiagram({ ...doc, version: 2 }));
  assert.throws(() => parseDiagram({ ...doc, nodes: [doc.nodes[0], doc.nodes[0]] }));
  assert.throws(() => parseDiagram({ ...doc, edges: [{ ...doc.edges[0], target: 'missing' }] }));
  assert.throws(() => parseDiagram({ ...doc, nodes: [{ ...doc.nodes[0], position: [NaN, 0, 0] }] }));
  assert.throws(() => parseDiagram({ ...doc, nodes: [{ ...doc.nodes[0], size: -1 }] }));
  assert.throws(() => parseDiagram({ ...doc, nodes: [{ ...doc.nodes[0], color: 'url(x)' }] }));
  assert.throws(() => parseDiagram({ ...doc, edges: [{ ...doc.edges[0], start: 0.9, end: 0.4 }] }));
  assert.throws(() => parseDiagram({ ...doc, edges: [{ ...doc.edges[0], start: 0.5, end: 0.51 }] }));
});

test('older diagrams keep working and the removed combined arrow migrates to mono', () => {
  const store = new DiagramStore();
  const id = store.addNode([0, 0, 0]);
  store.addEdge(id, id);
  const old = JSON.parse(serializeDiagram(store.document));
  old.edges[0].kind = 'mono-epi';
  delete old.edges[0].start;
  delete old.edges[0].end;
  const restored = parseDiagram(old);
  assert.equal(restored.edges[0].kind, 'mono');
  assert.equal(restored.edges[0].start, 0);
  assert.equal(restored.edges[0].end, 1);
});

test('reversing a shortened arrow swaps its ends and undo restores its range', () => {
  const store = new DiagramStore();
  const a = store.addNode([0, 0, 0]);
  const b = store.addNode([4, 0, 0]);
  const id = store.addEdge(a, b, { kind: 'inclusion', start: 0.1, end: 0.65 })!;
  store.reverseEdge(id);
  assert.ok(Math.abs(store.document.edges[0].start - 0.35) < 1e-10);
  assert.equal(store.document.edges[0].end, 0.9);
  store.undo();
  assert.equal(store.document.edges[0].start, 0.1);
  assert.equal(store.document.edges[0].end, 0.65);
  assert.deepEqual(parseDiagram(JSON.parse(serializeDiagram(store.document))), store.document);
});
