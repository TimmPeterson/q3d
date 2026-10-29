import {
  CanvasTexture, DoubleSide, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace,
} from 'three';
import type { Camera } from 'three';
import type { LabelMode } from '../model/types.ts';

const geometry = new PlaneGeometry(1, 1);
const FONT_SIZE = 64;
const PIXELS_PER_UNIT = 140;

export class TextLabel extends Mesh<PlaneGeometry, MeshBasicMaterial> {
  private texture: CanvasTexture | null = null;
  private signature = '';
  mode: LabelMode = 'billboard';

  constructor() {
    super(geometry, new MeshBasicMaterial({
      transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
    }));
    this.renderOrder = 3;
  }

  update(text: string, color: string, mode: LabelMode): void {
    this.mode = mode;
    this.visible = text.length > 0;
    const signature = `${text}\0${color}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.texture?.dispose();
    this.texture = null;
    if (!text) return;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    const lines = text.split('\n').slice(0, 4);
    const font = `500 ${FONT_SIZE}px Georgia, "Times New Roman", serif`;
    context.font = font;
    const padding = 18;
    canvas.width = Math.ceil(Math.max(...lines.map((line) => context.measureText(line || ' ').width))) + padding * 2;
    canvas.height = FONT_SIZE * 1.25 * lines.length + padding * 2;
    context.font = font;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.strokeStyle = '#ffffff';
    context.lineWidth = 9;
    context.fillStyle = color;
    lines.forEach((line, index) => {
      const y = padding + FONT_SIZE * 1.25 * (index + 0.5);
      context.strokeText(line, canvas.width / 2, y);
      context.fillText(line, canvas.width / 2, y);
    });

    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.material.map = this.texture;
    this.material.needsUpdate = true;
    this.scale.set(canvas.width / PIXELS_PER_UNIT, canvas.height / PIXELS_PER_UNIT, 1);
  }

  faceCamera(camera: Camera): void {
    if (this.mode === 'billboard') this.quaternion.copy(camera.quaternion);
    else this.quaternion.identity();
  }

  dispose(): void {
    this.texture?.dispose();
    this.material.dispose();
  }
}
