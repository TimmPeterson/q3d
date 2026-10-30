import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagram } from '../src/model/document.ts';
import { constructKernelCube } from '../scripts/generate-kernel-cube.mjs';

const { graph, document, report } = constructKernelCube();
const saved = parseDiagram(JSON.parse(JSON.stringify(document)));
const nodes = new Map(saved.nodes.map(n => [n.id, n]));
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const key = p => p.map(x => Math.abs(x) < 1e-7 ? '0.000000' : x.toFixed(6)).join(',');

test('the kernel-cokernel generator round-trips the complete symmetric construction', () => {
  assert.deepEqual(saved, document);
  assert.equal(report.nodes, 262);
  assert.equal(report.arrows, 546);
  assert.equal(report.kernelCokernelPairs, 150);
  for (const role of ['face', 'reduced', 'naturality', 'diamond']) {
    assert.equal(graph.squares.filter(s => s.role === role).length, 6);
  }
  assert.equal(graph.nodes.filter(n => n.role === 'core').length, 8);
  assert.equal(graph.arrows.filter(e => e.role === 'core').length, 12);
  assert.ok(saved.nodes.every(n => n.size === 0.1 && n.label === ''));
  assert.ok(saved.edges.every(e => e.bend === 0 && e.width <= 0.02 && e.label === '' && e.start === 0 && e.end === 1));
});

test('each initial face contains exactly the 22 nonzero objects of the reference construction', () => {
  for (const s of graph.squares.filter(s => s.role === 'face')) {
    const face = new Set();
    for (const e of [s.h0, s.h1, s.v0, s.v1, s.hK, s.hC, s.vK, s.vC, ...s.comparisons]) {
      for (const node of [e.source, e.target, e.K, e.C]) if (node) face.add(node.id);
    }
    assert.equal(face.size, 22);
    for (const sign of ['K', 'C']) {
      const [a, b] = s.comparisons.map(e => e[sign]);
      assert.ok(graph.arrowsByEnds.has(`${a.id}:${b.id}`));
      assert.ok(graph.arrowsByEnds.has(`${b.id}:${a.id}`));
    }
  }
});

test('all saved kernel-source-target-cokernel chains are collinear and correctly ordered', () => {
  for (const edge of graph.arrows) {
    if (!edge.K || !edge.C) continue;
    const source = nodes.get(edge.source.id).position;
    const target = nodes.get(edge.target.id).position;
    const v = sub(target, source);
    for (const sign of ['K', 'C']) {
      const w = sub(nodes.get(edge[sign].id).position, source);
      const t = dot(w, v) / dot(v, v);
      assert.ok(Math.hypot(...w.map((x, i) => x - t * v[i])) < 2e-8, `${sign}(${edge.id})`);
      assert.ok(sign === 'K' ? t < 0 : t > 1);
    }
  }
});

test('the entire graph preserves permutations of axes and kernel/cokernel duality', () => {
  const positions = new Map(graph.nodes.map(n => [key(n.position), n]));
  const edgeKeys = new Set(graph.arrows.map(e => `${e.source.id}:${e.target.id}`));
  const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const permutation of permutations) for (const dual of [false, true]) {
    const transform = n => positions.get(key(permutation.map(i => dual ? 1 - n.position[i] : n.position[i])));
    for (const node of graph.nodes) {
      const counterpart = transform(node);
      assert.ok(counterpart);
      assert.equal(counterpart.role, node.role);
      if (node.sign) assert.equal(counterpart.sign, dual ? node.sign === 'K' ? 'C' : 'K' : node.sign);
    }
    for (const edge of graph.arrows) {
      const source = transform(dual ? edge.target : edge.source), target = transform(dual ? edge.source : edge.target);
      assert.ok(edgeKeys.has(`${source.id}:${target.id}`), `Missing transformed ${edge.id}`);
    }
  }
});

test('objects do not overlap and straight structural arrows miss unrelated objects', () => {
  for (let i = 0; i < saved.nodes.length; i++) for (let j = i + 1; j < saved.nodes.length; j++) {
    assert.ok(Math.hypot(...sub(saved.nodes[i].position, saved.nodes[j].position)) > 0.8);
  }
  for (const edge of graph.arrows) {
    if (edge.role === 'iso') continue;
    const source = nodes.get(edge.source.id), target = nodes.get(edge.target.id);
    const v = sub(target.position, source.position);
    for (const n of saved.nodes) {
      if (n === source || n === target) continue;
      const w = sub(n.position, source.position), t = dot(w, v) / dot(v, v);
      if (t <= 0 || t >= 1) continue;
      assert.ok(Math.hypot(...w.map((x, i) => x - t * v[i])) > 0.07, `${edge.id} crosses ${n.id}`);
    }
  }
});
