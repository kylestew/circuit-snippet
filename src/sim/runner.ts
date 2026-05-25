import { Simulator } from './simulator.js';
import type { Scope } from '../scope/scope.js';

interface RunnerOptions {
  scope: Scope;
  windowSize?: number;
}

export class SimulationRunner {
  private sim: Simulator;
  private scope: Scope;
  private windowSize: number;
  private window: { time: number[]; voltages: number[][] };
  private rafId: number | null = null;
  private running = false;

  constructor(sim: Simulator, opts: RunnerOptions) {
    this.sim = sim;
    this.scope = opts.scope;
    const minWindowSize = this.scope.getRecommendedWindowSize(this.sim.dt);
    this.windowSize = Math.max(opts.windowSize ?? 8000, minWindowSize);
    this.window = { time: [], voltages: [] };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private tick = (): void => {
    if (!this.running) return;

    const stepsPerFrame = Math.min(
      Math.round((1 / 60) / this.sim.dt),
      5000
    );

    for (let i = 0; i < stepsPerFrame; i++) {
      const v = this.sim.step();
      this.window.time.push(this.sim.time);
      this.window.voltages.push(Array.from(v));
    }

    // Trim to window size
    const excess = this.window.time.length - this.windowSize;
    if (excess > 0) {
      this.window.time.splice(0, excess);
      this.window.voltages.splice(0, excess);
    }

    this.scope.plot(this.window);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
