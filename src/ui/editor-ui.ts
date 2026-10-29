import { iconButton } from './icons.ts';
import { SelectionInspector } from './selection-inspector.ts';
import type { InspectorActions } from './selection-inspector.ts';
import type { Diagram, Projection, SelectionSet, Tool, WorkPlane } from '../model/types.ts';

export interface UIActions extends InspectorActions {
  tool: (tool: Tool) => void;
  addNode: () => void;
  undo: () => void;
  redo: () => void;
  newDocument: () => void;
  open: (file: File) => void;
  save: () => void;
  workplane: (plane: WorkPlane, depth: number, grid: boolean, snap: boolean) => void;
  view: (axis: 'x' | 'y' | 'z' | 'home' | undefined) => void;
  projection: (projection: Projection) => void;
}

export class EditorUI {
  private root: HTMLElement;
  private actions: UIActions;
  private inspector: SelectionInspector;
  private plane: WorkPlane = 'XZ';
  private projection: Projection = 'perspective';
  private grid = true;
  private snap = false;
  private depth = 0;
  private toastTimer = 0;
  private abort = new AbortController();

  constructor(root: HTMLElement, actions: UIActions) {
    this.root = root;
    this.actions = actions;
    root.insertAdjacentHTML('beforeend', `
      <div class="top-left">
        <div class="wordmark" aria-label="q3d">q<span>3d</span></div>
        <nav class="toolbar panel" aria-label="Инструменты">
          <div class="tool-group">
            ${iconButton('tool-select', 'cursor', 'Выбрать · 1', 'aria-pressed="true"')}
            ${iconButton('add-node', 'plus', 'Добавить объект · 2')}
            ${iconButton('tool-arrow', 'arrow', 'Стрелка · 3', 'aria-pressed="false"')}
          </div>
          <span class="divider"></span>
          ${iconButton('undo', 'undo', 'Отменить · Ctrl Z', 'disabled')}
          ${iconButton('redo', 'redo', 'Повторить · Ctrl Shift Z', 'disabled')}
        </nav>
      </div>
      <nav class="file-toolbar panel" aria-label="Диаграмма">
        ${iconButton('new', 'new', 'Новая диаграмма')}
        ${iconButton('open', 'open', 'Открыть · Ctrl O')}
        ${iconButton('save', 'save', 'Сохранить · Ctrl S')}
      </nav>
      <aside class="inspector panel" aria-label="Свойства" hidden></aside>
      <div class="bottom-left">
        <div class="plane-toolbar panel" aria-label="Плоскость размещения">
          <div class="plane-options" role="group" aria-label="Плоскость">
            <button type="button" data-plane="XY" aria-pressed="false" data-tip="Плоскость XY">XY</button>
            <button type="button" data-plane="XZ" aria-pressed="true" data-tip="Плоскость XZ">XZ</button>
            <button type="button" data-plane="YZ" aria-pressed="false" data-tip="Плоскость YZ">YZ</button>
          </div>
          <span class="divider"></span>
          <label class="depth-field" data-tip="Глубина плоскости"><span id="depth-axis">Y</span><input id="plane-depth" type="number" value="0" step="any" min="-100000" max="100000" aria-label="Глубина плоскости" /></label>
          <span class="divider"></span>
          ${iconButton('grid', 'grid', 'Сетка', 'aria-pressed="true"')}
          ${iconButton('snap', 'snap', 'Привязка к сетке · Shift', 'aria-pressed="false"')}
        </div>
      </div>
      <div class="view-controls">
        <div class="view-buttons panel">
          ${iconButton('fit', 'fit', 'Вписать диаграмму · F')}
          ${iconButton('home', 'home', 'Исходный ракурс')}
          ${iconButton('projection', 'orthographic', 'Ортографическая проекция', 'aria-pressed="false"')}
        </div>
        <svg class="axis-widget" viewBox="0 0 100 100" role="group" aria-label="Ориентация">
          <circle cx="50" cy="50" r="3" fill="#d5d6d9" />
          ${['x', 'y', 'z'].map((axis) => `<g class="axis axis-${axis}" data-axis="${axis}" tabindex="0" role="button" aria-label="Вид по оси ${axis.toUpperCase()}"><line x1="50" y1="50" x2="50" y2="50"/><circle cx="50" cy="50" r="10"/><text x="50" y="50">${axis.toUpperCase()}</text></g>`).join('')}
        </svg>
      </div>
      <div class="toast" role="status" aria-live="polite" hidden></div>
      <input type="file" id="open-file" accept=".json,.q3d,application/json" hidden />
    `);
    this.inspector = new SelectionInspector(this.get('.inspector'), actions);
    root.addEventListener('click', this.onClick, { signal: this.abort.signal });
    root.addEventListener('keydown', this.onKeyDown, { signal: this.abort.signal });
    root.addEventListener('input', this.onInput, { signal: this.abort.signal });
    root.addEventListener('change', this.onChange, { signal: this.abort.signal });
    root.addEventListener('focusout', this.onFocusOut, { signal: this.abort.signal });
    this.updateTool('select');
  }

  private get<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }

  private onClick = (event: MouseEvent): void => {
    const target = event.target as Element;
    if (this.inspector.element.contains(target)) return;
    const button = target.closest<HTMLButtonElement>('[data-action]');
    const action = button?.dataset.action;
    if (action?.startsWith('tool-')) this.actions.tool(action.slice(5) as Tool);
    else if (action === 'add-node') this.actions.addNode();
    else if (action === 'undo') this.actions.undo();
    else if (action === 'redo') this.actions.redo();
    else if (action === 'new') this.actions.newDocument();
    else if (action === 'open') this.openFile();
    else if (action === 'save') this.actions.save();
    else if (action === 'deselect') this.actions.deselect();
    else if (action === 'remove') this.actions.remove();
    else if (action === 'reverse') this.actions.reverse();
    else if (action === 'fit') this.actions.view(undefined);
    else if (action === 'home') this.actions.view('home');
    else if (action === 'projection') {
      this.projection = this.projection === 'perspective' ? 'orthographic' : 'perspective';
      button?.setAttribute('aria-pressed', String(this.projection === 'orthographic'));
      this.actions.projection(this.projection);
    }
    else if (action === 'grid') { this.grid = !this.grid; this.updateWorkplane(); }
    else if (action === 'snap') { this.snap = !this.snap; this.updateWorkplane(); }

    const plane = target.closest<HTMLElement>('[data-plane]')?.dataset.plane as WorkPlane | undefined;
    if (plane) { this.plane = plane; this.updateWorkplane(); }
    const axis = target.closest<HTMLElement>('[data-axis]')?.dataset.axis as 'x' | 'y' | 'z' | undefined;
    if (axis) this.actions.view(axis);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const axis = (event.target as HTMLElement).dataset.axis as 'x' | 'y' | 'z' | undefined;
    if (axis && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.actions.view(axis);
    }
  };

  private onInput = (event: Event): void => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.id === 'plane-depth' && input.validity.valid && input.value.trim() !== '' && Number.isFinite(input.valueAsNumber)) {
      this.depth = input.valueAsNumber;
      this.updateWorkplane();
    }
  };

  private onChange = (event: Event): void => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.id === 'open-file') {
      const file = input.files?.[0];
      if (file) this.actions.open(file);
      input.value = '';
    }
  };

  private onFocusOut = (event: FocusEvent): void => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'plane-depth') event.target.value = String(this.depth);
  };

  openFile(): void { this.get<HTMLInputElement>('#open-file').click(); }

  private updateWorkplane(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-plane]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.plane === this.plane));
    });
    this.get('#depth-axis').textContent = this.plane === 'XY' ? 'Z' : this.plane === 'XZ' ? 'Y' : 'X';
    this.get('[data-action="grid"]').setAttribute('aria-pressed', String(this.grid));
    this.get('[data-action="snap"]').setAttribute('aria-pressed', String(this.snap));
    this.actions.workplane(this.plane, this.depth, this.grid, this.snap);
  }

  updateTool(tool: Tool): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-action^="tool-"]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.action === `tool-${tool}`));
    });
  }

  updateHistory(canUndo: boolean, canRedo: boolean): void {
    this.get<HTMLButtonElement>('[data-action="undo"]').disabled = !canUndo;
    this.get<HTMLButtonElement>('[data-action="redo"]').disabled = !canRedo;
  }

  updateSelection(selection: SelectionSet, diagram: Diagram): void {
    this.inspector.update(selection, diagram);
  }

  focusLabel(): void { this.inspector.focusLabel(); }

  updateAxes(axes: { x: { x: number; y: number; z: number }; y: { x: number; y: number; z: number }; z: { x: number; y: number; z: number } }): void {
    const svg = this.get<SVGSVGElement>('.axis-widget');
    const order: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
    order.sort((a, b) => axes[a].z - axes[b].z).forEach((axis) => {
      const point = axes[axis];
      const x = 50 + point.x * 32;
      const y = 50 - point.y * 32;
      const group = this.get<SVGGElement>(`[data-axis="${axis}"]`);
      group.querySelector('line')?.setAttribute('x2', String(x));
      group.querySelector('line')?.setAttribute('y2', String(y));
      const circle = group.querySelector('circle');
      circle?.setAttribute('cx', String(x));
      circle?.setAttribute('cy', String(y));
      const text = group.querySelector('text');
      text?.setAttribute('x', String(x));
      text?.setAttribute('y', String(y));
      group.style.opacity = String(point.z < -0.1 ? 0.5 : 1);
      svg.append(group);
    });
  }

  toast(message: string): void {
    const toast = this.get('.toast');
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4500);
  }

  dispose(): void {
    this.inspector.dispose();
    this.abort.abort();
    window.clearTimeout(this.toastTimer);
  }
}
