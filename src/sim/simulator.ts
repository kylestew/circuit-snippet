import type { Netlist, NetlistComponent, VoltageSource, Resistor, Capacitor } from '../components/types.js';
import { waveformVoltage } from './waveform.js';
import { luSolve } from './lu.js';

export class Simulator {
  private netlist: Netlist;
  readonly dt: number;
  private size: number; // matrix dimension = (nodeCount - 1) + voltageSourceCount
  private nodeCount: number;
  private vsCount: number;
  private vsIndices: Map<NetlistComponent, number>; // voltage source → extra variable index
  private capState: Map<NetlistComponent, number>; // capacitor → previous voltage across it
  private nodeVoltages: Float64Array;
  time: number;

  constructor(netlist: Netlist) {
    this.netlist = netlist;
    this.dt = netlist.options.timeStep;
    this.time = 0;
    this.nodeCount = netlist.nodes.length;

    // Count voltage sources, assign extra variable indices
    this.vsIndices = new Map();
    let vsIdx = 0;
    for (const nc of netlist.components) {
      if (nc.component.type === 'v' || nc.component.type === 'R') {
        this.vsIndices.set(nc, vsIdx++);
      }
    }
    this.vsCount = vsIdx;

    // Matrix size: (N-1) node voltages + M branch currents
    this.size = (this.nodeCount - 1) + this.vsCount;

    // Capacitor state
    this.capState = new Map();
    for (const nc of netlist.components) {
      if (nc.component.type === 'c') {
        this.capState.set(nc, (nc.component as Capacitor).voltDiff);
      }
    }

    this.nodeVoltages = new Float64Array(this.nodeCount);
  }

  // Map netlist node ID to matrix index. Node 0 (ground) returns -1.
  private mi(nodeId: number): number {
    return nodeId - 1;
  }

  private stampResistor(A: Float64Array[], nc: NetlistComponent): void {
    const r = (nc.component as Resistor).resistance;
    const g = 1 / r;
    const [n1, n2] = nc.nodes;
    const i = this.mi(n1);
    const j = this.mi(n2);

    if (i >= 0) A[i][i] += g;
    if (j >= 0) A[j][j] += g;
    if (i >= 0 && j >= 0) {
      A[i][j] -= g;
      A[j][i] -= g;
    }
  }

  private stampVoltageSource(A: Float64Array[], z: Float64Array, nc: NetlistComponent, time: number): void {
    const src = nc.component as VoltageSource;
    const v = waveformVoltage(src, time);
    const [n1, n2] = nc.nodes; // n1 = +, n2 = -
    const i = this.mi(n1);
    const j = this.mi(n2);
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
    const [n1, n2] = nc.nodes;
    const i = this.mi(n1);
    const j = this.mi(n2);

    // Stamp equivalent conductance (same as resistor)
    if (i >= 0) A[i][i] += geq;
    if (j >= 0) A[j][j] += geq;
    if (i >= 0 && j >= 0) {
      A[i][j] -= geq;
      A[j][i] -= geq;
    }

    // Stamp equivalent current source
    if (i >= 0) z[i] += ieq;
    if (j >= 0) z[j] -= ieq;
  }

  step(): Float64Array {
    const n = this.size;

    // Allocate matrix and vector
    const A: Float64Array[] = [];
    for (let i = 0; i < n; i++) {
      A.push(new Float64Array(n));
    }
    const z = new Float64Array(n);

    // Stamp all components
    for (const nc of this.netlist.components) {
      switch (nc.component.type) {
        case 'r': this.stampResistor(A, nc); break;
        case 'v': case 'R': this.stampVoltageSource(A, z, nc, this.time); break;
        case 'c': this.stampCapacitor(A, z, nc); break;
      }
    }

    // Solve
    const x = luSolve(A, z);

    // Update node voltages (node 0 = ground = 0V)
    this.nodeVoltages[0] = 0;
    for (let i = 1; i < this.nodeCount; i++) {
      this.nodeVoltages[i] = x[i - 1];
    }

    // Update capacitor state
    for (const nc of this.netlist.components) {
      if (nc.component.type === 'c') {
        const v1 = this.nodeVoltages[nc.nodes[0]];
        const v2 = this.nodeVoltages[nc.nodes[1]];
        this.capState.set(nc, v1 - v2);
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
}
