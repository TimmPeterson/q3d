import { ARROW_MIN_SPAN, EDGE_DEFAULTS, NODE_DEFAULTS, emptyDiagram } from './types.ts';
import type { CommonProperties, Diagram, DiagramEdge, DiagramNode, Selection, SelectionSet, Vec3 } from './types.ts';
import { translatedPositions } from './selection.ts';
import { preparePaste } from './clipboard.ts';

type Listener = (diagram: Diagram) => void;
const equal = (left: Diagram, right: Diagram): boolean => JSON.stringify(left) === JSON.stringify(right);

export class DiagramStore {
  private value: Diagram;
  private past: Diagram[] = [];
  private future: Diagram[] = [];
  private transaction: Diagram | null = null;
  private listeners = new Set<Listener>();

  constructor(initial: Diagram = emptyDiagram()) {
    this.value = structuredClone(initial);
  }

  get document(): Diagram { return this.value; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.value));
  }

  private remember(snapshot: Diagram): void {
    this.past.push(snapshot);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
  }

  private change(edit: (draft: Diagram) => void): void {
    const draft = structuredClone(this.value);
    edit(draft);
    if (equal(this.value, draft)) return;
    if (!this.transaction) this.remember(this.value);
    this.value = draft;
    this.emit();
  }

  beginTransaction(): void {
    this.transaction ??= structuredClone(this.value);
  }

  finishTransaction(): void {
    if (!this.transaction) return;
    if (!equal(this.transaction, this.value)) this.remember(this.transaction);
    this.transaction = null;
    this.emit();
  }

  addNode(position: Vec3, defaults: Partial<DiagramNode> = {}): string {
    const id = crypto.randomUUID();
    this.change((draft) => draft.nodes.push({ ...NODE_DEFAULTS, ...defaults, id, position: [...position] }));
    return id;
  }

  addEdge(source: string, target: string, defaults: Partial<DiagramEdge> = {}): string | null {
    if (![source, target].every((id) => this.value.nodes.some((node) => node.id === id))) return null;
    const id = crypto.randomUUID();
    const peers = this.value.edges.filter((edge) =>
      (edge.source === source && edge.target === target) || (edge.source === target && edge.target === source));
    const used = new Set(peers.map((edge) => edge.source === source ? edge.bend : -edge.bend));
    let bend = 0;
    for (let step = 0; used.has(bend) && step < 12; step++) {
      bend = (step % 2 === 0 ? 1 : -1) * (Math.floor(step / 2) + 1) * 0.7;
    }
    bend = Math.max(-4, Math.min(4, bend));
    this.change((draft) => draft.edges.push({ ...EDGE_DEFAULTS, bend, ...defaults, id, source, target }));
    return id;
  }

  updateNode(id: string, patch: Partial<Omit<DiagramNode, 'id'>>): void {
    this.updateNodes([id], patch);
  }

  updateNodes(ids: readonly string[], patch: Partial<Omit<DiagramNode, 'id'>>): void {
    const selected = new Set(ids);
    this.change((draft) => {
      draft.nodes.forEach((node) => { if (selected.has(node.id)) Object.assign(node, structuredClone(patch)); });
    });
  }

  updateEdge(id: string, patch: Partial<Omit<DiagramEdge, 'id' | 'source' | 'target'>>): void {
    this.updateEdges([id], patch);
  }

  updateEdges(ids: readonly string[], patch: Partial<Omit<DiagramEdge, 'id' | 'source' | 'target'>>): void {
    const selected = new Set(ids);
    this.change((draft) => {
      const edges = draft.edges.filter((edge) => selected.has(edge.id));
      const normalized = { ...patch };
      if (patch.start !== undefined && patch.end === undefined) {
        normalized.start = Math.max(0, Math.min(patch.start, ...edges.map((edge) => edge.end - ARROW_MIN_SPAN)));
      }
      if (patch.end !== undefined && patch.start === undefined) {
        normalized.end = Math.min(1, Math.max(patch.end, ...edges.map((edge) => edge.start + ARROW_MIN_SPAN)));
      }
      edges.forEach((edge) => Object.assign(edge, normalized));
    });
  }

  updateCommon(selection: SelectionSet, patch: Partial<CommonProperties>): void {
    const nodes = new Set(selection.filter((item) => item.type === 'node').map((item) => item.id));
    const edges = new Set(selection.filter((item) => item.type === 'edge').map((item) => item.id));
    this.change((draft) => {
      draft.nodes.forEach((node) => { if (nodes.has(node.id)) Object.assign(node, patch); });
      draft.edges.forEach((edge) => { if (edges.has(edge.id)) Object.assign(edge, patch); });
    });
  }

  setNodePositions(positions: ReadonlyMap<string, Vec3>): void {
    this.change((draft) => {
      draft.nodes.forEach((node) => {
        const position = positions.get(node.id);
        if (position) node.position = [...position];
      });
    });
  }

  translateNodes(ids: readonly string[], delta: Vec3): void {
    const selected = new Set(ids);
    const positions = new Map(this.value.nodes.filter((node) => selected.has(node.id)).map((node) => [node.id, node.position]));
    this.setNodePositions(translatedPositions(positions, delta));
  }

  reverseEdge(id: string): void {
    this.reverseEdges([id]);
  }

  reverseEdges(ids: readonly string[]): void {
    const selected = new Set(ids);
    this.change((draft) => {
      draft.edges.forEach((edge) => {
        if (!selected.has(edge.id)) return;
        [edge.source, edge.target] = [edge.target, edge.source];
        edge.bend *= -1;
        [edge.start, edge.end] = [1 - edge.end, 1 - edge.start];
      });
    });
  }

  remove(selection: Selection): void {
    this.removeSelection(selection ? [selection] : []);
  }

  removeSelection(selection: SelectionSet): void {
    const nodes = new Set(selection.filter((item) => item.type === 'node').map((item) => item.id));
    const edges = new Set(selection.filter((item) => item.type === 'edge').map((item) => item.id));
    this.change((draft) => {
      draft.nodes = draft.nodes.filter((node) => !nodes.has(node.id));
      draft.edges = draft.edges.filter((edge) => !edges.has(edge.id) && !nodes.has(edge.source) && !nodes.has(edge.target));
    });
  }

  replace(document: Diagram): void {
    this.change((draft) => Object.assign(draft, structuredClone(document)));
  }

  paste(fragment: Diagram, step: Vec3): SelectionSet {
    const addition = preparePaste(this.value, fragment, step);
    if (!addition.nodes.length) return [];
    this.finishTransaction();
    this.change((draft) => {
      draft.nodes.push(...addition.nodes);
      draft.edges.push(...addition.edges);
    });
    return [
      ...addition.nodes.map(node => ({ type: 'node' as const, id: node.id })),
      ...addition.edges.map(edge => ({ type: 'edge' as const, id: edge.id })),
    ];
  }

  undo(): void {
    this.finishTransaction();
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.value);
    this.value = previous;
    this.emit();
  }

  redo(): void {
    this.finishTransaction();
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.value);
    this.value = next;
    this.emit();
  }
}
