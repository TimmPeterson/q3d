import { Box3, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { changeProjection, FIELD_OF_VIEW, HOME_DIRECTION, resizeCamera, visibleHeight } from './cameras.ts';
import type { EditorCamera } from './cameras.ts';
import type { Diagram, Projection } from '../model/types.ts';

interface CameraTransition {
  start: number;
  from: Vector3;
  to: Vector3;
  fromTarget: Vector3;
  target: Vector3;
  fromHeight: number;
  height: number;
}

export class CameraRig {
  camera: EditorCamera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 100000);
  readonly controls: OrbitControls;
  onCameraChange: (() => void) | null = null;
  private aspect = 1;
  private transition: CameraTransition | null = null;
  private invalidate: () => void;

  constructor(canvas: HTMLCanvasElement, invalidate: () => void) {
    this.invalidate = invalidate;
    this.camera.position.copy(HOME_DIRECTION).multiplyScalar(15);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 50000;
    this.controls.minZoom = 0.002;
    this.controls.maxZoom = 1000;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.001;
    this.controls.screenSpacePanning = false;
    this.controls.zoomSpeed = 0.85;
    this.controls.addEventListener('change', invalidate);
    this.controls.addEventListener('start', this.stopTransition);
    this.controls.update();
  }

  resize(width: number, height: number): void {
    this.aspect = width / Math.max(height, 1);
    resizeCamera(this.camera, this.aspect);
    this.invalidate();
  }

  get projection(): Projection { return this.camera instanceof OrthographicCamera ? 'orthographic' : 'perspective'; }
  get height(): number { return visibleHeight(this.camera, this.controls.target); }

  setProjection(projection: Projection): void {
    this.stopTransition();
    this.camera = changeProjection(this.camera, projection, this.controls.target, this.aspect);
    this.controls.object = this.camera;
    this.controls.update();
    this.onCameraChange?.();
    this.invalidate();
  }

  stopTransition = (): void => { this.transition = null; };

  update(): void {
    if (this.transition) {
      const t = Math.min((performance.now() - this.transition.start) / 280, 1);
      const eased = 1 - (1 - t) ** 3;
      const transition = this.transition;
      this.camera.position.lerpVectors(transition.from, transition.to, eased);
      this.controls.target.lerpVectors(transition.fromTarget, transition.target, eased);
      if (this.camera instanceof OrthographicCamera) {
        const halfHeight = (transition.fromHeight + (transition.height - transition.fromHeight) * eased) * this.camera.zoom / 2;
        this.camera.top = halfHeight;
        this.camera.bottom = -halfHeight;
        resizeCamera(this.camera, this.aspect);
      }
      if (t === 1) this.transition = null;
      this.invalidate();
    }
    this.controls.update();
  }

  focus(document: Diagram, axis?: 'x' | 'y' | 'z' | 'home'): void {
    const bounds = new Box3();
    document.nodes.forEach((node) => {
      const point = new Vector3(...node.position);
      const radius = new Vector3().setScalar(node.size + (node.label ? 0.5 : 0));
      bounds.expandByPoint(point.clone().sub(radius));
      bounds.expandByPoint(point.add(radius));
    });
    const target = bounds.isEmpty() ? new Vector3() : bounds.getCenter(new Vector3());
    const size = bounds.isEmpty() ? 7 : Math.max(4, bounds.getSize(new Vector3()).length());
    const height = size / Math.min(this.aspect, 1) * 1.18;
    const distance = height / (2 * Math.tan(FIELD_OF_VIEW * Math.PI / 360));
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    if (axis === 'x') direction.set(1, 0.001, 0).normalize();
    if (axis === 'y') direction.set(0, 1, 0.001).normalize();
    if (axis === 'z') direction.set(0, 0.001, 1).normalize();
    if (axis === 'home') direction.copy(HOME_DIRECTION);
    this.transition = {
      start: performance.now(), from: this.camera.position.clone(),
      to: target.clone().addScaledVector(direction, distance),
      fromTarget: this.controls.target.clone(), target,
      fromHeight: this.height, height,
    };
  }

  dispose(): void { this.controls.dispose(); }
}
