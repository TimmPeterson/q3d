import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createExampleCatalog, loadExample } from '../src/model/examples.ts';
import { parseDiagram, serializeDiagram } from '../src/model/document.ts';
import { DiagramStore } from '../src/model/store.ts';

const directory = new URL('../examples/', import.meta.url);
const files = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile());
const examples = createExampleCatalog(Object.fromEntries(files.map(file => [
  `../examples/${file.name}`, new URL(encodeURIComponent(file.name), directory).href,
])));
const fixtureCatalog = createExampleCatalog({ '../examples/test-diagram.q3d.json': 'https://example.invalid/test-diagram.json' });
const fixtureStore = new DiagramStore();
const a = fixtureStore.addNode([0, 0, 0], { label: 'A' });
fixtureStore.addEdge(a, a);
const fixtureJSON = serializeDiagram(fixtureStore.document);

test('the catalog discovers new filenames, filters extensions and subdirectories, and sorts naturally', () => {
  const catalog = createExampleCatalog({
    '../examples/example-10.q3d.json': '/assets/ten.json',
    '../examples/example-2.q3d.json': '/assets/two.json',
    '../examples/another_diagram.q3d.json': '/assets/another.json',
    '../examples/notes.md': '/notes.md',
    '../examples/data.json': '/data.json',
    '../examples/data.q3d.json.backup': '/backup.json',
    '../examples/nested/hidden.q3d.json': '/nested.json',
    '../other/outside.q3d.json': '/outside.json',
  });
  assert.deepEqual(catalog, [
    { id: 'another_diagram', name: 'Another diagram', url: '/assets/another.json' },
    { id: 'example-2', name: 'Example 2', url: '/assets/two.json' },
    { id: 'example-10', name: 'Example 10', url: '/assets/ten.json' },
  ]);
  assert.deepEqual(createExampleCatalog({}), []);
});

test('every q3d.json file directly in examples resolves to a valid diagram', async () => {
  assert.deepEqual(new Set(examples.map(example => example.id + '.q3d.json')),
    new Set(files.filter(file => file.name.endsWith('.q3d.json')).map(file => file.name)));
  for (const example of examples) {
    const diagram = parseDiagram(JSON.parse(await readFile(new URL(example.url), 'utf8')));
    assert.equal(diagram.version, 1);
  }
});

test('loading an example uses its asset URL, forwards cancellation, and returns a fresh document', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, fixtureCatalog[0].url);
    assert.equal(options.signal, controller.signal);
    return new Response(fixtureJSON);
  });
  const first = await loadExample(fixtureCatalog, 'test-diagram', controller.signal);
  first.nodes[0].label = 'Edited';
  const second = await loadExample(fixtureCatalog, 'test-diagram', controller.signal);
  assert.equal(second.nodes[0].label, 'A');
});

test('failed requests and invalid example data are rejected', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  await assert.rejects(loadExample(fixtureCatalog, 'test-diagram'), /Could not load example/);
  fetchMock.mock.mockImplementation(async () => new Response('{"version":1,"nodes":[],"edges":[{}]}'));
  await assert.rejects(loadExample(fixtureCatalog, 'test-diagram'), /Invalid diagram file/);
  fetchMock.mock.mockImplementation(async () => { throw new DOMException('Cancelled', 'AbortError'); });
  await assert.rejects(loadExample(fixtureCatalog, 'test-diagram'), { name: 'AbortError' });
});

test('unknown examples are rejected without fetching', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(fixtureJSON));
  await assert.rejects(loadExample(fixtureCatalog, 'missing'), /Unknown example/);
  await assert.rejects(loadExample([], 'test-diagram'), /Unknown example/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('replacing a working diagram with any example is one undoable action', async () => {
  const store = new DiagramStore();
  store.addNode([1, 2, 3], { label: 'My diagram' });
  const original = structuredClone(store.document);
  for (const example of examples) {
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
