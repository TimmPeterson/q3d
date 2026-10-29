import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { changeProjection, HOME_DIRECTION, resizeCamera, visibleHeight } from '../src/scene/cameras.ts';

test('switching projection preserves framing at the orbit target and camera orientation', () => {
  const camera = new PerspectiveCamera(40, 1.6, 0.01, 100000);
  const target = new Vector3(2, 0, -1);
  camera.position.copy(target).addScaledVector(HOME_DIRECTION, 15);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const orthographic = changeProjection(camera, 'orthographic', target, 1.6);
  assert.ok(orthographic instanceof OrthographicCamera);
  assert.ok(Math.abs(visibleHeight(camera, target) - visibleHeight(orthographic, target)) < 1e-10);
  assert.ok(camera.quaternion.angleTo(orthographic.quaternion) < 1e-7);
  for (const point of [target, target.clone().add(right), target.clone().add(up)]) {
    const before = point.clone().project(camera);
    const after = point.clone().project(orthographic);
    assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1e-10);
  }
});

test('orthographic scale stays constant at different depths and on resize', () => {
  const camera = new OrthographicCamera(-8, 8, 5, -5, 0.01, 100000);
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  assert.equal(new Vector3(1, 0, 0).project(camera).x, new Vector3(1, 0, -10).project(camera).x);
  resizeCamera(camera, 0.6);
  assert.equal(visibleHeight(camera, new Vector3()), 10);
  assert.equal(camera.right - camera.left, 6);
});

test('returning to perspective preserves the scale after orthographic zoom', () => {
  const camera = new OrthographicCamera(-8, 8, 5, -5, 0.01, 100000);
  camera.position.copy(HOME_DIRECTION).multiplyScalar(15);
  camera.lookAt(0, 0, 0);
  camera.zoom = 2.5;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const target = new Vector3();
  const perspective = changeProjection(camera, 'perspective', target, 1.6);
  assert.ok(perspective instanceof PerspectiveCamera);
  assert.ok(Math.abs(visibleHeight(camera, target) - visibleHeight(perspective, target)) < 1e-10);
});
