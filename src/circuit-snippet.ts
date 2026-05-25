import { parseXML } from './parser/xml.js';
import { buildNetlist } from './parser/netlist.js';
import { Simulator } from './sim/simulator.js';
import { SimulationRunner } from './sim/runner.js';
import { Renderer } from './render/renderer.js';
import { Scope } from './scope/scope.js';
import { createSlider } from './controls/slider.js';
import type { CircuitData, Netlist } from './components/types.js';

function resolveComponentRef(ref: string, netlist: Netlist): number | null {
  const [type, idxStr] = ref.split(':');
  const typeIndex = parseInt(idxStr);
  let count = 0;
  for (let i = 0; i < netlist.components.length; i++) {
    if (netlist.components[i].component.type === type) {
      if (count === typeIndex) return i;
      count++;
    }
  }
  console.warn(`circuit-snippet: component ref "${ref}" not found`);
  return null;
}

export interface AddSliderOptions {
  label: string;
  componentIndex: number;
  param: string;
  min: number;
  max: number;
  scale?: 'linear' | 'log';
  unit?: string;
}

const STYLES = `
  :host { display: block; }
  .cs-container { display: flex; gap: 0; overflow: hidden; background: #fff; border: 1px solid #ddd; border-radius: 4px; }
  .cs-container.vertical { flex-direction: column; }
  .cs-container.horizontal { flex-direction: row; }
  .cs-container.dark { background: #1a1a1a; border-color: #333; }
  canvas { display: block; }
  .cs-controls { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 4px 8px; background: #f5f5f5; border-top: 1px solid #ddd; align-items: center; max-height: 140px; overflow-y: auto; }
  .cs-controls.dark { background: #222; border-color: #333; }
  .cs-toggle { border: none; background: none; cursor: pointer; font-size: 1rem; padding: 2px 6px; border-radius: 3px; color: inherit; }
  .cs-toggle:hover { background: #e0e0e0; }
  .cs-controls.dark .cs-toggle:hover { background: #444; }
  .cs-hidden { display: none; }
  .cs-slider-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; width: 100%; }
  .cs-slider-row label { font-size: 12px; min-width: 60px; color: #555; }
  .cs-slider-row input[type="range"] { flex: 1; height: 4px; }
  .cs-slider-row .cs-slider-value { font-size: 11px; min-width: 65px; text-align: right; color: #333; font-variant-numeric: tabular-nums; }
  .cs-controls.dark .cs-slider-row label { color: #aaa; }
  .cs-controls.dark .cs-slider-row .cs-slider-value { color: #ccc; }
`;

class CircuitSnippetElement extends HTMLElement {
  private runner: SimulationRunner | null = null;
  private sim: Simulator | null = null;
  private renderer: Renderer | null = null;
  private circuitData: CircuitData | null = null;
  private netlist: Netlist | null = null;
  private observer: IntersectionObserver | null = null;
  private controlsEl: HTMLElement | null = null;
  private autoStart = true;
  private pendingSliders: AddSliderOptions[] = [];
  private initialized = false;

  connectedCallback() {
    this.init();
  }

  disconnectedCallback() {
    this.runner?.stop();
    this.observer?.disconnect();
  }

  // --- Public API ---

  start(): void {
    this.runner?.start();
  }

  stop(): void {
    this.runner?.stop();
  }

  setComponentValue(ref: string, param: string, value: number): void {
    if (!this.netlist || !this.sim) return;
    const idx = resolveComponentRef(ref, this.netlist);
    if (idx !== null) {
      this.sim.setComponentValue(idx, param, value);
      this.renderer?.render();
    }
  }

  getNodeVoltage(nodeIndex: number): number {
    return this.sim?.getNodeVoltages()[nodeIndex] ?? 0;
  }

  getTime(): number {
    return this.sim?.time ?? 0;
  }

  addSlider(opts: AddSliderOptions): void {
    if (!this.initialized) {
      this.pendingSliders.push(opts);
      return;
    }
    this.createSliderInternal(opts);
  }

  // --- Internal ---

  private createSliderInternal(opts: AddSliderOptions): void {
    if (!this.sim || !this.controlsEl) return;
    const comp = this.sim.getComponent(opts.componentIndex);
    const currentValue = (comp as any)[opts.param] ?? opts.min;

    const el = createSlider({
      label: opts.label,
      min: opts.min,
      max: opts.max,
      value: currentValue,
      scale: opts.scale ?? 'linear',
      unit: opts.unit ?? '',
      onChange: (value) => {
        this.sim!.setComponentValue(opts.componentIndex, opts.param, value);
        this.renderer?.render();
      },
    });
    this.controlsEl.appendChild(el);
  }

  private autoGenerateControls(): void {
    if (!this.netlist) return;
    const comps = this.netlist.components;
    let adjustable = 0;
    for (const nc of comps) {
      if ('resistance' in nc.component || 'capacitance' in nc.component || nc.component.type === 'v' || nc.component.type === 'R') {
        adjustable++;
      }
    }
    if (adjustable > 6) return;

    const typeCounts: Record<string, number> = {};
    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i].component;
      const t = comp.type;
      typeCounts[t] = (typeCounts[t] ?? 0) + 1;
      const idx = typeCounts[t];

      if (comp.type === 'r') {
        this.pendingSliders.push({ label: `R${idx}`, componentIndex: i, param: 'resistance', min: 1, max: 1e7, scale: 'log', unit: 'Ω' });
      } else if (comp.type === 'c') {
        this.pendingSliders.push({ label: `C${idx}`, componentIndex: i, param: 'capacitance', min: 1e-12, max: 0.1, scale: 'log', unit: 'F' });
      } else if (comp.type === 'v' || comp.type === 'R') {
        this.pendingSliders.push({ label: `V${idx} freq`, componentIndex: i, param: 'frequency', min: 1, max: 100000, scale: 'log', unit: 'Hz' });
      }
    }
  }

  private async init() {
    const xml = await this.getCircuitXML();
    if (!xml) {
      console.error('circuit-snippet: no circuit data found. Use <script type="text/xml"> or src attribute.');
      return;
    }

    const shadow = this.attachShadow({ mode: 'open' });

    const width = parseInt(this.getAttribute('width') ?? '600');
    const height = parseInt(this.getAttribute('height') ?? '500');
    const layout = this.getAttribute('layout') ?? 'vertical';
    const scopeRatio = parseFloat(this.getAttribute('scope-ratio') ?? '0.4');
    const displayTime = parseFloat(this.getAttribute('display-time') ?? '0.012');
    const theme = (this.getAttribute('theme') === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
    this.autoStart = this.getAttribute('running') !== 'false';

    const showSchematic = layout !== 'scope-only';
    const showScope = layout !== 'schematic-only';
    const isHorizontal = layout === 'horizontal';

    let schematicW: number, schematicH: number, scopeW: number, scopeH: number;
    if (isHorizontal) {
      const scopePx = Math.floor(width * scopeRatio);
      schematicW = showSchematic ? width - (showScope ? scopePx : 0) : 0;
      schematicH = height;
      scopeW = showScope ? scopePx : 0;
      scopeH = height;
    } else {
      const scopePx = Math.floor(height * scopeRatio);
      schematicW = width;
      schematicH = showSchematic ? height - (showScope ? scopePx : 0) : 0;
      scopeW = width;
      scopeH = showScope ? scopePx : 0;
    }

    const style = document.createElement('style');
    style.textContent = STYLES;

    const container = document.createElement('div');
    container.className = `cs-container ${isHorizontal ? 'horizontal' : 'vertical'}${theme === 'dark' ? ' dark' : ''}`;
    container.style.width = `${width}px`;

    const schematicCanvas = document.createElement('canvas');
    schematicCanvas.width = schematicW;
    schematicCanvas.height = schematicH;
    if (!showSchematic) schematicCanvas.classList.add('cs-hidden');

    const scopeCanvas = document.createElement('canvas');
    scopeCanvas.width = scopeW;
    scopeCanvas.height = scopeH;
    if (!showScope) scopeCanvas.classList.add('cs-hidden');

    this.controlsEl = document.createElement('div');
    this.controlsEl.className = `cs-controls${theme === 'dark' ? ' dark' : ''}`;
    this.controlsEl.style.width = `${width}px`;
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'cs-toggle';
    toggleBtn.textContent = '⏸';
    this.controlsEl.appendChild(toggleBtn);

    container.appendChild(schematicCanvas);
    container.appendChild(scopeCanvas);
    shadow.appendChild(style);
    shadow.appendChild(container);
    shadow.appendChild(this.controlsEl);

    // Pipeline
    this.circuitData = parseXML(xml);
    this.netlist = buildNetlist(this.circuitData);

    if (showSchematic) {
      this.renderer = new Renderer(schematicCanvas, this.circuitData, theme);
      this.renderer.render();
    }

    if (showScope) {
      this.sim = new Simulator(this.netlist);
      const scope = new Scope(scopeCanvas, this.netlist, this.circuitData, displayTime, theme);
      this.runner = new SimulationRunner(this.sim, { scope });

      if (this.autoStart) {
        this.runner.start();
      } else {
        toggleBtn.textContent = '▶';
      }

      toggleBtn.addEventListener('click', () => {
        if (!this.runner) return;
        if (this.runner.isRunning()) {
          this.runner.stop();
          toggleBtn.textContent = '▶';
        } else {
          this.runner.start();
          toggleBtn.textContent = '⏸';
        }
      });

      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!this.runner) continue;
          if (entry.isIntersecting) {
            if (this.autoStart) {
              this.runner.start();
              toggleBtn.textContent = '⏸';
            }
          } else {
            this.runner.stop();
          }
        }
      }, { threshold: 0 });
      this.observer.observe(this);
    }

    // Parse JSON config for declarative controls
    let hasJsonConfig = false;
    const jsonEl = this.querySelector('script[type="application/json"]');
    if (jsonEl?.textContent && this.netlist) {
      try {
        const config = JSON.parse(jsonEl.textContent);
        if (Array.isArray(config.controls) && config.controls.length > 0) {
          hasJsonConfig = true;
          for (const ctrl of config.controls) {
            const idx = resolveComponentRef(ctrl.component, this.netlist);
            if (idx === null) continue;
            this.pendingSliders.push({
              label: ctrl.label ?? ctrl.component,
              componentIndex: idx,
              param: ctrl.param,
              min: ctrl.min,
              max: ctrl.max,
              scale: ctrl.scale,
              unit: ctrl.unit,
            });
          }
        }
      } catch (e) {
        console.error('circuit-snippet: invalid JSON config', e);
      }
    }

    // Auto-generate controls if no JSON config and no programmatic sliders
    if (!hasJsonConfig && this.pendingSliders.length === 0) {
      this.autoGenerateControls();
    }

    // Flush pending sliders
    this.initialized = true;
    for (const opts of this.pendingSliders) {
      this.createSliderInternal(opts);
    }
    this.pendingSliders = [];

    this.dispatchEvent(new CustomEvent('ready'));
  }

  private async getCircuitXML(): Promise<string | null> {
    const src = this.getAttribute('src');
    if (src) {
      const resp = await fetch(src);
      return resp.text();
    }
    const scriptEl = this.querySelector('script[type="text/xml"]');
    if (scriptEl?.textContent) {
      return scriptEl.textContent;
    }
    return null;
  }
}

customElements.define('circuit-snippet', CircuitSnippetElement);
