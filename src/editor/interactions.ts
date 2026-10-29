import { Plane, Vector2, Vector3 } from 'three';
import { DiagramStore } from '../model/store.ts';
import { NODE_DEFAULTS } from '../model/types.ts';
import type { DiagramEdge, Selection, Tool, Vec3, WorkPlane } from '../model/types.ts';
import { DiagramView } from '../scene/view.ts';
import { findNodePosition } from './placement.ts';

export interface InteractionActions {
  select: (selection: Selection, additive?: boolean) => void;
  editLabel: () => void;
  sourceChanged: (id: string | null) => void;
}

export class EditorInteractions {
  tool: Tool = 'select';
  plane: WorkPlane = 'XZ';
  depth = 0;
  edgeDefaults: Partial<DiagramEdge> = {};
  private view: DiagramView;
  private store: DiagramStore;
  private actions: InteractionActions;
  private snapEnabled = false;
  private shiftSnap = false;
  private down: { point: Vector2; pointerId: number; additive: boolean; hit: Selection } | null = null;
  private source: string | null = null;
  private arrowDrag = false;
  private abort = new AbortController();

  get snap(): boolean { return this.snapEnabled; }
  set snap(enabled: boolean) {
    this.snapEnabled = enabled;
    this.updateSnap();
  }

  constructor(view: DiagramView, store: DiagramStore, actions: InteractionActions) {
    this.view = view;
    this.store = store;
    this.actions = actions;
    view.onTransformStart = () => store.beginTransaction();
    view.onTransformChange = (positions) => store.setNodePositions(positions);
    view.onTransformEnd = () => store.finishTransaction();
    const options = { capture: true, signal: this.abort.signal };
    view.canvas.addEventListener('pointerdown', this.onPointerDown, options);
    view.canvas.addEventListener('pointermove', this.onPointerMove, options);
    view.canvas.addEventListener('pointerup', this.onPointerUp, options);
    view.canvas.addEventListener('pointercancel', this.cancel, options);
    view.canvas.addEventListener('dblclick', this.onDoubleClick, options);
    window.addEventListener('blur', () => { this.shiftSnap = false; this.updateSnap(); this.cancel(); }, { signal: this.abort.signal });
    const updateShift = (event: KeyboardEvent) => { this.shiftSnap = event.shiftKey; this.updateSnap(); };
    window.addEventListener('keydown', updateShift, { signal: this.abort.signal });
    window.addEventListener('keyup', updateShift, { signal: this.abort.signal });
  }

  private updateSnap(): void { this.view.setTranslationSnap(this.snapEnabled || this.shiftSnap); }

  setTool(tool: Tool): void {
    this.cancel();
    this.tool = tool;
    this.view.canvas.dataset.tool = tool;
    this.view.setTransformEnabled(tool === 'select');
  }

  addNode(): void {
    const position = findNodePosition(
      this.view.controls.target.toArray() as Vec3, this.plane, this.depth,
      this.store.document.nodes, NODE_DEFAULTS.size, this.snapEnabled || this.shiftSnap,
    );
    const id = this.store.addNode(position);
    this.actions.select({ type: 'node', id });
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return;
    this.view.preparePointer();
    const hit = this.view.pick(event.clientX, event.clientY, this.tool === 'arrow');
    const body = this.tool === 'select' && this.view.isNodeBodyAt(event.clientX, event.clientY);
    const handle = !body && this.view.isTransformHandleAt(event.clientX, event.clientY);
    const additive = this.tool === 'select' && event.shiftKey && !handle;
    this.down = { point: new Vector2(event.clientX, event.clientY), pointerId: event.pointerId, additive, hit };
    if (additive) {
      event.stopImmediatePropagation();
      this.view.suppressTransformPointer(true);
      this.view.controls.enabled = false;
      this.view.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (body) this.view.suppressTransformPointer(true);
    if (this.tool === 'arrow' && hit?.type === 'node') {
      event.stopImmediatePropagation();
      this.view.controls.enabled = false;
      this.view.canvas.setPointerCapture(event.pointerId);
      if (!this.source) {
        this.setSource(hit.id);
        this.arrowDrag = true;
      }
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!event.isPrimary || this.view.transforming) return;
    const hit = this.view.pick(event.clientX, event.clientY, this.tool === 'arrow');
    this.view.canvas.classList.toggle('over-object', !!hit);
    if (this.tool === 'arrow' && this.source) {
      const source = this.store.document.nodes.find((node) => node.id === this.source);
      const target = hit?.type === 'node' ? this.store.document.nodes.find((node) => node.id === hit.id) : null;
      if (!source) { this.setSource(null); return; }
      const from = new Vector3(...source.position);
      const plane = new Plane().setFromNormalAndCoplanarPoint(this.view.camera.getWorldDirection(new Vector3()), from);
      const to = target ? new Vector3(...target.position) : this.view.intersectPlane(event.clientX, event.clientY, plane);
      this.view.showArrowPreview(from, to);
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.down || this.down.pointerId !== event.pointerId) return;
    const down = this.down;
    const distance = down.point.distanceTo(new Vector2(event.clientX, event.clientY));
    this.down = null;
    if (this.view.transforming) return;
    this.view.suppressTransformPointer(false);
    this.view.controls.enabled = true;
    if (down.additive) {
      if (distance < 5) this.actions.select(down.hit, true);
      if (this.view.canvas.hasPointerCapture(event.pointerId)) this.view.canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (this.tool === 'arrow') {
      const hit = this.view.pick(event.clientX, event.clientY, true);
      if (this.source && hit?.type === 'node' &&
        ((this.arrowDrag && distance > 4 && hit.id !== this.source) || (!this.arrowDrag && distance < 5))) {
        const id = this.store.addEdge(this.source, hit.id, this.edgeDefaults);
        this.setSource(null);
        if (id) this.actions.select({ type: 'edge', id });
      } else if (!hit && distance < 5) {
        this.setSource(null);
        this.actions.select(null);
      }
      this.arrowDrag = false;
      if (this.view.canvas.hasPointerCapture(event.pointerId)) this.view.canvas.releasePointerCapture(event.pointerId);
    } else if (distance < 5) this.actions.select(this.view.pick(event.clientX, event.clientY));
  };

  private onDoubleClick = (event: MouseEvent): void => {
    if (this.tool !== 'select' || event.shiftKey) return;
    const hit = this.view.pick(event.clientX, event.clientY);
    if (hit) { this.actions.select(hit); this.actions.editLabel(); }
  };

  private setSource(id: string | null): void {
    this.source = id;
    if (!id) this.view.showArrowPreview(null, null);
    this.actions.sourceChanged(id);
  }

  cancel = (): void => {
    const pointerId = this.down?.pointerId;
    this.down = null;
    this.arrowDrag = false;
    this.view.cancelTransform();
    this.view.suppressTransformPointer(false);
    this.setSource(null);
    this.view.controls.enabled = true;
    if (pointerId !== undefined && this.view.canvas.hasPointerCapture(pointerId)) this.view.canvas.releasePointerCapture(pointerId);
  };

  dispose(): void {
    this.cancel();
    this.abort.abort();
    this.view.onTransformStart = this.view.onTransformChange = this.view.onTransformEnd = null;
  }
}
