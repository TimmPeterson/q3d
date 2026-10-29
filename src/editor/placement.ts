import type { DiagramNode, Vec3, WorkPlane } from '../model/types.ts';

export function findNodePosition(
  center: Vec3, plane: WorkPlane, depth: number, nodes: readonly DiagramNode[], size: number, snap: boolean,
): Vec3 {
  const normal = plane === 'XZ' ? 1 : plane === 'XY' ? 2 : 0;
  const axes = [0, 1, 2].filter((axis) => axis !== normal);
  const origin = [...center] as Vec3;
  origin[normal] = depth;
  const spacing = Math.max(0.8, size + 0.4);
  for (let index = 0; index < 2000; index++) {
    const point = [...origin] as Vec3;
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const radius = index === 0 ? 0 : spacing * Math.sqrt(index);
    point[axes[0]] += Math.cos(angle) * radius;
    point[axes[1]] += Math.sin(angle) * radius;
    if (snap) axes.forEach((axis) => { point[axis] = Math.round(point[axis] * 2) / 2; });
    if (point.some((value) => Math.abs(value) > 100000)) continue;
    const free = nodes.every((node) => {
      const radius = node.size * (node.shape === 'cube' ? Math.sqrt(3) / 2 : node.shape === 'diamond' ? 0.67 : 0.5);
      return Math.hypot(...point.map((value, axis) => value - node.position[axis])) > radius + size / 2 + 0.3;
    });
    if (free) return point;
  }
  return origin;
}
