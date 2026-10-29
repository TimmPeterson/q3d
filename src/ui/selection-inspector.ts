import { icon, iconButton } from './icons.ts';
import { nodeCenter, selectedItems, selectionKey, sharedValue } from '../model/selection.ts';
import { ARROW_MIN_SPAN } from '../model/types.ts';
import type { CommonProperties, Diagram, DiagramEdge, DiagramNode, SelectionSet } from '../model/types.ts';

const PALETTE = ['#45494f', '#557aa6', '#7b6ba6', '#599482', '#c78358', '#bd6770'];
const MIXED = 'Mixed values';
type InspectorMode = 'nodes' | 'edges' | 'mixed';

export interface InspectorActions {
  undo: () => void;
  redo: () => void;
  deselect: () => void;
  remove: () => void;
  reverse: () => void;
  updateCommon: (patch: Partial<CommonProperties>) => void;
  updateNode: (patch: Partial<Omit<DiagramNode, 'id' | 'position'>>) => void;
  updateEdge: (patch: Partial<Omit<DiagramEdge, 'id' | 'source' | 'target'>>) => void;
  position: (axis: number, value: number) => void;
  transactionStart: () => void;
  transactionEnd: () => void;
}

export class SelectionInspector {
  readonly element: HTMLElement;
  private actions: InspectorActions;
  private nodes: DiagramNode[] = [];
  private edges: DiagramEdge[] = [];
  private items: (DiagramNode | DiagramEdge)[] = [];
  private mode: InspectorMode = 'mixed';
  private key = '';
  private rangeEditing = false;
  private abort = new AbortController();

  constructor(element: HTMLElement, actions: InspectorActions) {
    this.element = element;
    this.actions = actions;
    const options = { signal: this.abort.signal };
    element.addEventListener('click', this.onClick, options);
    element.addEventListener('input', this.onInput, options);
    element.addEventListener('keydown', this.onKeyDown, options);
    element.addEventListener('focusin', (event) => {
      if (event.target instanceof HTMLInputElement) actions.transactionStart();
    }, options);
    element.addEventListener('focusout', (event) => {
      if (event.target instanceof HTMLInputElement) { actions.transactionEnd(); this.refresh(); }
    }, options);
    element.addEventListener('pointerdown', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === 'range') {
        this.rangeEditing = true;
        actions.transactionStart();
      }
    }, options);
    element.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === 'range') actions.transactionEnd();
    }, options);
    window.addEventListener('pointerup', () => {
      if (this.rangeEditing) { this.rangeEditing = false; actions.transactionEnd(); }
    }, options);
  }

  update(selection: SelectionSet, diagram: Diagram): void {
    const selected = selectedItems(diagram, selection);
    this.nodes = selected.nodes;
    this.edges = selected.edges;
    this.items = [...this.nodes, ...this.edges];
    this.element.hidden = this.items.length === 0;
    const key = selectionKey(selection);
    this.mode = this.nodes.length && this.edges.length ? 'mixed' : this.nodes.length ? 'nodes' : 'edges';
    if (!this.items.length) { this.key = key; return; }
    if (key !== this.key) { this.key = key; this.build(); }
    this.refresh();
  }

  private build(): void {
    const count = this.items.length;
    const isNode = this.mode === 'nodes';
    const isEdge = this.mode === 'edges';
    const title = this.mode === 'mixed' ? `Selected · ${count}`
      : isNode ? (count === 1 ? 'Node' : `Nodes · ${count}`)
        : count === 1 ? 'Arrow' : `Arrows · ${count}`;
    this.element.innerHTML = `
      <div class="inspector-header"><span>${title}</span><div class="header-actions">
        ${isEdge ? iconButton('reverse', 'reverse', 'Reverse arrows') : ''}
        ${iconButton('remove', 'trash', 'Delete · Del')}
        ${iconButton('deselect', 'close', 'Deselect · Esc')}
      </div></div>
      <div class="inspector-body">
        <label class="field-label" for="item-label">Label</label>
        <input id="item-label" class="label-input" data-field="label" maxlength="160" autocomplete="off" spellcheck="false" />
        <label class="checkbox-field" title="When disabled, the label is fixed in the XY plane"><input type="checkbox" data-field="billboard" aria-label="Billboard" /><span>Billboard</span></label>
        ${this.mode !== 'mixed' ? `
          <div class="inspector-rule"></div>
          <div class="field-label">${isNode ? 'Shape' : 'Type'}</div>
          <div class="segmented ${isNode ? 'shapes' : 'arrow-kinds'}" role="group" aria-label="${isNode ? 'Node shape' : 'Arrow type'}">
            ${isNode ? ['sphere', 'cube', 'diamond'].map((shape, index) => `<button type="button" data-shape="${shape}" title="${['Sphere', 'Cube', 'Diamond'][index]}" aria-label="${['Sphere', 'Cube', 'Diamond'][index]}" aria-pressed="false">${icon(shape)}</button>`).join('')
              : ['arrow', 'mono', 'epi', 'inclusion'].map((kind, index) => `<button type="button" data-kind="${kind}" title="${['Ordinary', 'Monomorphism', 'Epimorphism', 'Inclusion'][index]}" aria-label="${['Ordinary arrow', 'Monomorphism', 'Epimorphism', 'Inclusion'][index]}" aria-pressed="false">${icon(kind)}</button>`).join('')}
          </div>
          ${isNode ? this.slider('size', 'Size', 0.1, 4, 0.01) : this.lengthControls() + this.slider('width', 'Thickness', 0.015, 0.12, 0.001) + this.slider('bend', 'Curvature', -4, 4, 0.05)}
        ` : ''}
        <div class="field-label color-heading">Color</div>
        <div class="color-palette" role="group" aria-label="Color">
          ${PALETTE.map((color, index) => `<button type="button" class="color-swatch" data-color="${color}" style="--swatch:${color}" aria-label="${['Graphite', 'Blue', 'Purple', 'Green', 'Ochre', 'Pink'][index]}" aria-pressed="false"></button>`).join('')}
          <label class="custom-color" title="Custom color"><input type="color" data-field="color" aria-label="Custom color" /><span></span></label>
        </div>
        ${isNode ? `<div class="inspector-rule"></div>${count > 1 ? '<div class="field-label position-heading">Group center</div>' : ''}<div class="position-fields" role="group" aria-label="${count > 1 ? 'Group center' : 'Position'}">${['X', 'Y', 'Z'].map((axis, index) => `<label><span>${axis}</span><input type="number" data-field="position-${index}" step="any" min="-100000" max="100000" aria-label="Coordinate ${axis}" /></label>`).join('')}</div>` : ''}
      </div>
    `;
    this.element.querySelectorAll<HTMLElement>('[data-tip]').forEach((item) => { item.title = item.dataset.tip ?? ''; });
  }

  private slider(field: string, label: string, min: number, max: number, step: number): string {
    return `<div class="slider-field"><div><label class="field-label" for="${field}-range">${label}</label><input type="number" data-field="${field}" min="${min}" max="${max}" step="${step}" aria-label="${label}" /></div><input type="range" id="${field}-range" data-field="${field}" min="${min}" max="${max}" step="${step}" aria-label="${label}" /></div>`;
  }

  private lengthControls(): string {
    return `<div class="length-field">
      <div class="length-heading"><span class="field-label">Length</span><span class="range-values"><output data-range-start>0%</output><span>—</span><output data-range-end>100%</output></span></div>
      <div class="range-pair" role="group" aria-label="Arrow length">
        <div class="range-track"></div><div class="range-fill"></div>
        <input type="range" data-field="start" min="0" max="100" step="1" value="0" aria-label="Arrow start" />
        <input type="range" data-field="end" min="0" max="100" step="1" value="100" aria-label="Arrow end" />
      </div>
    </div>`;
  }

  private onClick = (event: MouseEvent): void => {
    const target = event.target as Element;
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'remove') this.actions.remove();
    if (action === 'deselect') this.actions.deselect();
    if (action === 'reverse') this.actions.reverse();
    const shape = target.closest<HTMLElement>('[data-shape]')?.dataset.shape as DiagramNode['shape'] | undefined;
    if (shape) this.actions.updateNode({ shape });
    const kind = target.closest<HTMLElement>('[data-kind]')?.dataset.kind as DiagramEdge['kind'] | undefined;
    if (kind) this.actions.updateEdge({ kind });
    const color = target.closest<HTMLElement>('[data-color]')?.dataset.color;
    if (color) this.actions.updateCommon({ color });
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if ((event.ctrlKey || event.metaKey) && ['KeyZ', 'KeyY'].includes(event.code)) {
      event.preventDefault();
      event.stopPropagation();
      input.blur();
      if (event.code === 'KeyY' || event.shiftKey) this.actions.redo(); else this.actions.undo();
      if (input.isConnected && !this.element.hidden) { input.focus(); input.select(); }
      return;
    }
    if (event.key === 'Enter' && input.type === 'number') input.blur();
    if (input.dataset.field === 'label' && input.dataset.mixed === 'true' && input.value === '' && ['Backspace', 'Delete'].includes(event.key)) {
      event.preventDefault();
      this.actions.updateCommon({ label: '' });
    }
  };

  private onInput = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const field = input.dataset.field;
    if (field === 'label') this.actions.updateCommon({ label: input.value });
    if (field === 'color') this.actions.updateCommon({ color: input.value });
    if (field === 'billboard') this.actions.updateCommon({ labelMode: input.checked ? 'billboard' : 'fixed' });
    if (!input.validity.valid || input.value.trim() === '' || !Number.isFinite(input.valueAsNumber)) return;
    const value = input.valueAsNumber;
    if (field === 'start' || field === 'end') this.actions.updateEdge({ [field]: value / 100 });
    if (field === 'size') this.actions.updateNode({ size: value });
    if (field === 'width' || field === 'bend') this.actions.updateEdge({ [field]: value });
    if (field?.startsWith('position-')) this.actions.position(Number(field.slice(-1)), value);
  };

  private setInput(field: string, value: string | number | undefined, representative?: number): void {
    this.element.querySelectorAll<HTMLInputElement>(`[data-field="${field}"]`).forEach((input) => {
      const mixed = value === undefined;
      input.dataset.mixed = String(mixed);
      input.classList.toggle('is-mixed', mixed);
      input.placeholder = mixed ? '—' : '';
      if (mixed) input.setAttribute('aria-description', MIXED); else input.removeAttribute('aria-description');
      if (input.type === 'range') {
        input.value = String(value ?? representative ?? 0);
        if (mixed) input.setAttribute('aria-valuetext', MIXED); else input.removeAttribute('aria-valuetext');
      } else if (input !== document.activeElement || input.type === 'color') {
        input.value = value === undefined ? '' : String(typeof value === 'number' ? Math.round(value * 1000) / 1000 : value);
      }
    });
  }

  private refresh(): void {
    if (!this.items.length) return;
    this.setInput('label', sharedValue(this.items.map((item) => item.label)));
    const mode = sharedValue(this.items.map((item) => item.labelMode));
    const checkbox = this.element.querySelector<HTMLInputElement>('[data-field="billboard"]');
    if (checkbox) {
      checkbox.indeterminate = mode === undefined;
      checkbox.checked = mode === 'billboard';
      checkbox.setAttribute('aria-checked', mode === undefined ? 'mixed' : String(checkbox.checked));
    }
    const color = sharedValue(this.items.map((item) => item.color));
    this.setInput('color', color ?? this.items[0].color);
    const colorInput = this.element.querySelector<HTMLInputElement>('[data-field="color"]');
    if (colorInput) {
      colorInput.dataset.mixed = String(color === undefined);
      if (color === undefined) colorInput.setAttribute('aria-description', MIXED); else colorInput.removeAttribute('aria-description');
    }
    const customColor = this.element.querySelector<HTMLElement>('.custom-color');
    customColor?.classList.toggle('is-mixed', color === undefined);
    if (customColor) customColor.title = color === undefined ? MIXED : 'Custom color';
    this.element.style.setProperty('--custom-color', color ?? this.items[0].color);
    this.element.querySelectorAll<HTMLElement>('[data-color]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.color === color));
    });
    if (this.mode === 'nodes') {
      const shape = sharedValue(this.nodes.map((node) => node.shape));
      const sizes = this.nodes.map((node) => node.size);
      this.setInput('size', sharedValue(sizes), sizes.reduce((sum, size) => sum + size, 0) / sizes.length);
      nodeCenter(this.nodes)?.forEach((value, axis) => this.setInput(`position-${axis}`, value));
      this.element.querySelectorAll<HTMLElement>('[data-shape]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.shape === shape));
      });
    }
    if (this.mode === 'edges') {
      for (const field of ['width', 'bend', 'start', 'end'] as const) {
        const values = this.edges.map((edge) => edge[field]);
        const factor = field === 'start' || field === 'end' ? 100 : 1;
        const common = sharedValue(values);
        this.setInput(field, common === undefined ? undefined : common * factor, values.reduce((sum, value) => sum + value, 0) / values.length * factor);
      }
      const kind = sharedValue(this.edges.map((edge) => edge.kind));
      this.element.querySelectorAll<HTMLElement>('[data-kind]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
      });
      const range = this.element.querySelector<HTMLElement>('.range-pair');
      for (const field of ['start', 'end'] as const) {
        const values = this.edges.map((edge) => edge[field]);
        const common = sharedValue(values);
        range?.style.setProperty(`--range-${field}`, String(common ?? values.reduce((sum, value) => sum + value, 0) / values.length));
        const output = this.element.querySelector<HTMLOutputElement>(`[data-range-${field}]`);
        if (output) output.value = common === undefined ? '—' : `${Math.round(common * 100)}%`;
        const input = this.element.querySelector<HTMLInputElement>(`[data-field="${field}"]`);
        const attribute = field === 'start' ? 'aria-valuemax' : 'aria-valuemin';
        const bound = field === 'start' ? Math.min(...this.edges.map((edge) => edge.end)) - ARROW_MIN_SPAN : Math.max(...this.edges.map((edge) => edge.start)) + ARROW_MIN_SPAN;
        if (common === undefined) input?.removeAttribute(attribute); else input?.setAttribute(attribute, String(Math.round(bound * 100)));
      }
      range?.classList.toggle('is-mixed', sharedValue(this.edges.map((edge) => edge.start)) === undefined || sharedValue(this.edges.map((edge) => edge.end)) === undefined);
    }
  }

  focusLabel(): void {
    const input = this.element.querySelector<HTMLInputElement>('[data-field="label"]');
    input?.focus();
    input?.select();
  }

  dispose(): void { this.abort.abort(); }
}
