import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseDiagram } from '../src/model/document.ts';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, t) => a.map(x => x * t);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = a => Math.sqrt(dot(a, a));
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));
const axis = i => [0, 1, 2].map(j => Number(i === j));
const COLORS = {
  core: '#535f70', auxiliary: '#a0a9b6', line: '#c1c7d0', coreLine: '#7c8899',
  blue: '#365ee0', red: '#df5265', blueSoft: '#6986c0', redSoft: '#c97d89',
  blueLine: '#7892cf', redLine: '#cf8796', comparison: '#627795',
  blueIso: '#bbc8e8', redIso: '#e7bec7',
};

// Words are written in application order, from the innermost functor outwards.
// Adjacent kernels commute, as do adjacent cokernels; mixed functors do not.
function normalWord(word) {
  const result = [];
  for (let i = 0; i < word.length;) {
    let j = i + 1;
    while (j < word.length && word[j].sign === word[i].sign) j++;
    result.push(...word.slice(i, j).sort((a, b) => a.axis - b.axis));
    i = j;
  }
  return result;
}
const wordKey = word => normalWord(word).map(op => `${op.sign}${op.axis}`).join('');

function intersection(a, b, c, d) {
  const u = sub(b, a), v = sub(d, c), w = sub(c, a);
  const uu = dot(u, u), vv = dot(v, v), uv = dot(u, v);
  const denominator = uu * vv - uv * uv;
  assert.ok(denominator > 1e-10, 'Parallel boundary lines');
  const t = (dot(w, u) * vv - dot(w, v) * uv) / denominator;
  const s = (dot(w, u) * uv - dot(w, v) * uu) / denominator;
  const first = add(a, scale(u, t)), second = add(c, scale(v, s));
  assert.ok(norm(sub(first, second)) < 1e-7, 'Skew boundary lines');
  return first;
}

class Construction {
  nodes = [];
  arrows = [];
  values = new Map();
  arrowsByEnds = new Map();
  reduced = new Map();
  squares = [];
  completed = new Map();

  node(position, role = 'auxiliary', sign = null, description = '') {
    const node = { id: `n${String(this.nodes.length + 1).padStart(3, '0')}`, position,
      role, sign, description };
    this.nodes.push(node);
    return node;
  }

  arrow(source, target, role = 'induced', description = '') {
    assert.notEqual(source, target);
    const key = `${source.id}:${target.id}`;
    let edge = this.arrowsByEnds.get(key);
    if (!edge) {
      edge = { id: `e${String(this.arrows.length + 1).padStart(4, '0')}`,
        source, target, role, description, K: null, C: null };
      this.arrows.push(edge);
      this.arrowsByEnds.set(key, edge);
    }
    return edge;
  }

  attach(edge, sign, node) {
    if (edge[sign]) assert.equal(edge[sign], node, `${sign}(${edge.id}) already exists`);
    edge[sign] = node;
    this.arrow(sign === 'K' ? node : edge.target, sign === 'K' ? edge.source : node,
      sign === 'K' ? 'kernel-map' : 'cokernel-map');
    return node;
  }

  extend(edge, sign, position, role = 'auxiliary') {
    if (edge[sign]) return edge[sign];
    return this.attach(edge, sign, this.node(position, role, sign, `${sign}(${edge.id})`));
  }

  value(word, bits) {
    word = normalWord(word);
    const used = new Set(word.map(op => op.axis));
    const remaining = [0, 1, 2].filter(i => !used.has(i));
    const key = `${wordKey(word)}:${remaining.map(i => `${i}${bits[i]}`).join('')}`;
    if (!this.values.has(key)) {
      const position = [0, 1, 2].map(i => bits[i] ?? 0);
      let kernels = 0, cokernels = 0;
      for (const op of word) {
        position[op.axis] = op.sign === 'K' ? -1 + 0.25 * cokernels : 2 - 0.25 * kernels;
        if (op.sign === 'K') kernels++; else cokernels++;
      }
      const pure = word.length > 1 && word.every(op => op.sign === word[0].sign);
      this.values.set(key, this.node(position, !word.length ? 'core' : pure ? 'pure' : 'auxiliary',
        pure ? word[0].sign : null, key));
    }
    return this.values.get(key);
  }

  cube(word = []) {
    word = normalWord(word);
    const key = wordKey(word);
    if (this.reduced.has(key)) return this.reduced.get(key);
    const used = new Set(word.map(op => op.axis));
    const axes = [0, 1, 2].filter(i => !used.has(i));
    const vertices = new Map();
    for (let mask = 0; mask < 1 << axes.length; mask++) {
      const bits = {};
      axes.forEach((a, i) => { bits[a] = (mask >> i) & 1; });
      vertices.set(mask, this.value(word, bits));
    }
    const edges = new Map();
    axes.forEach((a, i) => {
      for (let mask = 0; mask < 1 << axes.length; mask++) {
        if ((mask >> i) & 1) continue;
        edges.set(`${a}:${mask}`, this.arrow(vertices.get(mask), vertices.get(mask | (1 << i)),
          word.length ? 'induced' : 'core'));
      }
    });
    const cube = { word, axes, vertices, edges };
    this.reduced.set(key, cube);
    return cube;
  }

  reduce(cube, a, sign) {
    const next = this.cube([...cube.word, { axis: a, sign }]);
    const aIndex = cube.axes.indexOf(a);
    for (const [key, edge] of cube.edges) {
      if (Number(key.split(':')[0]) !== a) continue;
      const mask = Number(key.split(':')[1]);
      const bits = {};
      cube.axes.forEach((other, i) => { if (i !== aIndex) bits[other] = (mask >> i) & 1; });
      this.attach(edge, sign, this.value(next.word, bits));
    }
    return next;
  }

  baseSquares(cube) {
    const result = [];
    for (let p = 0; p < cube.axes.length; p++) for (let q = p + 1; q < cube.axes.length; q++) {
      for (let mask = 0; mask < 1 << cube.axes.length; mask++) {
        if (((mask >> p) & 1) || ((mask >> q) & 1)) continue;
        const h = cube.axes[p], v = cube.axes[q];
        result.push({
          h0: cube.edges.get(`${h}:${mask}`), h1: cube.edges.get(`${h}:${mask | (1 << q)}`),
          v0: cube.edges.get(`${v}:${mask}`), v1: cube.edges.get(`${v}:${mask | (1 << p)}`),
          axes: [h, v], context: cube.word, mask,
          role: cube.word.length ? 'reduced' : 'face',
        });
      }
    }
    return result;
  }

  complete(square) {
    const { h0, h1, v0, v1 } = square;
    assert.equal(h0.source, v0.source);
    assert.equal(h0.target, v1.source);
    assert.equal(h1.source, v0.target);
    assert.equal(h1.target, v1.target);
    const key = [h0, h1, v0, v1].map(e => e.id).join(':');
    if (this.completed.has(key)) return this.completed.get(key);
    for (const edge of [h0, h1, v0, v1]) {
      assert.ok(edge.K && edge.C, `Missing first boundary of ${edge.id}`);
    }
    const hK = this.arrow(v0.K, v1.K), hC = this.arrow(v0.C, v1.C);
    const vK = this.arrow(h0.K, h1.K), vC = this.arrow(h0.C, h1.C);
    const cross = (a, b) => {
      try { return intersection(a.source.position, a.target.position, b.source.position, b.target.position); }
      catch (error) { throw new Error(`${square.role} ${key}: ${a.source.id}/${a.target.id} ${b.source.id}/${b.target.id}; `
        + JSON.stringify([a.source.position, a.target.position, b.source.position, b.target.position]), { cause: error }); }
    };
    const shared = (a, b, sign) => {
      const position = cross(a, b);
      const existing = a[sign] ?? b[sign];
      const node = existing ?? this.node(position, 'pure', sign, `${sign}${sign}(${key})`);
      assert.ok(norm(sub(node.position, position)) < 1e-7, 'Inconsistent shared boundary');
      this.attach(a, sign, node);
      this.attach(b, sign, node);
    };
    shared(hK, vK, 'K');
    shared(hC, vC, 'C');
    const mixed = (incoming, outgoing) => {
      const corner = cross(incoming, outgoing);
      this.extend(incoming, 'C', lerp(incoming.target.position, corner, 0.75));
      this.extend(outgoing, 'K', lerp(outgoing.source.position, corner, 0.75));
      return this.arrow(incoming.C, outgoing.K, 'comparison');
    };
    const comparisons = [mixed(vK, hC), mixed(hK, vC)];
    const defectRole = square.role === 'face' ? 'face-defect' : 'cube-defect';
    for (const edge of comparisons) {
      const delta = sub(edge.target.position, edge.source.position);
      const extension = square.axes
        ? add(axis(square.axes[0]), axis(square.axes[1]))
        : scale(delta, 1.5 / norm(delta));
      const previousKernels = square.context?.filter(op => op.sign === 'K').length ?? 0;
      const previousCokernels = square.context?.filter(op => op.sign === 'C').length ?? 0;
      this.extend(edge, 'K', sub(edge.source.position, scale(extension, 1 - 0.25 * previousCokernels)), defectRole);
      this.extend(edge, 'C', add(edge.target.position, scale(extension, 1 - 0.25 * previousKernels)), defectRole);
    }
    for (const sign of ['K', 'C']) {
      const [a, b] = comparisons.map(e => e[sign]);
      this.arrow(a, b, 'iso');
      this.arrow(b, a, 'iso');
    }
    const result = { ...square, comparisons, hK, hC, vK, vC };
    this.squares.push(result);
    this.completed.set(key, result);
    return result;
  }

  validate() {
    let maxCollinearityError = 0;
    for (const edge of this.arrows) {
      const vector = sub(edge.target.position, edge.source.position);
      const length = norm(vector);
      assert.ok(length > 0.08, `Too short ${edge.id}`);
      for (const sign of ['K', 'C']) {
        if (!edge[sign]) continue;
        const offset = sub(edge[sign].position, edge.source.position);
        const t = dot(offset, vector) / dot(vector, vector);
        const error = norm(sub(offset, scale(vector, t)));
        maxCollinearityError = Math.max(maxCollinearityError, error);
        assert.ok(error < 1e-7, `${sign}(${edge.id}) is off its line`);
        assert.ok(sign === 'K' ? t < 0 : t > 1, `${sign}(${edge.id}) has incorrect order`);
      }
    }
    const occupied = new Map();
    for (const node of this.nodes) {
      const key = node.position.map(x => x.toFixed(6)).join(',');
      assert.ok(!occupied.has(key), `Coincident nodes ${node.id} / ${occupied.get(key)}`);
      occupied.set(key, node.id);
    }
    const positionKey = p => p.map(x => Math.abs(x) < 1e-7 ? '0.000000' : x.toFixed(6)).join(',');
    const positions = new Set(this.nodes.map(n => positionKey(n.position)));
    for (const permutation of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      for (const node of this.nodes) assert.ok(positions.has(positionKey(permutation.map(i => node.position[i]))),
        'The layout must preserve all six permutations of the cube axes');
    }
    for (const node of this.nodes) assert.ok(positions.has(positionKey(node.position.map(x => 1 - x))),
      'The layout must preserve kernel/cokernel duality');
    return { nodes: this.nodes.length, arrows: this.arrows.length, squares: this.squares.length,
      kernelCokernelPairs: this.arrows.filter(e => e.K && e.C).length, maxCollinearityError };
  }

  document() {
    const spacing = 2.4;
    const top = Math.max(...this.nodes.map(n => n.position[1])) + 0.2;
    const nodes = this.nodes.map(n => ({
      id: n.id,
      // Y points up: all directed cube axes run from the blue pole towards the red pole.
      position: [(n.position[0] - 0.5) * spacing, (top - n.position[1]) * spacing,
        (n.position[2] - 0.5) * spacing].map(x => +x.toFixed(8)),
      shape: n.role === 'core' || n.role === 'face-defect' ? 'cube'
        : n.role === 'cube-defect' ? 'diamond' : 'sphere',
      size: 0.1,
      color: n.role === 'core' ? COLORS.core : n.role === 'auxiliary' ? COLORS.auxiliary
        : n.sign === 'K' ? n.role === 'face-defect' ? COLORS.blueSoft : COLORS.blue
          : n.role === 'face-defect' ? COLORS.redSoft : COLORS.red,
      label: '', labelMode: 'billboard',
    }));
    const edges = this.arrows.map(e => {
      const sign = e.source.sign === e.target.sign ? e.source.sign : null;
      const outer = e.role === 'comparison' || e.role === 'iso'
        || ['face-defect', 'cube-defect'].some(role => e.source.role === role || e.target.role === role);
      return {
        id: e.id, source: e.source.id, target: e.target.id, kind: 'arrow',
        color: e.role === 'core' ? COLORS.coreLine : e.role === 'iso'
          ? sign === 'K' ? COLORS.blueIso : COLORS.redIso
          : outer ? sign === 'K' ? COLORS.blueLine : sign === 'C' ? COLORS.redLine : COLORS.comparison
            : COLORS.line,
        width: e.role === 'iso' ? 0.015 : e.role === 'comparison' ? 0.02 : outer || e.role === 'core' ? 0.018 : 0.015,
        bend: 0, start: 0, end: 1, label: '', labelMode: 'billboard',
      };
    });
    return parseDiagram({ version: 1, nodes, edges });
  }
}

export function constructKernelCube() {
  const graph = new Construction();
  const initial = graph.cube();
  const queue = [initial];
  const seen = new Set();
  while (queue.length) {
    const cube = queue.shift();
    const key = wordKey(cube.word);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const a of cube.axes) for (const sign of ['K', 'C']) queue.push(graph.reduce(cube, a, sign));
  }
  assert.equal(graph.nodes.length, 94, 'All orders of iterated (co)kernels');
  const faces = graph.baseSquares(initial).map(square => graph.complete(square));
  for (const cube of graph.reduced.values()) {
    if (cube.word.length === 1) graph.baseSquares(cube).forEach(square => graph.complete(square));
  }

  // Naturality of each face comparison in the remaining, third direction.
  for (let h = 0; h < 3; h++) for (let v = h + 1; v < 3; v++) {
    const pair = faces.filter(s => s.axes[0] === h && s.axes[1] === v).sort((a, b) => a.mask - b.mask);
    for (let i = 0; i < 2; i++) {
      const a = pair[0].comparisons[i], b = pair[1].comparisons[i];
      graph.complete({ h0: a, h1: b,
        v0: graph.arrow(a.source, b.source), v1: graph.arrow(a.target, b.target), role: 'naturality' });
    }
  }

  // At each mixed corner the four functor orders form a commutative diamond.
  // These six squares contain the compatibility invariants of the whole cube.
  for (const minority of ['K', 'C']) for (let m = 0; m < 3; m++) {
    const [i, j] = [0, 1, 2].filter(a => a !== m);
    const op = (sign, a) => ({ sign, axis: a });
    const K = a => op('K', a), C = a => op('C', a);
    const words = minority === 'C'
      ? [[K(i), K(j), C(m)], [K(i), C(m), K(j)], [K(j), C(m), K(i)], [C(m), K(i), K(j)]]
      : [[K(m), C(i), C(j)], [C(i), K(m), C(j)], [C(j), K(m), C(i)], [C(i), C(j), K(m)]];
    const [a, b, c, d] = words.map(word => graph.value(word, {}));
    graph.complete({ h0: graph.arrow(a, b), h1: graph.arrow(c, d),
      v0: graph.arrow(a, c), v1: graph.arrow(b, d), role: 'diamond' });
  }
  return { graph, document: graph.document(), report: graph.validate() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { graph, document, report } = constructKernelCube();
  const root = new URL('../', import.meta.url);
  await mkdir(new URL('examples/', root), { recursive: true });
  await mkdir(new URL('artifacts/', root), { recursive: true });
  await writeFile(new URL('examples/kernel-cokernel-cube.q3d.json', root), JSON.stringify(document, null, 2) + '\n');
  await writeFile(new URL('artifacts/kernel-cube-construction.json', root), JSON.stringify({ report,
    nodes: graph.nodes.map(n => ({ id: n.id, expression: n.description, role: n.role, sign: n.sign })),
    squares: graph.squares.map(s => ({ role: s.role, edges: [s.h0.id, s.h1.id, s.v0.id, s.v1.id],
      comparisons: s.comparisons.map(e => e.id) })),
    exactLines: graph.arrows.filter(e => e.K && e.C).map(e => [e.K.id, e.source.id, e.target.id, e.C.id]),
  }, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
