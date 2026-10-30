import { parseDiagram } from './document.ts';
import type { Diagram } from './types.ts';

export interface Example {
  id: string;
  name: string;
  url: string;
}

export type ExampleId = Example['id'];

export function createExampleCatalog(files: Readonly<Record<string, string>>): readonly Example[] {
  return Object.entries(files).flatMap(([path, url]) => {
    const match = path.match(/(?:^|\/)examples\/([^/]+)\.q3d\.json$/);
    if (!match) return [];
    const id = match[1];
    const title = id.replace(/[-_]+/g, ' ');
    return [{ id, name: title.charAt(0).toUpperCase() + title.slice(1), url }];
  }).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || a.id.localeCompare(b.id, 'en'));
}

export async function loadExample(examples: readonly Example[], id: ExampleId, signal?: AbortSignal): Promise<Diagram> {
  const example = examples.find(item => item.id === id);
  if (!example) throw new Error('Unknown example');
  const response = await fetch(example.url, { signal });
  if (!response.ok) throw new Error('Could not load example');
  return parseDiagram(await response.json());
}
