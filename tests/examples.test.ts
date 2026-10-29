import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EXAMPLES, loadExample } from '../src/model/examples.ts';
import { parseDiagram } from '../src/model/document.ts';
import { DiagramStore } from '../src/model/store.ts';

test('both bundled examples resolve to valid diagrams', async () => {
  assert.deepEqual(EXAMPLES.map(example => example.name), ['Commutative cube', 'Kernels and cokernels']);
  const counts = [];
  for (const example of EXAMPLES) {
    const diagram = parseDiagram(JSON.parse(await readFile(new URL(example.url), 'utf8')));
    counts.push([diagram.nodes.length, diagram.edges.length]);
  }
  assert.deepEqual(counts, [[8, 12], [262, 546]]);
});

test('loading an example uses its asset URL, forwards cancellation, and returns a fresh document', async t => {
  const original = await readFile(new URL(EXAMPLES[0].url), 'utf8');
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, EXAMPLES[0].url);
    assert.equal(options.signal, controller.signal);
    return new Response(original);
  });
  const first = await loadExample('commutative-cube', controller.signal);
  first.nodes[0].label = 'Edited';
  const second = await loadExample('commutative-cube', controller.signal);
  assert.equal(second.nodes[0].label, 'A');
});

test('failed requests and invalid example data are rejected', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  await assert.rejects(loadExample('commutative-cube'), /Could not load example/);
  fetchMock.mock.mockImplementation(async () => new Response('{"version":1,"nodes":[],"edges":[{}]}'));
  await assert.rejects(loadExample('commutative-cube'), /Invalid diagram file/);
  fetchMock.mock.mockImplementation(async () => { throw new DOMException('Cancelled', 'AbortError'); });
  await assert.rejects(loadExample('commutative-cube'), { name: 'AbortError' });
});

test('replacing a working diagram with either example is one undoable action', async () => {
  const store = new DiagramStore();
  store.addNode([1, 2, 3], { label: 'My diagram' });
  const original = structuredClone(store.document);
  for (const example of EXAMPLES) {
    const diagram = parseDiagram(JSON.parse(await readFile(new URL(example.url), 'utf8')));
    store.replace(diagram);
    assert.deepEqual(store.document, diagram);
    store.undo();
    assert.deepEqual(store.document, original);
    store.redo();
    assert.deepEqual(store.document, diagram);
    store.undo();
  }
});
