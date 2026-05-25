import type { CircuitData, Component } from '../components/types.js';
import { drawWire, drawResistor, drawCapacitor, drawInductor, drawDiode, drawBJT, drawOpAmp, drawVoltageSource, drawGround, drawDot } from './symbols.js';
import { formatSI } from './format.js';

const WAVEFORM_NAMES = ['DC', 'AC', 'Sq', 'Tri', 'Saw', 'Pls', 'Nse'];

function componentLabel(comp: Component): string | undefined {
  switch (comp.type) {
    case 'r': return formatSI(comp.resistance, 'Ω');
    case 'c': return formatSI(comp.capacitance, 'F');
    case 'l': return formatSI(comp.inductance, 'H');
    case 'v': case 'R': {
      const wf = WAVEFORM_NAMES[comp.waveform] ?? '?';
      return `${wf} ${formatSI(comp.frequency, 'Hz')} ${formatSI(comp.maxVoltage, 'V')}`;
    }
    default: return undefined;
  }
}

function isVertical(comp: Component): boolean {
  return comp.x1 === comp.x2;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private circuitData: CircuitData;
  private scale: number;
  private offsetX: number;
  private offsetY: number;

  constructor(canvas: HTMLCanvasElement, circuitData: CircuitData) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2d context');
    this.ctx = ctx;
    this.circuitData = circuitData;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const comp of circuitData.components) {
      minX = Math.min(minX, comp.x1, comp.x2);
      minY = Math.min(minY, comp.y1, comp.y2);
      maxX = Math.max(maxX, comp.x1, comp.x2);
      maxY = Math.max(maxY, comp.y1, comp.y2);
    }

    const pad = 50;
    const bboxW = maxX - minX || 1;
    const bboxH = maxY - minY || 1;
    const scaleX = (canvas.width - 2 * pad) / bboxW;
    const scaleY = (canvas.height - 2 * pad) / bboxH;
    this.scale = Math.min(scaleX, scaleY);
    this.offsetX = pad - minX * this.scale + (canvas.width - 2 * pad - bboxW * this.scale) / 2;
    this.offsetY = pad - minY * this.scale + (canvas.height - 2 * pad - bboxH * this.scale) / 2;
  }

  private tx(x: number): number { return x * this.scale + this.offsetX; }
  private ty(y: number): number { return y * this.scale + this.offsetY; }

  render(): void {
    const { ctx } = this;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#333';
    ctx.fillStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Draw components
    for (const comp of this.circuitData.components) {
      const x1 = this.tx(comp.x1);
      const y1 = this.ty(comp.y1);
      const x2 = this.tx(comp.x2);
      const y2 = this.ty(comp.y2);

      switch (comp.type) {
        case 'w': drawWire(ctx, x1, y1, x2, y2); break;
        case 'r': drawResistor(ctx, x1, y1, x2, y2); break;
        case 'c': drawCapacitor(ctx, x1, y1, x2, y2); break;
        case 'l': drawInductor(ctx, x1, y1, x2, y2); break;
        case 'd': drawDiode(ctx, x1, y1, x2, y2); break;
        case 't': drawBJT(ctx, x1, y1, x2, y2, (comp as any).pnp); break;
        case 'a': drawOpAmp(ctx, x1, y1, x2, y2); break;
        case 'v': case 'R': drawVoltageSource(ctx, x1, y1, x2, y2); break;
        case 'g': drawGround(ctx, x1, y1, x2, y2); break;
        case 'O': case 'p': drawDot(ctx, x1, y1); break;
      }
    }

    // Draw labels (always horizontal, offset from component)
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#555';
    for (const comp of this.circuitData.components) {
      const label = componentLabel(comp);
      if (!label) continue;

      const mx = (this.tx(comp.x1) + this.tx(comp.x2)) / 2;
      const my = (this.ty(comp.y1) + this.ty(comp.y2)) / 2;

      if (isVertical(comp)) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx + 14, my);
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, mx, my - 14);
      }
    }

    this.drawJunctions();
  }

  private drawJunctions(): void {
    const counts = new Map<string, { x: number; y: number; count: number }>();
    for (const comp of this.circuitData.components) {
      const k1 = `${comp.x1},${comp.y1}`;
      const k2 = `${comp.x2},${comp.y2}`;
      if (!counts.has(k1)) counts.set(k1, { x: this.tx(comp.x1), y: this.ty(comp.y1), count: 0 });
      if (!counts.has(k2)) counts.set(k2, { x: this.tx(comp.x2), y: this.ty(comp.y2), count: 0 });
      counts.get(k1)!.count++;
      counts.get(k2)!.count++;
    }
    this.ctx.fillStyle = '#333';
    for (const { x, y, count } of counts.values()) {
      if (count >= 3) {
        drawDot(this.ctx, x, y);
      }
    }
  }
}
