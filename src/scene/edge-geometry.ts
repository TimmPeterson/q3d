import {
  ConeGeometry, CubicBezierCurve3, Curve, Group, Mesh, MeshBasicMaterial,
  QuadraticBezierCurve3, SphereGeometry, TubeGeometry, Vector3,
} from 'three';
import type { DiagramEdge, DiagramNode } from '../model/types.ts';

const UP = new Vector3(0, 1, 0);

export function surfaceDistance(node: DiagramNode, direction: Vector3): number {
  const axis = direction.clone().normalize();
  if (node.shape === 'cube') {
    return node.size * 0.5 / Math.max(Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z));
  }
  if (node.shape === 'diamond') {
    return node.size * 0.67 / (Math.abs(axis.x) + Math.abs(axis.y) + Math.abs(axis.z));
  }
  return node.size * 0.5;
}

export function perpendicular(direction: Vector3): Vector3 {
  const reference = Math.abs(direction.y) < 0.92 ? UP : new Vector3(0, 0, 1);
  return reference.clone().addScaledVector(direction, -reference.dot(direction)).normalize();
}

function fullEdgePath(edge: DiagramEdge, source: DiagramNode, target: DiagramNode): Curve<Vector3> {
  const start = new Vector3(...source.position);
  const end = new Vector3(...target.position);
  const direction = end.clone().sub(start);

  if (source.id === target.id || direction.lengthSq() < 0.001) {
    const radius = Math.max(source.size, target.size) * 0.5;
    const height = Math.max(1.6, radius * 3) + Math.abs(edge.bend);
    const sign = edge.bend < 0 ? -1 : 1;
    const from = new Vector3(1, 0.6 * sign, 0).normalize();
    const to = new Vector3(-1, 0.6 * sign, 0).normalize();
    return new CubicBezierCurve3(
      start.clone().addScaledVector(from, surfaceDistance(source, from) + 0.07),
      start.clone().add(new Vector3(height, height * sign, 0)),
      end.clone().add(new Vector3(-height, height * sign, 0)),
      end.clone().addScaledVector(to, surfaceDistance(target, to) + 0.07),
    );
  }

  const distance = direction.length();
  direction.normalize();
  const components = [direction.x, direction.y, direction.z];
  const major = components.reduce((largest, component) => Math.abs(component) > Math.abs(largest) ? component : largest, 0);
  const side = perpendicular(direction).multiplyScalar(major < 0 ? -1 : 1);
  const control = start.clone().lerp(end, 0.5).addScaledVector(side, edge.bend);
  const from = control.clone().sub(start).normalize();
  const to = control.clone().sub(end).normalize();
  const startInset = Math.min(surfaceDistance(source, from) + 0.09, distance * 0.35);
  const endInset = Math.min(surfaceDistance(target, to) + 0.09, distance * 0.35);
  return new QuadraticBezierCurve3(
    start.addScaledVector(from, startInset), control, end.addScaledVector(to, endInset),
  );
}

class CurveSection extends Curve<Vector3> {
  private path: Curve<Vector3>;
  private start: number;
  private end: number;

  constructor(path: Curve<Vector3>, start: number, end: number) {
    super();
    this.path = path;
    this.start = start;
    this.end = end;
  }

  getPoint(t: number, target = new Vector3()): Vector3 {
    return this.path.getPointAt(this.start + t * (this.end - this.start), target);
  }
}

export function edgePath(edge: DiagramEdge, source: DiagramNode, target: DiagramNode): Curve<Vector3> {
  const path = fullEdgePath(edge, source, target);
  return edge.start === 0 && edge.end === 1 ? path : new CurveSection(path, edge.start, edge.end);
}

export interface EdgeGeometry {
  group: Group;
  path: Curve<Vector3>;
  pickMesh: Mesh;
  dispose: () => void;
}

export function createEdgeGeometry(edge: DiagramEdge, source: DiagramNode, target: DiagramNode): EdgeGeometry {
  const group = new Group();
  const path = edgePath(edge, source, target);
  const length = Math.max(path.getLength(), 0.001);
  const material = new MeshBasicMaterial({ color: edge.color });
  const headLength = Math.min(Math.max(0.22, edge.width * 7.5), length * 0.25);
  const headRadius = headLength * 0.34;
  const shaftEnd = Math.max(0.01, 1 - headLength * 0.85 / length);
  const shaft = new Mesh(new TubeGeometry(new CurveSection(path, 0, shaftEnd), 48, edge.width / 2, 8, false), material);
  group.add(shaft);

  const cap = new Mesh(new SphereGeometry(edge.width / 2, 8, 6), material);
  cap.position.copy(path.getPointAt(0));
  group.add(cap);

  const addHead = (t: number, name = 'arrow-head') => {
    const tip = path.getPointAt(t);
    const tangent = path.getTangentAt(t).normalize();
    const head = new Mesh(new ConeGeometry(headRadius, headLength, 16), material);
    head.name = name;
    head.position.copy(tip).addScaledVector(tangent, -headLength / 2);
    head.quaternion.setFromUnitVectors(UP, tangent);
    group.add(head);
  };
  addHead(1);
  if (edge.kind === 'epi') addHead(Math.max(0.35, 1 - headLength * 0.88 / length));
  if (edge.kind === 'inclusion') addHead(headLength / length, 'start-head');

  if (edge.kind === 'mono') {
    const origin = path.getPointAt(0);
    const tangent = path.getTangentAt(0).normalize();
    const side = perpendicular(tangent);
    const radius = Math.min(0.11 + edge.width, length * 0.1);
    const hook = new CubicBezierCurve3(
      origin.clone(),
      origin.clone().addScaledVector(tangent, -radius * 1.4),
      origin.clone().addScaledVector(tangent, -radius * 1.4).addScaledVector(side, radius * 2),
      origin.clone().addScaledVector(side, radius * 2),
    );
    group.add(new Mesh(new TubeGeometry(hook, 18, edge.width / 2, 8, false), material));
    const tip = new Mesh(new SphereGeometry(edge.width / 2, 8, 6), material);
    tip.position.copy(hook.v3);
    group.add(tip);
  }

  const pickMesh = new Mesh(
    new TubeGeometry(path, 40, Math.max(0.12, edge.width * 2.5), 6, false),
    new MeshBasicMaterial({ visible: false }),
  );
  pickMesh.userData = { type: 'edge', id: edge.id };
  group.add(pickMesh);

  return {
    group, path, pickMesh,
    dispose: () => {
      group.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
      material.dispose();
      (pickMesh.material as MeshBasicMaterial).dispose();
    },
  };
}
