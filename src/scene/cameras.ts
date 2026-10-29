import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import type { Projection } from '../model/types.ts';

export type EditorCamera = PerspectiveCamera | OrthographicCamera;
export const FIELD_OF_VIEW = 40;
export const HOME_DIRECTION = new Vector3(8, 7, 10).normalize();

export function visibleHeight(camera: EditorCamera, target: Vector3): number {
  if (camera instanceof OrthographicCamera) return (camera.top - camera.bottom) / camera.zoom;
  return 2 * camera.position.distanceTo(target) * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
}

export function resizeCamera(camera: EditorCamera, aspect: number): void {
  if (camera instanceof PerspectiveCamera) camera.aspect = aspect;
  else {
    const halfHeight = (camera.top - camera.bottom) / 2;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
  }
  camera.updateProjectionMatrix();
}

export function changeProjection(camera: EditorCamera, projection: Projection, target: Vector3, aspect: number): EditorCamera {
  const isOrthographic = camera instanceof OrthographicCamera;
  if (isOrthographic === (projection === 'orthographic')) return camera;
  const halfHeight = visibleHeight(camera, target) / 2;
  const next = projection === 'orthographic'
    ? new OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 0.01, 100000)
    : new PerspectiveCamera(FIELD_OF_VIEW, aspect, 0.01, 100000);
  next.position.copy(camera.position);
  next.quaternion.copy(camera.quaternion);
  next.up.copy(camera.up);
  if (next instanceof PerspectiveCamera) {
    const distance = halfHeight / Math.tan(FIELD_OF_VIEW * Math.PI / 360);
    const direction = camera.position.clone().sub(target).normalize();
    next.position.copy(target).addScaledVector(direction, distance);
  }
  next.updateMatrixWorld();
  next.updateProjectionMatrix();
  return next;
}
