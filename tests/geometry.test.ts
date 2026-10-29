import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createEdgeGeometry, edgePath, surfaceDistance } from '../src/scene/edge-geometry.ts';
import { NODE_DEFAULTS, EDGE_DEFAULTS } from '../src/model/types.ts';

test('arrows meet the actual sphere, cube and diamond surfaces', () => {
  const node = { ...NODE_DEFAULTS, id: 'a', position: [0, 0, 0] as [number, number, number], size: 2 };
  const diagonal = new Vector3(1, 1, 1).normalize();
  assert.equal(surfaceDistance(node, diagonal), 1);
  assert.ok(Math.abs(surfaceDistance({ ...node, shape: 'cube' }, diagonal) - Math.sqrt(3)) < 1e-10);
  assert.ok(Math.abs(surfaceDistance({ ...node, shape: 'diamond' }, diagonal) - 1.34 / Math.sqrt(3)) < 1e-10);
});

test('both ends shorten independently along the curved arrow', () => {
  const source = { ...NODE_DEFAULTS, id: 'a', position: [0, 0, 0] as [number, number, number] };
  const target = { ...source, id: 'b', position: [5, 0, 0] as [number, number, number] };
  const edge = { ...EDGE_DEFAULTS, id: 'e', source: 'a', target: 'b', bend: 1.4 };
  const full = edgePath(edge, source, target);
  const shortened = edgePath({ ...edge, start: 0.2, end: 0.75 }, source, target);
  assert.ok(shortened.getPoint(0).distanceTo(full.getPointAt(0.2)) < 1e-10);
  assert.ok(shortened.getPoint(1).distanceTo(full.getPointAt(0.75)) < 1e-10);
  assert.ok(Math.abs(shortened.getLength() / full.getLength() - 0.55) < 0.001);
  const reverse = edgePath({ ...edge, source: 'b', target: 'a', bend: -1.4, start: 0.25, end: 0.8 }, target, source);
  assert.ok(shortened.getPoint(0).distanceTo(reverse.getPoint(1)) < 1e-8);
  assert.ok(shortened.getPoint(1).distanceTo(reverse.getPoint(0)) < 1e-8);
});

test('inclusions have a forward cone at the start; epi keeps both cones at the end', () => {
  const source = { ...NODE_DEFAULTS, id: 'a', position: [0, 0, 0] as [number, number, number] };
  const target = { ...source, id: 'b', position: [5, 0, 0] as [number, number, number] };
  const edge = { ...EDGE_DEFAULTS, id: 'e', source: 'a', target: 'b' };
  const inclusion = createEdgeGeometry({ ...edge, kind: 'inclusion' }, source, target);
  const tail = inclusion.group.getObjectByName('start-head')!;
  assert.ok(tail.position.distanceTo(inclusion.path.getPointAt(0)) < inclusion.path.getLength() / 4);
  assert.ok(new Vector3(0, 1, 0).applyQuaternion(tail.quaternion).dot(new Vector3(1, 0, 0)) > 0.99);
  const epi = createEdgeGeometry({ ...edge, kind: 'epi' }, source, target);
  const heads = epi.group.children.filter((child) => child.name === 'arrow-head');
  assert.equal(heads.length, 2);
  assert.ok(heads.every((head) => head.position.distanceTo(epi.path.getPointAt(1)) < epi.path.getLength() / 4));
  inclusion.dispose();
  epi.dispose();
});

test('loops, overlapping nodes and vertical arrows have finite paths', () => {
  const source = { ...NODE_DEFAULTS, id: 'a', position: [0, 0, 0] as [number, number, number] };
  for (const [id, position] of [['a', [0, 0, 0]], ['b', [0, 0, 0]], ['b', [0, 4, 0]], ['b', [0.05, 0, 0]]] as const) {
    const target = { ...source, id, position: [...position] as [number, number, number] };
    const edge = { ...EDGE_DEFAULTS, id: 'e', source: 'a', target: id };
    const curve = edgePath(edge, source, target);
    assert.ok(curve.getLength() > 0);
    for (const point of curve.getSpacedPoints(30)) assert.ok(point.toArray().every(Number.isFinite));
  }
});

test('reversing endpoints and bend leaves the curve in place', () => {
  const source = { ...NODE_DEFAULTS, id: 'a', position: [-2, 1, 1] as [number, number, number] };
  const target = { ...NODE_DEFAULTS, id: 'b', position: [2, -1, 0] as [number, number, number], shape: 'cube' as const };
  const edge = { ...EDGE_DEFAULTS, id: 'e', source: 'a', target: 'b', bend: 1.4 };
  const before = edgePath(edge, source, target);
  const after = edgePath({ ...edge, source: 'b', target: 'a', bend: -edge.bend }, target, source);
  for (let step = 0; step <= 20; step++) {
    assert.ok(before.getPoint(step / 20).distanceTo(after.getPoint(1 - step / 20)) < 1e-8);
  }
});
