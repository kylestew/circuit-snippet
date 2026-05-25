import type { Netlist, CircuitData } from '../components/types.js';

const TRACE_COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8'];

interface Trace {
  nodeId: number;
  label: string;
  color: string;
}

function niceInterval(range: number, targetDivisions: number): number {
  const rough = range / targetDivisions;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

function formatTime(seconds: number): string {
  if (seconds >= 1) return `${seconds.toFixed(1)}s`;
  if (seconds >= 1e-3) return `${(seconds * 1e3).toFixed(1)}ms`;
  return `${(seconds * 1e6).toFixed(0)}μs`;
}

function formatVoltage(v: number): string {
  if (Math.abs(v) >= 1) return `${v.toFixed(1)}V`;
  if (Math.abs(v) >= 1e-3) return `${(v * 1e3).toFixed(0)}mV`;
  return `${(v * 1e6).toFixed(0)}μV`;
}

export class Scope {
  private ctx: CanvasRenderingContext2D;
  private traces: Trace[];

  constructor(canvas: HTMLCanvasElement, netlist: Netlist, circuitData: CircuitData) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2d context');
    this.ctx = ctx;
    this.traces = this.resolveTraces(netlist, circuitData);
  }

  private resolveTraces(netlist: Netlist, circuitData: CircuitData): Trace[] {
    const traces: Trace[] = [];
    let colorIdx = 0;

    if (netlist.scopes.length > 0) {
      for (const scope of netlist.scopes) {
        for (const plot of scope.plots) {
          if (plot.value !== 0) continue; // only voltage for now
          const elemIdx = plot.elementOverride ?? scope.elementIndex;
          const comp = circuitData.components[elemIdx];
          if (!comp) continue;

          // Find which netlist node this component's first terminal maps to
          const nc = netlist.components.find(nc => nc.component === comp);
          if (!nc) continue;

          const nodeId = nc.nodes[0];
          if (traces.some(t => t.nodeId === nodeId)) continue;

          traces.push({
            nodeId,
            label: `Node ${nodeId} (${comp.type})`,
            color: TRACE_COLORS[colorIdx++ % TRACE_COLORS.length],
          });
        }
      }
    }

    // Fallback: plot all non-ground nodes
    if (traces.length === 0) {
      for (const node of netlist.nodes) {
        if (node.id === 0) continue;
        traces.push({
          nodeId: node.id,
          label: `Node ${node.id}`,
          color: TRACE_COLORS[colorIdx++ % TRACE_COLORS.length],
        });
      }
    }

    return traces;
  }

  plot(result: { time: number[]; voltages: number[][] }): void {
    const { ctx, traces } = this;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const margin = { top: 20, right: 20, bottom: 35, left: 55 };
    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;

    // Clear
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    if (result.time.length === 0) return;

    // Compute ranges
    const tMin = result.time[0];
    const tMax = result.time[result.time.length - 1];
    const tRange = tMax - tMin || 1e-6;

    let vMin = Infinity, vMax = -Infinity;
    for (const trace of traces) {
      for (const snapshot of result.voltages) {
        const v = snapshot[trace.nodeId];
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
    }
    // Pad voltage range
    const vPad = (vMax - vMin) * 0.1 || 0.5;
    vMin -= vPad;
    vMax += vPad;
    const vRange = vMax - vMin;

    const tx = (t: number) => margin.left + ((t - tMin) / tRange) * plotW;
    const ty = (v: number) => margin.top + (1 - (v - vMin) / vRange) * plotH;

    // Grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#888';

    // Voltage grid
    const vInterval = niceInterval(vRange, 5);
    const vStart = Math.ceil(vMin / vInterval) * vInterval;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = vStart; v <= vMax; v += vInterval) {
      const y = ty(v);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(w - margin.right, y);
      ctx.stroke();
      ctx.fillText(formatVoltage(v), margin.left - 5, y);
    }

    // Zero line
    if (vMin < 0 && vMax > 0) {
      const y0 = ty(0);
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin.left, y0);
      ctx.lineTo(w - margin.right, y0);
      ctx.stroke();
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 0.5;
    }

    // Time grid
    const tInterval = niceInterval(tRange, 6);
    const tStart = Math.ceil(tMin / tInterval) * tInterval;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = tStart; t <= tMax; t += tInterval) {
      const x = tx(t);
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, h - margin.bottom);
      ctx.stroke();
      ctx.fillText(formatTime(t), x, h - margin.bottom + 5);
    }

    // Plot border
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, plotW, plotH);

    // Traces
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    const step = Math.max(1, Math.floor(result.time.length / plotW));
    for (const trace of traces) {
      ctx.strokeStyle = trace.color;
      ctx.beginPath();
      for (let i = 0; i < result.time.length; i += step) {
        const x = tx(result.time[i]);
        const y = ty(result.voltages[i][trace.nodeId]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Legend
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < traces.length; i++) {
      const x = margin.left + 10;
      const y = margin.top + 8 + i * 16;
      ctx.fillStyle = traces[i].color;
      ctx.fillRect(x, y + 2, 10, 10);
      ctx.fillStyle = '#555';
      ctx.fillText(traces[i].label, x + 14, y);
    }
  }
}
