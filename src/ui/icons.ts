const paths: Record<string, string> = {
  cursor: '<path d="m5 3 13 9-6 1-3 6-4-16Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  mono: '<path d="M5 12h15m-6-6 6 6-6 6M5 12a3 3 0 1 1 3-3"/>',
  epi: '<path d="M3 12h17m-6-6 6 6-6 6m-5-12 6 6-6 6"/>',
  inclusion: '<path d="M3 12h18M3 7l5 5-5 5m12-10 6 5-6 5"/>',
  undo: '<path d="m9 5-5 5 5 5M4 10h9a6 6 0 0 1 6 6v2"/>',
  redo: '<path d="m15 5 5 5-5 5m5-5h-9a6 6 0 0 0-6 6v2"/>',
  new: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5m-7 4v5m-2.5-2.5h5"/>',
  open: '<path d="M3 9V6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v1M3 9h18l-2 10H5L3 9Z"/>',
  save: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  reverse: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
  sphere: '<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="3.5" ry="8"/><path d="M4 12h16"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9"/>',
  diamond: '<path d="m12 2 8 10-8 10L4 12 12 2Zm0 0v20M4 12h16"/>',
  grid: '<path d="M8 3v18m8-18v18M3 8h18M3 16h18"/>',
  snap: '<path d="M6 3v9a6 6 0 0 0 12 0V3h-4v9a2 2 0 0 1-4 0V3H6Zm0 4h4m4 0h4"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
  home: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9"/>',
  orthographic: '<path d="m8 4 12 0v12H8V4Zm0 0L4 8v12h12l4-4M4 8h12v12M16 8l4-4"/>',
};

export function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
}

export function iconButton(action: string, name: string, label: string, extra = ''): string {
  return `<button type="button" class="icon-button" data-action="${action}" aria-label="${label}" data-tip="${label}" ${extra}>${icon(name)}</button>`;
}
