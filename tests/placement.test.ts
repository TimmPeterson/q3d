import test from 'node:test';
import assert from 'node:assert/strict';
import { findNodePosition } from '../src/editor/placement.ts';
import { NODE_DEFAULTS } from '../src/model/types.ts';
import type { DiagramNode } from '../src/model/types.ts';

test('new spheres have size 0.2 and appear at the view center on the floor', () => {
  assert.equal(NODE_DEFAULTS.size, 0.2);
  assert.deepEqual(findNodePosition([2.2, 8, -3.4], 'XZ', 0, [], NODE_DEFAULTS.size, false), [2.2, 0, -3.4]);
});

test('repeated additions find nearby free positions and honor snapping', () => {
  const nodes: DiagramNode[] = [];
  for (let index = 0; index < 12; index++) {
    const position = findNodePosition([0.3, 5, 0.7], 'XZ', 1.25, nodes, NODE_DEFAULTS.size, true);
    assert.equal(position[1], 1.25);
    assert.ok(Number.isInteger(position[0] * 2));
    assert.ok(Number.isInteger(position[2] * 2));
    assert.ok(nodes.every((node) => Math.hypot(...position.map((value, axis) => value - node.position[axis])) > 0.49));
    nodes.push({ ...NODE_DEFAULTS, id: String(index), position });
  }
});

test('the selected workplane determines the normal coordinate', () => {
  assert.deepEqual(findNodePosition([2, 3, 4], 'XY', 7, [], 0.2, false), [2, 3, 7]);
  assert.deepEqual(findNodePosition([2, 3, 4], 'YZ', -1, [], 0.2, false), [-1, 3, 4]);
});
