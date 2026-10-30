import { createExampleCatalog } from './model/examples.ts';

export const EXAMPLES = createExampleCatalog(import.meta.glob<string>('../examples/*.q3d.json', {
  eager: true,
  query: '?url',
  import: 'default',
}));
