import './style.css';
import { DiagramStore } from './model/store.ts';
import { parseDiagram } from './model/document.ts';
import { loadExample } from './model/examples.ts';
import type { ExampleId } from './model/examples.ts';
import { downloadDocument, restoreDocument, saveDocument } from './model/persistence.ts';
import { emptyDiagram } from './model/types.ts';
import type { Diagram, Selection, SelectionSet, Tool, Vec3 } from './model/types.ts';
import { chooseSelection, nodeCenter, pruneSelection, selectedItems, selectionKey } from './model/selection.ts';
import { DiagramView } from './scene/view.ts';
import { EditorInteractions } from './editor/interactions.ts';
import { EditorUI } from './ui/editor-ui.ts';

class Editor {
  private store = new DiagramStore(restoreDocument());
  private view: DiagramView;
  private ui: EditorUI;
  private interactions: EditorInteractions;
  private selection: SelectionSet = [];
  private arrowSource: string | null = null;
  private saveTimer = 0;
  private storageWarningShown = false;
  private abort = new AbortController();
  private exampleRequest: AbortController | null = null;
  private unsubscribe: () => void;

  constructor(root: HTMLElement) {
    this.view = new DiagramView(root);
    this.ui = new EditorUI(root, {
      tool: (tool) => this.setTool(tool),
      addNode: () => this.addNode(),
      undo: () => { this.interactions.cancel(); this.store.undo(); },
      redo: () => { this.interactions.cancel(); this.store.redo(); },
      newDocument: () => this.replaceDocument(emptyDiagram()),
      open: (file) => { void this.open(file); },
      save: () => downloadDocument(this.store.document),
      example: (id) => { void this.openExample(id); },
      deselect: () => this.select(null),
      remove: () => this.remove(),
      reverse: () => {
        this.store.reverseEdges(this.selection.filter((item) => item.type === 'edge').map((item) => item.id));
      },
      updateCommon: (patch) => this.store.updateCommon(this.selection, patch),
      updateNode: (patch) => {
        this.store.updateNodes(this.selection.filter((item) => item.type === 'node').map((item) => item.id), patch);
      },
      updateEdge: (patch) => {
        this.store.updateEdges(this.selection.filter((item) => item.type === 'edge').map((item) => item.id), patch);
      },
      position: (axis, value) => {
        const { nodes } = selectedItems(this.store.document, this.selection);
        const center = nodeCenter(nodes);
        if (!center) return;
        const delta: Vec3 = [0, 0, 0];
        delta[axis] = value - center[axis];
        this.store.translateNodes(nodes.map((node) => node.id), delta);
      },
      transactionStart: () => this.store.beginTransaction(),
      transactionEnd: () => this.store.finishTransaction(),
      workplane: (plane, depth, grid, snap) => {
        this.interactions.plane = plane;
        this.interactions.depth = depth;
        this.interactions.snap = snap;
        this.view.setWorkplane(plane, depth, grid);
      },
      view: (axis) => this.view.focus(this.store.document, axis),
      projection: (projection) => this.view.setProjection(projection),
    });
    this.interactions = new EditorInteractions(this.view, this.store, {
      select: (selection, additive) => this.select(selection, additive),
      editLabel: () => this.ui.focusLabel(),
      sourceChanged: (id) => {
        this.arrowSource = id;
        this.view.select(this.selection, id);
      },
    });
    this.unsubscribe = this.store.subscribe(() => this.onDocumentChange());
    this.view.onFrame = () => this.ui.updateAxes(this.view.getAxisProjections());
    this.view.sync(this.store.document);
    this.ui.updateAxes(this.view.getAxisProjections());
    if (this.store.document.nodes.length) this.view.focus(this.store.document, 'home');
    this.setTool('select');

    window.addEventListener('keydown', this.onKeyDown, { signal: this.abort.signal });
    window.addEventListener('pagehide', this.persist, { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persist();
    }, { signal: this.abort.signal });
  }

  private select(selection: Selection, additive = false): void {
    const next = chooseSelection(this.selection, selection, additive);
    if (selectionKey(this.selection) !== selectionKey(next)) this.store.finishTransaction();
    this.selection = next;
    this.view.select(next, this.arrowSource);
    this.ui.updateSelection(next, this.store.document);
    this.rememberArrowDefaults();
  }

  private rememberArrowDefaults(): void {
    if (this.selection.length === 1 && this.selection[0].type === 'edge') {
      const edge = this.store.document.edges.find((item) => item.id === this.selection[0].id);
      if (edge) this.interactions.edgeDefaults = { kind: edge.kind, width: edge.width, color: edge.color, labelMode: edge.labelMode };
    }
  }

  private addNode(): void {
    this.setTool('select');
    this.interactions.addNode();
  }

  private setTool(tool: Tool): void {
    this.interactions.setTool(tool);
    this.ui.updateTool(tool);
  }

  private remove(): void {
    this.interactions.cancel();
    this.store.removeSelection(this.selection);
    this.select(null);
  }

  private onDocumentChange(): void {
    this.cancelExampleLoad();
    this.selection = pruneSelection(this.store.document, this.selection);
    this.view.sync(this.store.document);
    this.view.select(this.selection, this.arrowSource);
    this.ui.updateSelection(this.selection, this.store.document);
    this.ui.updateHistory(this.store.canUndo, this.store.canRedo);
    this.rememberArrowDefaults();
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(this.persist, 250);
  }

  private persist = (): void => {
    if (!saveDocument(this.store.document) && !this.storageWarningShown) {
      this.storageWarningShown = true;
      this.ui.toast('Autosave is unavailable. Save your diagram to a file.');
    }
  };

  private async open(file: File): Promise<void> {
    this.cancelExampleLoad();
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('File exceeds 5 MB');
      const diagram = parseDiagram(JSON.parse(await file.text()));
      this.replaceDocument(diagram);
    } catch (error) {
      this.ui.toast(error instanceof Error && error.message === 'File exceeds 5 MB' ? error.message : 'Could not open diagram');
    }
  }

  private replaceDocument(diagram: Diagram): void {
    this.cancelExampleLoad();
    this.interactions.cancel();
    this.select(null);
    this.store.replace(diagram);
    this.setTool('select');
    this.view.focus(diagram, 'home');
  }

  private cancelExampleLoad(): void {
    if (!this.exampleRequest) return;
    this.exampleRequest.abort();
    this.exampleRequest = null;
    this.ui.setExamplesLoading(false);
  }

  private async openExample(id: ExampleId): Promise<void> {
    this.cancelExampleLoad();
    const request = new AbortController();
    this.exampleRequest = request;
    this.ui.setExamplesLoading(true);
    try {
      const diagram = await loadExample(id, request.signal);
      if (request.signal.aborted) return;
      this.replaceDocument(diagram);
    } catch {
      if (!request.signal.aborted) this.ui.toast('Could not load example.');
    } finally {
      if (this.exampleRequest === request) this.cancelExampleLoad();
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    const editing = target instanceof HTMLTextAreaElement || target.isContentEditable ||
      (target instanceof HTMLInputElement && ['text', 'number', 'search', 'email', 'url', 'tel', 'password'].includes(target.type));
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.code === 'KeyS') {
      event.preventDefault();
      downloadDocument(this.store.document);
      return;
    }
    if (modifier && event.code === 'KeyO') {
      event.preventDefault();
      this.ui.openFile();
      return;
    }
    if (event.key === 'Escape') {
      if (editing) target.blur();
      this.interactions.cancel();
      this.select(null);
      this.setTool('select');
      return;
    }
    if (editing) return;
    if (modifier && event.code === 'KeyZ') {
      event.preventDefault();
      this.interactions.cancel();
      if (event.shiftKey) this.store.redo(); else this.store.undo();
    } else if (modifier && event.code === 'KeyY') {
      event.preventDefault();
      this.interactions.cancel();
      this.store.redo();
    } else if (!modifier && !event.altKey) {
      if (event.code === 'Digit1' || event.code === 'KeyV') this.setTool('select');
      if (!event.repeat && (event.code === 'Digit2' || event.code === 'KeyN')) this.addNode();
      if (event.code === 'Digit3' || event.code === 'KeyA') this.setTool('arrow');
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.remove(); }
      if (event.code === 'KeyF') this.view.focus(this.store.document);
      if (event.key === 'Enter' && this.selection.length) this.ui.focusLabel();
    }
  };

  dispose(): void {
    this.cancelExampleLoad();
    this.persist();
    window.clearTimeout(this.saveTimer);
    this.abort.abort();
    this.unsubscribe();
    this.interactions.dispose();
    this.ui.dispose();
    this.view.dispose();
  }
}

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  try {
    const editor = new Editor(root);
    if (import.meta.hot) import.meta.hot.dispose(() => { editor.dispose(); root.replaceChildren(); });
  } catch (error) {
    console.error(error);
    root.replaceChildren();
    const message = document.createElement('p');
    message.className = 'startup-error';
    message.textContent = 'Could not start the 3D editor. Check that WebGL 2 is enabled.';
    root.append(message);
  }
}
