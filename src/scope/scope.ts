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
  private displayTime: number;
  private lastTriggerTime = 0;
  private triggerPosition = 0.5;

  constructor(canvas: HTMLCanvasElement, netlist: Netlist, circuitData: CircuitData, displayTime = 0.012) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2d context');
    this.ctx = ctx;
    this.displayTime = displayTime;
    this.traces = this.resolveTraces(netlist, circuitData);
  }

  getRecommendedWindowSize(dt: number): number {
    return Math.ceil(this.displayTime / dt) * 2;
  }

  private resolveTraces(netlist: Netlist, circuitData: CircuitData): Trace[] {
    const traces: Trace[] = [];
    let colorIdx = 0;

    // Build coordinate → node ID map for resolving wires/grounds
    const coordToNode = new Map<string, number>();
    for (const node of netlist.nodes) {
      for (const c of node.coords) {
        coordToNode.set(`${c.x},${c.y}`, node.id);
      }
    }

    function resolveNodeForElement(comp: { x1: number; y1: number }): number | undefined {
      return coordToNode.get(`${comp.x1},${comp.y1}`);
    }

    const LABELS: Record<string, string> = {
      v: 'Input', R: 'Input', r: 'R', c: 'C', O: 'Output', p: 'Probe', w: 'Wire', g: 'GND',
    };

    if (netlist.scopes.length > 0) {
      for (const scope of netlist.scopes) {
        for (const plot of scope.plots) {
          if (plot.value !== 0) continue;
          const elemIdx = plot.elementOverride ?? scope.elementIndex;
          const comp = circuitData.components[elemIdx];
          if (!comp) continue;

          // Resolve node: try netlist component first, fall back to coordinate lookup
          let nodeId: number | undefined;
          const nc = netlist.components.find(nc => nc.component === comp);
          if (nc) {
            nodeId = nc.nodes[0];
          } else {
            nodeId = resolveNodeForElement(comp);
          }
          if (nodeId === undefined || nodeId === 0) continue;
          if (traces.some(t => t.nodeId === nodeId)) continue;

          traces.push({
            nodeId,
            label: LABELS[comp.type] ?? comp.type,
            color: TRACE_COLORS[colorIdx++ % TRACE_COLORS.length],
          });
        }
      }
    }

    // Fallback: plot all non-ground nodes, input first
    if (traces.length === 0) {
      // Put voltage source node first (trigger source)
      const vsComp = netlist.components.find(nc => nc.component.type === 'v' || nc.component.type === 'R');
      const vsNode = vsComp?.nodes[0];

      for (const node of netlist.nodes) {
        if (node.id === 0) continue;
        traces.push({
          nodeId: node.id,
          label: node.id === vsNode ? 'Input' : `Node ${node.id}`,
          color: TRACE_COLORS[colorIdx++ % TRACE_COLORS.length],
        });
      }

      // Move input to front for trigger
      if (vsNode !== undefined) {
        const idx = traces.findIndex(t => t.nodeId === vsNode);
        if (idx > 0) {
          const [input] = traces.splice(idx, 1);
          traces.unshift(input);
        }
      }
    }

    return traces;
  }

  private findTrigger(
    result: { time: number[]; voltages: number[][] },
    preTriggerSamples: number,
    postTriggerSamples: number
  ): number {
    const displaySamples = preTriggerSamples + postTriggerSamples;
    if (this.traces.length === 0 || result.voltages.length < displaySamples) return 0;
    const nodeId = this.traces[0].nodeId;

    let min = Infinity, max = -Infinity;
    for (const snap of result.voltages) {
      const v = snap[nodeId];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const threshold = (min + max) / 2;

    // Find rising edges that leave enough room on both sides of the trigger point.
    const earliestTrigger = Math.max(1, preTriggerSamples);
    const latestTrigger = result.time.length - postTriggerSamples;
    const edges: number[] = [];
    for (let i = earliestTrigger; i <= latestTrigger; i++) {
      const prev = result.voltages[i - 1][nodeId];
      const curr = result.voltages[i][nodeId];
      if (prev <= threshold && curr > threshold) {
        edges.push(i);
      }
    }

    if (edges.length === 0) return 0;

    // Pick the edge whose timestamp is closest to where we expect
    // the next trigger to be (last trigger time + N periods)
    if (this.lastTriggerTime > 0) {
      let bestIdx = edges[edges.length - 1];
      let bestDist = Infinity;
      for (const idx of edges) {
        const t = result.time[idx];
        // Distance to nearest whole period from last trigger
        const elapsed = t - this.lastTriggerTime;
        if (elapsed < 0) continue;
        // Estimate period from two consecutive edges
        const period = edges.length >= 2 ? result.time[edges[1]] - result.time[edges[0]] : elapsed;
        const remainder = period > 0 ? elapsed % period : elapsed;
        const dist = Math.min(remainder, period - remainder);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      }
      this.lastTriggerTime = result.time[bestIdx];
      return bestIdx;
    }

    // First time: use the latest edge
    const idx = edges[edges.length - 1];
    this.lastTriggerTime = result.time[idx];
    return idx;
  }

  plot(result: { time: number[]; voltages: number[][] }): void {
    const { ctx, traces } = this;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const margin = { top: 20, right: 20, bottom: 35, left: 55 };
    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    if (result.time.length < 10) return;

    // Display a fixed time window from the trigger point
    const displayTime = this.displayTime;
    const dt = result.time[1] - result.time[0];
    const displaySamples = Math.ceil(displayTime / dt);
    const preTriggerSamples = Math.floor(displaySamples * this.triggerPosition);
    const postTriggerSamples = Math.max(1, displaySamples - preTriggerSamples);
    const trigIdx = this.findTrigger(result, preTriggerSamples, postTriggerSamples);
    const displayStart = Math.max(0, trigIdx - preTriggerSamples);
    const displayEnd = Math.min(displayStart + displaySamples, result.time.length);

    if (displayEnd - displayStart < 2) return;

    // Use relative time (0-based from trigger point)
    const tOrigin = result.time[displayStart];
    const tRange = result.time[displayEnd - 1] - tOrigin || 1e-6;

    let vMin = Infinity, vMax = -Infinity;
    for (const trace of traces) {
      for (let i = displayStart; i < displayEnd; i++) {
        const v = result.voltages[i][trace.nodeId];
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
    }
    const vPad = (vMax - vMin) * 0.1 || 0.5;
    vMin -= vPad;
    vMax += vPad;
    const vRange = vMax - vMin;

    const tx = (t: number) => margin.left + ((t - tOrigin) / tRange) * plotW;
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

    // Time grid (relative from 0)
    const tInterval = niceInterval(tRange, 6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= tRange; t += tInterval) {
      const x = tx(tOrigin + t);
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

    // Trigger marker
    if (trigIdx >= displayStart && trigIdx < displayEnd) {
      const triggerTime = result.time[trigIdx];
      const triggerX = tx(triggerTime);
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(triggerX, margin.top);
      ctx.lineTo(triggerX, h - margin.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#d32f2f';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('T', triggerX, margin.top - 4);
    }

    // Traces
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const sampleCount = displayEnd - displayStart;
    const step = Math.max(1, Math.floor(sampleCount / plotW));
    for (const trace of traces) {
      ctx.strokeStyle = trace.color;
      ctx.beginPath();
      for (let i = displayStart; i < displayEnd; i += step) {
        const x = tx(result.time[i]);
        const y = ty(result.voltages[i][trace.nodeId]);
        if (i === displayStart) ctx.moveTo(x, y);
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
