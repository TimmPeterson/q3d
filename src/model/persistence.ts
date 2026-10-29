import { parseDiagram, serializeDiagram } from './document.ts';
import { emptyDiagram } from './types.ts';
import type { Diagram } from './types.ts';

const STORAGE_KEY = 'q3d.document.v1';

export function restoreDocument(): Diagram {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseDiagram(JSON.parse(saved)) : emptyDiagram();
  } catch {
    return emptyDiagram();
  }
}

export function saveDocument(diagram: Diagram): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, serializeDiagram(diagram));
    return true;
  } catch {
    return false;
  }
}

export function downloadDocument(diagram: Diagram): void {
  const url = URL.createObjectURL(new Blob([serializeDiagram(diagram)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'diagram.q3d.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
