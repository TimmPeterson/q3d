import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagram } from '../src/model/document.ts';
import { COLORS, EXPANSIONS, INVARIANTS, LATTICE_SPACING, PANELS, VERTICES, createSalamanderDiagram, referenceId } from '../scripts/generate-salamander-tricomplex.mjs';

const { diagram: generated } = createSalamanderDiagram();
const saved = parseDiagram(JSON.parse(JSON.stringify(generated)));
const byId = new Map(saved.nodes.map(node => [node.id, node]));

test('the salamander generator round-trips the expanded construction: 24 nodes and 14 arrows', () => {
  assert.deepEqual(saved, generated);
  assert.equal(saved.nodes.length, 24);
  assert.equal(saved.edges.length, 14);
  assert.ok(saved.nodes.every(node => node.label === ''));
  assert.ok(saved.edges.every(edge => edge.label === '' && edge.bend === 0));
  assert.equal(saved.nodes.filter(node => node.id.startsWith('expanded.')).length, 24);
  assert.ok(saved.nodes.every(node => node.id.startsWith('expanded.')));
  assert.ok(saved.edges.every(edge => edge.id.startsWith('expanded.')));
});

test('the two cubes have five black and seven gray vertices with four half-unit steps between neighbors', () => {
  for (const panel of Object.keys(PANELS)) {
    const vertices = saved.nodes.filter(node => node.id.startsWith(`${panel}.vertex.`));
    assert.equal(vertices.length, 12);
    assert.equal(vertices.filter(node => node.color === COLORS.black && node.size === 0.15 && node.shape === 'sphere').length, 5);
    assert.equal(vertices.filter(node => node.color === COLORS.context && node.size === 0.1 && node.shape === 'sphere').length, 7);
    const path = ['A', 'B', 'C', 'D', 'E'].map(v => byId.get(`${panel}.vertex.${v}`)!);
    for (let i = 1; i < path.length; i++) {
      const delta = path[i].position.map((value, axis) => value - path[i - 1].position[axis]);
      assert.equal(Math.hypot(...delta), 2);
      assert.equal(Math.hypot(...delta) / LATTICE_SPACING, 4);
      assert.equal(delta.filter(value => value !== 0).length, 1);
    }
    assert.ok(!saved.edges.some(edge => edge.source.startsWith(`${panel}.vertex.`) && edge.target.startsWith(`${panel}.vertex.`)));
  }
});

test('the invariant offsets and all three expanded paths match the supplied conversation', () => {
  assert.equal(Object.keys(INVARIANTS).length, 18);
  assert.deepEqual(EXPANSIONS.map(e => e.points), [
    ['D123(A)', 'P3(B)', 'M(B)', 'Q1(B)', 'D12(B)'],
    ['D123(B)', 'P1(C)', 'M(C)', 'Q2(C)', 'R123(D)'],
    ['R12(D)', 'P1(D)', 'M(D)', 'Q3(D)', 'R123(E)'],
  ]);
  for (const expansion of EXPANSIONS) {
    const arrows = saved.edges.filter(edge => edge.id.startsWith(`expanded.${expansion.id}.`));
    assert.equal(arrows.length, 4);
    arrows.forEach((edge, i) => {
      assert.equal(edge.source, referenceId('expanded', expansion.points[i]));
      assert.equal(edge.target, referenceId('expanded', expansion.points[i + 1]));
      assert.equal(edge.color, expansion.color);
    });
  }
  for (const node of saved.nodes.filter(node => !node.id.includes('.vertex.'))) {
    const [panel, vertex, invariant] = node.id.split('.');
    assert.deepEqual(node.position, VERTICES[vertex].map((value, axis) => (value + INVARIANTS[invariant][axis]) * LATTICE_SPACING + PANELS[panel][axis]));
  }
});

test('all invariant positions lie on the half-unit lattice and central invariants use the black vertices', () => {
  assert.equal(LATTICE_SPACING, 0.5);
  assert.ok(saved.nodes.every(node => node.position.every(value => Number.isInteger(value * 2))));
  for (const vertex of ['B', 'C', 'D']) {
    const id = referenceId('expanded', `M(${vertex})`);
    assert.equal(id, `expanded.vertex.${vertex}`);
    assert.equal(byId.get(id)!.color, COLORS.black);
    assert.ok(saved.edges.some(edge => edge.source === id));
    assert.ok(saved.edges.some(edge => edge.target === id));
  }
});

test('the invariant colors, forms, and object sizes are preserved at the smaller spacing', () => {
  const corners = saved.nodes.filter(node => /\.(D123|R123)$/.test(node.id));
  assert.equal(corners.length, 4);
  assert.ok(corners.every(node => node.shape === 'diamond' && node.color === COLORS.corner));
  assert.ok(saved.nodes.filter(node => node.color !== COLORS.black).every(node => node.size === 0.1));
  assert.ok(saved.nodes.filter(node => node.color === COLORS.black).every(node => node.size === 0.15));
  assert.equal(saved.edges.filter(edge => edge.color === COLORS.first).length, 4);
  assert.equal(saved.edges.filter(edge => edge.color === COLORS.middle).length, 4);
  assert.equal(saved.edges.filter(edge => edge.color === COLORS.last).length, 4);
  assert.equal(saved.edges.filter(edge => edge.color === COLORS.bridge).length, 2);
});

test('all vertices and arrows remain separated from unrelated nodes in three dimensions', () => {
  for (let i = 0; i < saved.nodes.length; i++) for (let j = i + 1; j < saved.nodes.length; j++) {
    assert.ok(Math.hypot(...saved.nodes[i].position.map((value, axis) => value - saved.nodes[j].position[axis])) >= 0.5);
  }
  for (const edge of saved.edges) {
    const source = byId.get(edge.source)!, target = byId.get(edge.target)!;
    const vector = target.position.map((value, axis) => value - source.position[axis]);
    const norm = vector.reduce((sum, value) => sum + value * value, 0);
    for (const node of saved.nodes) {
      if (node === source || node === target) continue;
      const relative = node.position.map((value, axis) => value - source.position[axis]);
      const t = relative.reduce((sum, value, axis) => sum + value * vector[axis], 0) / norm;
      if (t <= 0 || t >= 1) continue;
      assert.ok(Math.hypot(...relative.map((value, axis) => value - t * vector[axis])) > 0.15,
        `${edge.id} passes through ${node.id}`);
    }
  }
});
