import { parseXML } from './parser/xml.js';
import { buildNetlist } from './parser/netlist.js';
import { Simulator } from './sim/simulator.js';
import { SimulationRunner } from './sim/runner.js';
import { Renderer } from './render/renderer.js';
import { Scope } from './scope/scope.js';

const STYLES = `
  :host { display: block; }
  .cs-container { display: flex; gap: 0; overflow: hidden; background: #fff; border: 1px solid #ddd; border-radius: 4px; }
  .cs-container.vertical { flex-direction: column; }
  .cs-container.horizontal { flex-direction: row; }
  canvas { display: block; }
  .cs-controls { display: flex; gap: 0.5rem; padding: 4px 8px; background: #f5f5f5; border-top: 1px solid #ddd; align-items: center; }
  .cs-toggle { border: none; background: none; cursor: pointer; font-size: 1rem; padding: 2px 6px; border-radius: 3px; }
  .cs-toggle:hover { background: #e0e0e0; }
  .cs-hidden { display: none; }
`;

class CircuitSnippetElement extends HTMLElement {
  private runner: SimulationRunner | null = null;
  private observer: IntersectionObserver | null = null;
  private autoStart = true;

  connectedCallback() {
    this.init();
  }

  disconnectedCallback() {
    this.runner?.stop();
    this.observer?.disconnect();
  }

  private async init() {
    const xml = await this.getCircuitXML();
    if (!xml) {
      console.error('circuit-snippet: no circuit data found. Use innerHTML <cir> or src attribute.');
      return;
    }

    const shadow = this.attachShadow({ mode: 'open' });

    const width = parseInt(this.getAttribute('width') ?? '600');
    const height = parseInt(this.getAttribute('height') ?? '500');
    const layout = this.getAttribute('layout') ?? 'vertical';
    const scopeRatio = parseFloat(this.getAttribute('scope-ratio') ?? '0.4');
    const displayTime = parseFloat(this.getAttribute('display-time') ?? '0.012');
    const theme = this.getAttribute('theme') ?? 'light';
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
    container.className = `cs-container ${isHorizontal ? 'horizontal' : 'vertical'}`;
    container.style.width = `${width}px`;

    const schematicCanvas = document.createElement('canvas');
    schematicCanvas.width = schematicW;
    schematicCanvas.height = schematicH;
    if (!showSchematic) schematicCanvas.classList.add('cs-hidden');

    const scopeCanvas = document.createElement('canvas');
    scopeCanvas.width = scopeW;
    scopeCanvas.height = scopeH;
    if (!showScope) scopeCanvas.classList.add('cs-hidden');

    const controls = document.createElement('div');
    controls.className = 'cs-controls';
    controls.style.width = `${width}px`;
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'cs-toggle';
    toggleBtn.textContent = '⏸';
    controls.appendChild(toggleBtn);

    container.appendChild(schematicCanvas);
    container.appendChild(scopeCanvas);
    shadow.appendChild(style);
    shadow.appendChild(container);
    shadow.appendChild(controls);

    // Pipeline
    const circuitData = parseXML(xml);
    const netlist = buildNetlist(circuitData);

    if (showSchematic) {
      const renderer = new Renderer(schematicCanvas, circuitData);
      renderer.render();
    }

    if (showScope) {
      const sim = new Simulator(netlist);
      const scope = new Scope(scopeCanvas, netlist, circuitData, displayTime);
      this.runner = new SimulationRunner(sim, { scope });

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

      // Pause when off-screen
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
  }

  private async getCircuitXML(): Promise<string | null> {
    const src = this.getAttribute('src');
    if (src) {
      const resp = await fetch(src);
      return resp.text();
    }
    // Look for <script type="text/xml"> — browser preserves XML content verbatim
    const scriptEl = this.querySelector('script[type="text/xml"]');
    if (scriptEl?.textContent) {
      return scriptEl.textContent;
    }
    return null;
  }
}

customElements.define('circuit-snippet', CircuitSnippetElement);
