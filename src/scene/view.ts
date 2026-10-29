import {
  AmbientLight, BackSide, BoxGeometry, BufferGeometry, Color, DirectionalLight,
  Float32BufferAttribute, Group, Line, LineDashedMaterial, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, OctahedronGeometry, Plane, PlaneGeometry,
  Raycaster, Scene, ShaderMaterial, SphereGeometry, TubeGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { TransformControls, TransformControlsGizmo } from 'three/addons/controls/TransformControls.js';
import type { Object3D } from 'three';
import { CameraRig } from './camera-rig.ts';
import { createEdgeGeometry, perpendicular } from './edge-geometry.ts';
import type { EdgeGeometry } from './edge-geometry.ts';
import { TextLabel } from './labels.ts';
import { nodeCenter, translatedPositions } from '../model/selection.ts';
import type { Diagram, DiagramNode, Projection, Selection, SelectionSet, Vec3, WorkPlane } from '../model/types.ts';

interface NodeVisual {
  group: Group;
  mesh: Mesh;
  outline: Mesh;
  label: TextLabel;
  labelOffset: number;
  signature: string;
}

interface EdgeVisual {
  geometry: EdgeGeometry;
  label: TextLabel;
  highlight: Mesh;
  labelAnchor: Vector3;
  labelTangent: Vector3;
  signature: string;
}

const SHAPES = {
  sphere: new SphereGeometry(0.5, 32, 24),
  cube: new BoxGeometry(1, 1, 1),
  diamond: new OctahedronGeometry(0.67),
};
const ACCENT = '#cf9259';

export class DiagramView {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  private rig: CameraRig;
  private gizmo: TransformControls;
  private gizmoPicker: Object3D | null = null;
  private transformAnchor = new Group();
  private transformSnapshot: { origin: Vector3; positions: Map<string, Vec3> } | null = null;
  private transformModeEnabled = true;
  private transformPointerSuppressed = false;
  private removedGizmoParts: Mesh[] = [];
  private renderer: WebGLRenderer;
  private raycaster = new Raycaster();
  private nodes = new Map<string, NodeVisual>();
  private edges = new Map<string, EdgeVisual>();
  private selection: SelectionSet = [];
  private arrowSource: string | null = null;
  private preview: Line;
  private grid: Mesh<PlaneGeometry, ShaderMaterial>;
  private gridVisible = true;
  private gridPlane: WorkPlane = 'XZ';
  private gridDepth = 0;
  private dirty = true;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  onFrame: (() => void) | null = null;
  onTransformStart: (() => void) | null = null;
  onTransformChange: ((positions: ReadonlyMap<string, Vec3>) => void) | null = null;
  onTransformEnd: (() => void) | null = null;

  get camera() { return this.rig.camera; }
  get controls() { return this.rig.controls; }
  get transforming(): boolean { return this.gizmo.dragging; }
  get projection(): Projection { return this.rig.projection; }

  constructor(container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#ffffff');
    this.scene.background = new Color('#ffffff');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'scene';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Трёхмерная диаграмма');
    container.prepend(this.canvas);

    this.rig = new CameraRig(this.canvas, () => { this.dirty = true; });
    this.scene.add(this.transformAnchor);
    this.gizmo = this.createGizmo();
    this.rig.onCameraChange = () => { this.gizmo.camera = this.camera; };

    this.scene.add(new AmbientLight('#ffffff', 2.1));
    const keyLight = new DirectionalLight('#ffffff', 2.6);
    keyLight.position.set(-4, 8, 10);
    this.scene.add(keyLight);
    const fillLight = new DirectionalLight('#e8edff', 1.2);
    fillLight.position.set(5, -3, -5);
    this.scene.add(fillLight);

    const previewGeometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
    this.preview = new Line(previewGeometry, new LineDashedMaterial({ color: ACCENT, dashSize: 0.1, gapSize: 0.08 }));
    this.preview.visible = false;
    this.preview.frustumCulled = false;
    this.scene.add(this.preview);

    this.grid = this.createGrid();
    this.scene.add(this.grid);
    this.setWorkplane('XZ', 0, true);
    this.resizeObserver = new ResizeObserver(() => this.resize(container));
    this.resizeObserver.observe(container);
    this.resize(container);
    this.animate();
  }

  private createGizmo(): TransformControls {
    const gizmo = new TransformControls(this.camera, this.canvas);
    gizmo.setMode('translate');
    gizmo.setSpace('world');
    gizmo.setSize(0.85);
    gizmo.setColors('#bf6f67', '#7e9e6e', '#6488b6', '#d8a05f');
    gizmo.showXY = gizmo.showYZ = gizmo.showXZ = false;
    const helper = gizmo.getHelper();
    helper.traverse((object) => {
      if (!(object instanceof TransformControlsGizmo)) return;
      this.gizmoPicker = object.picker.translate;
      for (const group of [object.gizmo.translate, object.picker.translate]) {
        for (const child of [...group.children]) {
          if (child.name === 'XYZ' && child instanceof Mesh) {
            group.remove(child);
            this.removedGizmoParts.push(child);
          }
        }
      }
    });
    this.scene.add(helper);
    gizmo.addEventListener('change', () => { this.dirty = true; });
    gizmo.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      this.canvas.classList.toggle('dragging', !!event.value);
      if (!event.value) this.updateGizmo();
    });
    gizmo.addEventListener('mouseDown', () => {
      this.rig.stopTransition();
      const positions = new Map<string, Vec3>();
      this.selection.forEach((item) => {
        const visual = item.type === 'node' ? this.nodes.get(item.id) : null;
        if (visual) positions.set(item.id, visual.group.position.toArray() as Vec3);
      });
      this.transformSnapshot = { origin: this.transformAnchor.position.clone(), positions };
      this.onTransformStart?.();
    });
    gizmo.addEventListener('objectChange', () => {
      const snapshot = this.transformSnapshot;
      if (!snapshot) return;
      const delta = this.transformAnchor.position.clone().sub(snapshot.origin).toArray() as Vec3;
      const positions = translatedPositions(snapshot.positions, delta);
      const first = positions.entries().next().value;
      if (first) {
        const initial = snapshot.positions.get(first[0])!;
        this.transformAnchor.position.copy(snapshot.origin).add(new Vector3(...first[1]).sub(new Vector3(...initial)));
      }
      this.onTransformChange?.(positions);
    });
    gizmo.addEventListener('mouseUp', () => { this.transformSnapshot = null; this.onTransformEnd?.(); });
    return gizmo;
  }

  private createGrid(): Mesh<PlaneGeometry, ShaderMaterial> {
    return new Mesh(new PlaneGeometry(200000, 200000), new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: 2,
      uniforms: {
        uCenter: { value: new Vector2() },
        uFadeDistance: { value: 30 },
        uAxisX: { value: new Color('#bd8c85') },
        uAxisY: { value: new Color('#819ab9') },
      },
      vertexShader: `
        varying vec2 vPoint;
        void main() {
          vPoint = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vPoint;
        uniform vec2 uCenter;
        uniform float uFadeDistance;
        uniform vec3 uAxisX;
        uniform vec3 uAxisY;
        float gridLine(vec2 p) {
          vec2 d = max(fwidth(p), vec2(0.0001));
          vec2 line = abs(fract(p - 0.5) - 0.5) / d;
          float fade = 1.0 - smoothstep(0.15, 0.4, max(d.x, d.y));
          return (1.0 - min(min(line.x, line.y), 1.0)) * fade;
        }
        void main() {
          vec2 derivative = max(fwidth(vPoint), vec2(0.0001));
          float fade = 1.0 - smoothstep(uFadeDistance * 0.5, uFadeDistance, length(vPoint - uCenter));
          float alpha = max(gridLine(vPoint) * 0.25, gridLine(vPoint / 5.0) * 0.42);
          float axisX = 1.0 - smoothstep(0.0, 1.2, abs(vPoint.y) / derivative.y);
          float axisY = 1.0 - smoothstep(0.0, 1.2, abs(vPoint.x) / derivative.x);
          vec3 color = mix(vec3(0.60, 0.62, 0.65), uAxisX, axisX);
          color = mix(color, uAxisY, axisY);
          alpha = max(alpha, max(axisX, axisY) * 0.65);
          gl_FragColor = vec4(color, alpha * fade);
        }
      `,
    }));
  }

  private resize(container: HTMLElement): void {
    const { width, height } = container.getBoundingClientRect();
    this.rig.resize(width, height);
    this.renderer.setSize(width, height);
    this.dirty = true;
  }

  private animate = (): void => {
    this.frame = requestAnimationFrame(this.animate);
    this.rig.update();
    if (!this.dirty) return;
    const cameraUp = new Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const cameraRight = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const forward = this.camera.getWorldDirection(new Vector3());
    this.nodes.forEach((visual) => {
      visual.label.faceCamera(this.camera);
      if (visual.label.mode === 'billboard') visual.label.position.copy(cameraUp).multiplyScalar(visual.labelOffset);
      else visual.label.position.set(0, visual.labelOffset, 0);
    });
    this.edges.forEach((visual) => {
      visual.label.faceCamera(this.camera);
      let side = perpendicular(visual.labelTangent);
      if (visual.label.mode === 'billboard') {
        side = visual.labelTangent.clone().cross(forward);
        if (side.lengthSq() < 0.001) side.copy(cameraUp);
        side.normalize();
        const up = side.dot(cameraUp);
        if (up < -0.01 || (Math.abs(up) <= 0.01 && side.dot(cameraRight) < 0)) side.negate();
      }
      visual.label.position.copy(visual.labelAnchor).addScaledVector(side, 0.32);
    });
    const target = this.controls.target;
    const coordinates = this.gridPlane === 'XY' ? [target.x, target.y]
      : this.gridPlane === 'XZ' ? [target.x, -target.z] : [-target.z, target.y];
    this.grid.material.uniforms.uCenter.value.set(...coordinates);
    this.grid.material.uniforms.uFadeDistance.value = Math.max(18, this.rig.height * 2.5);
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
    this.dirty = false;
  };

  sync(document: Diagram): void {
    const nodeIds = new Set(document.nodes.map((node) => node.id));
    const edgeIds = new Set(document.edges.map((edge) => edge.id));
    this.nodes.forEach((visual, id) => {
      if (!nodeIds.has(id)) {
        this.scene.remove(visual.group);
        visual.label.dispose();
        (visual.mesh.material as MeshStandardMaterial).dispose();
        (visual.outline.material as MeshBasicMaterial).dispose();
        this.nodes.delete(id);
      }
    });
    this.edges.forEach((visual, id) => {
      if (!edgeIds.has(id)) this.removeEdgeVisual(id, visual);
    });

    document.nodes.forEach((node) => this.syncNode(node));
    const byId = new Map(document.nodes.map((node) => [node.id, node]));
    document.edges.forEach((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return;
      const signature = JSON.stringify([edge, source.position, source.size, source.shape, target.position, target.size, target.shape]);
      const existing = this.edges.get(edge.id);
      if (existing?.signature === signature) return;
      if (existing) this.removeEdgeVisual(edge.id, existing);
      const geometry = createEdgeGeometry(edge, source, target);
      const label = new TextLabel();
      label.update(edge.label, edge.color, edge.labelMode);
      const tangent = geometry.path.getTangentAt(0.5).normalize();
      label.position.copy(geometry.path.getPointAt(0.5)).addScaledVector(perpendicular(tangent), 0.27);
      label.userData = { type: 'edge', id: edge.id };
      const highlight = new Mesh(
        new TubeGeometry(geometry.path, 40, Math.max(0.085, edge.width * 1.6), 6, false),
        new MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.17, depthWrite: false }),
      );
      highlight.visible = false;
      geometry.group.add(highlight, label);
      this.scene.add(geometry.group);
      this.edges.set(edge.id, {
        geometry, label, highlight, signature,
        labelAnchor: geometry.path.getPointAt(0.5), labelTangent: tangent,
      });
    });
    this.applySelection();
    this.dirty = true;
  }

  private syncNode(node: DiagramNode): void {
    let visual = this.nodes.get(node.id);
    const signature = JSON.stringify(node);
    if (visual?.signature === signature) return;
    if (!visual) {
      const group = new Group();
      const mesh = new Mesh(SHAPES[node.shape], new MeshStandardMaterial({ color: node.color, roughness: 0.65, metalness: 0 }));
      const outline = new Mesh(SHAPES[node.shape], new MeshBasicMaterial({ color: ACCENT, side: BackSide }));
      outline.scale.setScalar(1.17);
      const label = new TextLabel();
      mesh.userData = label.userData = { type: 'node', id: node.id };
      group.add(mesh, outline, label);
      this.scene.add(group);
      visual = { group, mesh, outline, label, signature, labelOffset: 0 };
      this.nodes.set(node.id, visual);
    }
    visual.signature = signature;
    visual.group.position.fromArray(node.position);
    visual.mesh.geometry = visual.outline.geometry = SHAPES[node.shape];
    visual.mesh.scale.setScalar(node.size);
    visual.outline.scale.setScalar(node.size * 1.17);
    (visual.mesh.material as MeshStandardMaterial).color.set(node.color);
    visual.labelOffset = node.size * (node.shape === 'diamond' ? 0.67 : 0.5) + 0.34;
    visual.label.update(node.label, node.color, node.labelMode);
  }

  private removeEdgeVisual(id: string, visual: EdgeVisual): void {
    this.scene.remove(visual.geometry.group);
    visual.label.dispose();
    visual.geometry.group.remove(visual.label, visual.highlight);
    visual.highlight.geometry.dispose();
    (visual.highlight.material as MeshBasicMaterial).dispose();
    visual.geometry.dispose();
    this.edges.delete(id);
  }

  private applySelection(): void {
    const nodes = new Set(this.selection.filter((item) => item.type === 'node').map((item) => item.id));
    const edges = new Set(this.selection.filter((item) => item.type === 'edge').map((item) => item.id));
    this.nodes.forEach((visual, id) => {
      visual.outline.visible = nodes.has(id) || this.arrowSource === id;
    });
    this.edges.forEach((visual, id) => {
      visual.highlight.visible = edges.has(id);
    });
    this.updateGizmo();
  }

  private updateGizmo(): void {
    const nodes = this.selection.flatMap((item) => {
      const visual = item.type === 'node' ? this.nodes.get(item.id) : null;
      return visual ? [{ position: visual.group.position.toArray() as Vec3 }] : [];
    });
    const center = nodeCenter(nodes);
    if (this.transformModeEnabled && center) {
      if (!this.gizmo.dragging) this.transformAnchor.position.fromArray(center);
      if (this.gizmo.object !== this.transformAnchor) this.gizmo.attach(this.transformAnchor);
      this.gizmo.enabled = !this.transformPointerSuppressed;
    } else {
      if (this.gizmo.object) this.gizmo.detach();
      this.gizmo.enabled = false;
    }
  }

  setTransformEnabled(enabled: boolean): void {
    this.cancelTransform();
    this.transformModeEnabled = enabled;
    this.updateGizmo();
    this.dirty = true;
  }

  suppressTransformPointer(suppressed: boolean): void {
    this.transformPointerSuppressed = suppressed;
    this.gizmo.enabled = !suppressed && this.transformModeEnabled && !!this.gizmo.object;
  }

  setTranslationSnap(enabled: boolean): void { this.gizmo.setTranslationSnap(enabled ? 0.5 : null); }

  cancelTransform(): void {
    if (this.gizmo.dragging) this.gizmo.pointerUp(null);
  }

  setProjection(projection: Projection): void {
    this.cancelTransform();
    this.rig.setProjection(projection);
  }

  select(selection: SelectionSet, arrowSource: string | null = this.arrowSource): void {
    this.selection = selection;
    this.arrowSource = arrowSource;
    this.applySelection();
    this.dirty = true;
  }

  private setRay(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new Vector2(
      (clientX - rect.left) / rect.width * 2 - 1,
      -(clientY - rect.top) / rect.height * 2 + 1,
    ), this.camera);
  }

  preparePointer(): void {
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld(true);
  }

  isNodeBodyAt(clientX: number, clientY: number): boolean {
    this.setRay(clientX, clientY);
    return this.raycaster.intersectObjects([...this.nodes.values()].map((visual) => visual.mesh), false).length > 0;
  }

  isTransformHandleAt(clientX: number, clientY: number): boolean {
    if (!this.transformModeEnabled || !this.gizmo.object || !this.gizmoPicker) return false;
    this.setRay(clientX, clientY);
    return this.raycaster.intersectObject(this.gizmoPicker, true).some((hit) =>
      hit.object.visible && ['X', 'Y', 'Z'].includes(hit.object.name));
  }

  pick(clientX: number, clientY: number, nodesOnly = false): Selection {
    this.setRay(clientX, clientY);
    const objects: Mesh[] = [];
    this.nodes.forEach((visual) => {
      objects.push(visual.mesh);
      if (visual.label.visible) objects.push(visual.label);
    });
    if (!nodesOnly) this.edges.forEach((visual) => {
      objects.push(visual.geometry.pickMesh);
      if (visual.label.visible) objects.push(visual.label);
    });
    const hits = this.raycaster.intersectObjects(objects, false);
    const hit = hits[0]?.object.userData;
    return hit?.id ? { type: hit.type, id: hit.id } : null;
  }

  intersectPlane(clientX: number, clientY: number, plane: Plane): Vector3 | null {
    this.setRay(clientX, clientY);
    if (Math.abs(this.raycaster.ray.direction.dot(plane.normal)) < 0.025) return null;
    const point = this.raycaster.ray.intersectPlane(plane, new Vector3());
    return point && point.length() < 100000 ? point : null;
  }

  showArrowPreview(from: Vector3 | null, to: Vector3 | null): void {
    this.preview.visible = !!from && !!to;
    if (from && to) {
      this.preview.geometry.setFromPoints([from, to]);
      this.preview.computeLineDistances();
    }
    this.dirty = true;
  }

  setWorkplane(plane: WorkPlane, depth: number, visible: boolean): void {
    this.gridPlane = plane;
    this.gridDepth = depth;
    this.gridVisible = visible;
    this.grid.rotation.set(0, 0, 0);
    this.grid.position.set(0, 0, 0);
    if (plane === 'XY') this.grid.position.z = depth;
    if (plane === 'XZ') { this.grid.rotation.x = -Math.PI / 2; this.grid.position.y = depth; }
    if (plane === 'YZ') { this.grid.rotation.y = Math.PI / 2; this.grid.position.x = depth; }
    this.grid.visible = visible;
    this.grid.material.uniforms.uAxisX.value.set(plane === 'YZ' ? '#819ab9' : '#bd8c85');
    this.grid.material.uniforms.uAxisY.value.set(plane === 'XY' || plane === 'YZ' ? '#8ba080' : '#819ab9');
    this.dirty = true;
  }

  get workplane(): { plane: WorkPlane; depth: number; visible: boolean } {
    return { plane: this.gridPlane, depth: this.gridDepth, visible: this.gridVisible };
  }

  focus(document: Diagram, axis?: 'x' | 'y' | 'z' | 'home'): void {
    this.rig.focus(document, axis);
  }

  getAxisProjections(): { x: Vector3; y: Vector3; z: Vector3 } {
    const inverse = this.camera.quaternion.clone().invert();
    return {
      x: new Vector3(1, 0, 0).applyQuaternion(inverse),
      y: new Vector3(0, 1, 0).applyQuaternion(inverse),
      z: new Vector3(0, 0, 1).applyQuaternion(inverse),
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.gizmo.dispose();
    this.removedGizmoParts.forEach((part) => {
      part.geometry.dispose();
      const materials = Array.isArray(part.material) ? part.material : [part.material];
      materials.forEach((material) => material.dispose());
    });
    this.rig.dispose();
    this.nodes.forEach((visual) => {
      visual.label.dispose();
      (visual.mesh.material as MeshStandardMaterial).dispose();
      (visual.outline.material as MeshBasicMaterial).dispose();
    });
    this.edges.forEach((visual, id) => this.removeEdgeVisual(id, visual));
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.preview.geometry.dispose();
    (this.preview.material as LineDashedMaterial).dispose();
    Object.values(SHAPES).forEach((shape) => shape.dispose());
    this.renderer.dispose();
  }
}
