import { parseDiagram } from './document.ts';
import type { Diagram } from './types.ts';

export const EXAMPLES = [
  {
    id: 'commutative-cube',
    name: 'Commutative cube',
    url: new URL('../../examples/cube.q3d.json', import.meta.url).href,
  },
  {
    id: 'kernel-cokernel-cube',
    name: 'Kernels and cokernels',
    url: new URL('../../examples/kernel-cokernel-cube.q3d.json', import.meta.url).href,
  },
] as const;

export type ExampleId = typeof EXAMPLES[number]['id'];

export async function loadExample(id: ExampleId, signal?: AbortSignal): Promise<Diagram> {
  const example = EXAMPLES.find(item => item.id === id);
  if (!example) throw new Error('Unknown example');
  const response = await fetch(example.url, { signal });
  if (!response.ok) throw new Error('Could not load example');
  return parseDiagram(await response.json());
}
