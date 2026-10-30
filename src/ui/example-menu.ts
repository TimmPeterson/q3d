import { EXAMPLES } from '../examples.ts';
import type { ExampleId } from '../model/examples.ts';

export class ExampleMenu {
  private element: HTMLElement;
  private toggle: HTMLButtonElement;
  private menu: HTMLElement;
  private items: HTMLButtonElement[];
  private abort = new AbortController();

  constructor(element: HTMLElement, select: (id: ExampleId) => void) {
    this.element = element;
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'icon-button examples-toggle';
    this.toggle.textContent = 'Ex';
    this.toggle.disabled = EXAMPLES.length === 0;
    this.toggle.dataset.tip = 'Examples';
    this.toggle.setAttribute('aria-label', 'Examples');
    this.toggle.setAttribute('aria-haspopup', 'menu');
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.setAttribute('aria-controls', 'examples-menu');

    this.menu = document.createElement('div');
    this.menu.id = 'examples-menu';
    this.menu.className = 'examples-menu panel';
    this.menu.setAttribute('role', 'menu');
    this.menu.setAttribute('aria-label', 'Examples');
    this.menu.hidden = true;
    const options = { signal: this.abort.signal };
    this.items = EXAMPLES.map(example => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = example.name;
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
      button.addEventListener('click', () => {
        this.close(true);
        select(example.id);
      }, options);
      this.menu.append(button);
      return button;
    });
    element.append(this.toggle, this.menu);
    this.toggle.addEventListener('click', () => {
      if (this.menu.hidden) this.open(); else this.close();
    }, options);
    element.addEventListener('keydown', this.onKeyDown, options);
    element.addEventListener('focusout', event => {
      if (event.relatedTarget instanceof Node && !element.contains(event.relatedTarget)) this.close();
    }, options);
    document.addEventListener('pointerdown', event => {
      if (event.target instanceof Node && !element.contains(event.target)) this.close();
    }, { ...options, capture: true });
  }

  private open(index = 0): void {
    this.menu.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.items[index]?.focus();
  }

  private close(restoreFocus = false): void {
    this.menu.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.toggle.focus();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.target === this.toggle && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      this.open(event.key === 'ArrowUp' ? this.items.length - 1 : 0);
      return;
    }
    if (event.target === this.toggle && ['Enter', ' '].includes(event.key)) event.stopPropagation();
    if (this.menu.hidden) return;
    const index = this.items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (index + 1) % this.items.length;
    if (event.key === 'ArrowUp') next = (index + this.items.length - 1) % this.items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = this.items.length - 1;
    if (next !== undefined || event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (next !== undefined) this.items[next].focus(); else this.close(true);
    } else if (event.key === 'Tab') {
      this.close(true);
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      event.stopPropagation();
      if (event.key.length === 1 && event.key !== ' ') {
        event.preventDefault();
        this.items.find(item => item.textContent?.toLowerCase().startsWith(event.key.toLowerCase()))?.focus();
      }
    }
  };

  setLoading(loading: boolean): void {
    this.toggle.setAttribute('aria-busy', String(loading));
  }

  dispose(): void {
    this.abort.abort();
    this.element.replaceChildren();
  }
}
