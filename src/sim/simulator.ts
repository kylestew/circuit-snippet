import type { Netlist, NetlistComponent, VoltageSource, Resistor, Capacitor, Inductor, Diode, OpAmp, InvertingSchmitt, BJT } from '../components/types.js';
import { waveformVoltage } from './waveform.js';
import { luSolve } from './lu.js';

const VT = 0.02585; // thermal voltage at 25°C
const MAX_NR_ITER = 100;
const NR_TOLERANCE = 1e-8;

export class Simulator {
  private netlist: Netlist;
  readonly dt: number;
  private size: number;
  private nodeCount: number;
  private vsCount: number;
  private vsIndices: Map<NetlistComponent, number>;
  private capState: Map<NetlistComponent, number>;
  private indState: Map<NetlistComponent, number>;
  private schmittState: Map<NetlistComponent, boolean>;
  private nodeVoltages: Float64Array;
  private hasNonlinear: boolean;
  time: number;

  constructor(netlist: Netlist) {
    this.netlist = netlist;
    this.dt = netlist.options.timeStep;
    this.time = 0;
    this.nodeCount = netlist.nodes.length;

    this.vsIndices = new Map();
    let vsIdx = 0;
    for (const nc of netlist.components) {
      if (nc.component.type === 'v' || nc.component.type === 'R' || nc.component.type === 'a' || nc.component.type === 'schmitt') {
        this.vsIndices.set(nc, vsIdx++);
      }
    }
    this.vsCount = vsIdx;

    this.size = (this.nodeCount - 1) + this.vsCount;

    this.capState = new Map();
    for (const nc of netlist.components) {
      if (nc.component.type === 'c') {
        this.capState.set(nc, (nc.component as Capacitor).voltDiff);
      }
    }

    this.indState = new Map();
    for (const nc of netlist.components) {
      if (nc.component.type === 'l') {
        this.indState.set(nc, (nc.component as Inductor).current);
      }
    }

    this.schmittState = new Map();
    for (const nc of netlist.components) {
      if (nc.component.type === 'schmitt') {
        const schmitt = nc.component as InvertingSchmitt;
        this.schmittState.set(nc, schmitt.highVoltage >= schmitt.lowVoltage);
      }
    }

    this.hasNonlinear = netlist.components.some(nc =>
      nc.component.type === 'd' || nc.component.type === 'a' || nc.component.type === 't'
    );

    this.nodeVoltages = new Float64Array(this.nodeCount);
  }

  private mi(nodeId: number): number {
    return nodeId - 1;
  }

  private stampConductance(A: Float64Array[], i: number, j: number, g: number): void {
    if (i >= 0) A[i][i] += g;
    if (j >= 0) A[j][j] += g;
    if (i >= 0 && j >= 0) {
      A[i][j] -= g;
      A[j][i] -= g;
    }
  }

  private stampResistor(A: Float64Array[], nc: NetlistComponent): void {
    const g = 1 / (nc.component as Resistor).resistance;
    this.stampConductance(A, this.mi(nc.nodes[0]), this.mi(nc.nodes[1]), g);
  }

  private stampVoltageSource(A: Float64Array[], z: Float64Array, nc: NetlistComponent, time: number): void {
    const src = nc.component as VoltageSource;
    const v = waveformVoltage(src, time);
    const i = this.mi(nc.nodes[0]);
    const j = this.mi(nc.nodes[1]);
    const k = (this.nodeCount - 1) + this.vsIndices.get(nc)!;

    if (i >= 0) { A[i][k] += 1; A[k][i] += 1; }
    if (j >= 0) { A[j][k] -= 1; A[k][j] -= 1; }
    z[k] = v;
  }

  private stampCapacitor(A: Float64Array[], z: Float64Array, nc: NetlistComponent): void {
    const cap = nc.component as Capacitor;
    const geq = cap.capacitance / this.dt;
    const vPrev = this.capState.get(nc)!;
    const ieq = geq * vPrev;
    const i = this.mi(nc.nodes[0]);
    const j = this.mi(nc.nodes[1]);

    this.stampConductance(A, i, j, geq);
    if (i >= 0) z[i] += ieq;
    if (j >= 0) z[j] -= ieq;
  }

  private stampInductor(A: Float64Array[], z: Float64Array, nc: NetlistComponent): void {
    const ind = nc.component as Inductor;
    const geq = this.dt / ind.inductance;
    const iPrev = this.indState.get(nc)!;
    const i = this.mi(nc.nodes[0]);
    const j = this.mi(nc.nodes[1]);

    this.stampConductance(A, i, j, geq);
    if (i >= 0) z[i] -= iPrev;
    if (j >= 0) z[j] += iPrev;
  }

  private limitDiodeVoltage(vnew: number, vold: number): number {
    const nVt = VT;
    if (vnew > vold + 10 * nVt) {
      vnew = vold + 10 * nVt;
    } else if (vnew < -5) {
      vnew = -5;
    }
    return vnew;
  }

  private stampDiode(A: Float64Array[], z: Float64Array, nc: NetlistComponent): void {
    const diode = nc.component as Diode;
    const Is = diode.saturationCurrent;
    const n = diode.emissionCoefficient;
    const nVt = n * VT;

    const i = this.mi(nc.nodes[0]);
    const j = this.mi(nc.nodes[1]);

    // Get current voltage across diode
    const v1 = nc.nodes[0] === 0 ? 0 : this.nodeVoltages[nc.nodes[0]];
    const v2 = nc.nodes[1] === 0 ? 0 : this.nodeVoltages[nc.nodes[1]];
    let vd = v1 - v2;
    vd = this.limitDiodeVoltage(vd, vd);

    const expTerm = Math.exp(Math.min(vd / nVt, 40));
    const id = Is * (expTerm - 1);
    const geq = (Is / nVt) * expTerm + 1e-12;
    const ieq = id - geq * vd;

    this.stampConductance(A, i, j, geq);
    if (i >= 0) z[i] -= ieq;
    if (j >= 0) z[j] += ieq;
  }

  private stampOpAmp(A: Float64Array[], z: Float64Array, nc: NetlistComponent): void {
    const oa = nc.component as OpAmp;
    const [nPlus, nMinus, nOut] = nc.nodes;
    const iP = this.mi(nPlus);
    const iM = this.mi(nMinus);
    const iO = this.mi(nOut);
    const k = (this.nodeCount - 1) + this.vsIndices.get(nc)!;

    // Get differential input voltage
    const vPlus = nPlus === 0 ? 0 : this.nodeVoltages[nPlus];
    const vMinus = nMinus === 0 ? 0 : this.nodeVoltages[nMinus];
    const vDiff = vPlus - vMinus;
    const vDesired = vDiff * oa.gain;

    // Clamp to rails
    const vOut = Math.max(oa.minOut, Math.min(oa.maxOut, vDesired));

    // Stamp as voltage source at output
    if (iO >= 0) { A[iO][k] += 1; A[k][iO] += 1; }
    z[k] = vOut;

    // If not clipping, stamp gain relationship: Vout = gain*(V+ - V-)
    // which is: Vout - gain*V+ + gain*V- = 0
    if (vDesired >= oa.minOut && vDesired <= oa.maxOut) {
      if (iP >= 0) A[k][iP] -= oa.gain;
      if (iM >= 0) A[k][iM] += oa.gain;
      z[k] = 0;
    }
  }

  private updateSchmittStates(): void {
    for (const nc of this.netlist.components) {
      if (nc.component.type !== 'schmitt') continue;
      const schmitt = nc.component as InvertingSchmitt;
      const nIn = nc.nodes[0];
      const vIn = nIn === 0 ? 0 : this.nodeVoltages[nIn];
      let isHigh = this.schmittState.get(nc) ?? true;
      if (isHigh && vIn > schmitt.upperTrigger) {
        isHigh = false;
      } else if (!isHigh && vIn < schmitt.lowerTrigger) {
        isHigh = true;
      }
      this.schmittState.set(nc, isHigh);
    }
  }

  private stampInvertingSchmitt(A: Float64Array[], z: Float64Array, nc: NetlistComponent): void {
    const schmitt = nc.component as InvertingSchmitt;
    const [, nOut] = nc.nodes;
    const iO = this.mi(nOut);
    const k = (this.nodeCount - 1) + this.vsIndices.get(nc)!;
    const isHigh = this.schmittState.get(nc) ?? true;

    if (iO >= 0) {
      A[iO][k] += 1;
      A[k][iO] += 1;
    }
    z[k] = isHigh ? schmitt.highVoltage : schmitt.lowVoltage;
  }

  private diodeI(vd: number): { i: number; geq: number } {
    const vClamped = Math.min(vd, 40 * VT);
    const expTerm = Math.exp(vClamped / VT);
    const Is = 1e-14;
    const i = Is * (expTerm - 1);
    const geq = (Is / VT) * expTerm + 1e-12;
    return { i, geq };
  }

  private stampBJT(A: Float64Array[], z: Float64Array, nc: NetlistComponent): void {
    const bjt = nc.component as BJT;
    const [nBase, nCollector, nEmitter] = nc.nodes;
    const iB = this.mi(nBase);
    const iC = this.mi(nCollector);
    const iE = this.mi(nEmitter);
    const polarity = bjt.pnp ? -1 : 1;

    const vB = nBase === 0 ? 0 : this.nodeVoltages[nBase];
    const vC = nCollector === 0 ? 0 : this.nodeVoltages[nCollector];
    const vE = nEmitter === 0 ? 0 : this.nodeVoltages[nEmitter];

    const vBE = polarity * (vB - vE);
    const vBC = polarity * (vB - vC);

    const be = this.diodeI(vBE);
    const bc = this.diodeI(vBC);

    const bf = bjt.beta;
    const br = 1;

    // Ebers-Moll: Ic = bf/(bf+1)*Ibe - (br+1)/(br+1)*Ibc = bf/(bf+1)*Ibe - Ibc
    // Ie = -(bf+1)/(bf+1)*Ibe + br/(br+1)*Ibc = -Ibe + br/(br+1)*Ibc
    // Simplified: stamp BE junction and BC junction diodes, then add current gain

    // BE junction: stamp between B and E
    const gBE = be.geq;
    const iBE = be.i - gBE * vBE;

    // BC junction: stamp between B and C
    const gBC = bc.geq;
    const iBC = bc.i - gBC * vBC;

    // BE junction conductance (between base and emitter)
    this.stampConductance(A, iB, iE, gBE * polarity * polarity);

    // BC junction conductance (between base and collector)
    this.stampConductance(A, iB, iC, gBC * polarity * polarity);

    // BE junction current source
    const iBEsrc = iBE * polarity;
    if (iB >= 0) z[iB] -= iBEsrc;
    if (iE >= 0) z[iE] += iBEsrc;

    // BC junction current source
    const iBCsrc = iBC * polarity;
    if (iB >= 0) z[iB] -= iBCsrc;
    if (iC >= 0) z[iC] += iBCsrc;

    // Current gain: collector current = beta * base current from BE junction
    // Model as VCCS: Ic_gain = (beta/(beta+1)) * gBE * Vbe
    const gmf = bf / (bf + 1) * gBE;
    const gmr = br / (br + 1) * gBC;

    // Forward gain: current from C to E controlled by Vbe
    if (iC >= 0 && iB >= 0) A[iC][iB] += gmf * polarity;
    if (iC >= 0 && iE >= 0) A[iC][iE] -= gmf * polarity;
    if (iE >= 0 && iB >= 0) A[iE][iB] -= gmf * polarity;
    if (iE >= 0 && iE >= 0) A[iE][iE] += gmf * polarity;

    // Reverse gain: current from E to C controlled by Vbc
    if (iE >= 0 && iB >= 0) A[iE][iB] += gmr * polarity;
    if (iE >= 0 && iC >= 0) A[iE][iC] -= gmr * polarity;
    if (iC >= 0 && iB >= 0) A[iC][iB] -= gmr * polarity;
    if (iC >= 0 && iC >= 0) A[iC][iC] += gmr * polarity;

    // Current source from gain
    const icf = bf / (bf + 1) * iBE * polarity;
    const icr = br / (br + 1) * iBC * polarity;
    if (iC >= 0) z[iC] -= icf;
    if (iE >= 0) z[iE] += icf;
    if (iE >= 0) z[iE] -= icr;
    if (iC >= 0) z[iC] += icr;
  }

  step(): Float64Array {
    const n = this.size;
    const maxIter = this.hasNonlinear ? MAX_NR_ITER : 1;

    this.updateSchmittStates();

    for (let iter = 0; iter < maxIter; iter++) {
      const A: Float64Array[] = [];
      for (let i = 0; i < n; i++) {
        A.push(new Float64Array(n));
      }
      const z = new Float64Array(n);

      for (const nc of this.netlist.components) {
        switch (nc.component.type) {
          case 'r': this.stampResistor(A, nc); break;
          case 'v': case 'R': this.stampVoltageSource(A, z, nc, this.time); break;
          case 'c': this.stampCapacitor(A, z, nc); break;
          case 'l': this.stampInductor(A, z, nc); break;
          case 'd': this.stampDiode(A, z, nc); break;
          case 'a': this.stampOpAmp(A, z, nc); break;
          case 'schmitt': this.stampInvertingSchmitt(A, z, nc); break;
          case 't': this.stampBJT(A, z, nc); break;
        }
      }

      const x = luSolve(A, z);

      const prevVoltages = new Float64Array(this.nodeVoltages);
      this.nodeVoltages[0] = 0;
      for (let i = 1; i < this.nodeCount; i++) {
        this.nodeVoltages[i] = x[i - 1];
      }

      // Convergence check
      if (this.hasNonlinear && iter > 0) {
        let maxDiff = 0;
        for (let i = 1; i < this.nodeCount; i++) {
          maxDiff = Math.max(maxDiff, Math.abs(this.nodeVoltages[i] - prevVoltages[i]));
        }
        if (maxDiff < NR_TOLERANCE) break;
      }
    }

    // Update reactive component state
    for (const nc of this.netlist.components) {
      if (nc.component.type === 'c') {
        const v1 = this.nodeVoltages[nc.nodes[0]];
        const v2 = this.nodeVoltages[nc.nodes[1]];
        this.capState.set(nc, v1 - v2);
      }
      if (nc.component.type === 'l') {
        const ind = nc.component as Inductor;
        const v1 = this.nodeVoltages[nc.nodes[0]];
        const v2 = this.nodeVoltages[nc.nodes[1]];
        const geq = this.dt / ind.inductance;
        this.indState.set(nc, this.indState.get(nc)! + (v1 - v2) * geq);
      }
    }

    this.time += this.dt;
    return this.nodeVoltages;
  }

  run(steps: number): { time: number[]; voltages: number[][] } {
    const times: number[] = [];
    const voltages: number[][] = [];
    for (let i = 0; i < steps; i++) {
      const v = this.step();
      times.push(this.time);
      voltages.push(Array.from(v));
    }
    return { time: times, voltages };
  }

  getNodeVoltages(): Float64Array {
    return this.nodeVoltages;
  }

  setComponentValue(netlistIndex: number, param: string, value: number): void {
    (this.netlist.components[netlistIndex].component as any)[param] = value;
  }

  getComponent(netlistIndex: number) {
    return this.netlist.components[netlistIndex].component;
  }

  getNetlist() {
    return this.netlist;
  }
}
