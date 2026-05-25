export interface BaseComponent {
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flags: number;
}

export interface Resistor extends BaseComponent {
  type: 'r';
  resistance: number;
}

export interface Capacitor extends BaseComponent {
  type: 'c';
  capacitance: number;
  voltDiff: number;
  initialVoltage: number;
}

export interface VoltageSource extends BaseComponent {
  type: 'v' | 'R';
  waveform: number;
  frequency: number;
  maxVoltage: number;
  bias: number;
  phaseShift: number;
  dutyCycle: number;
}

export interface Wire extends BaseComponent {
  type: 'w';
}

export interface Ground extends BaseComponent {
  type: 'g';
}

export interface Output extends BaseComponent {
  type: 'O';
}

export interface Probe extends BaseComponent {
  type: 'p';
}

export type Component = Resistor | Capacitor | VoltageSource | Wire | Ground | Output | Probe;

export interface SimOptions {
  timeStep: number;
  flags: number;
  voltageRange: number;
  minTimeStep: number;
}

export interface ScopePlot {
  value: number;
  scale: number;
  elementOverride?: number;
}

export interface ScopeConfig {
  elementIndex: number;
  speed: number;
  flags: string;
  position: number;
  plots: ScopePlot[];
}

export interface CircuitData {
  options: SimOptions;
  components: Component[];
  scopes: ScopeConfig[];
}

export interface NetlistNode {
  id: number;
  coords: Array<{ x: number; y: number }>;
}

export interface NetlistComponent {
  component: Component;
  nodes: number[];
}

export interface Netlist {
  nodes: NetlistNode[];
  components: NetlistComponent[];
  scopes: ScopeConfig[];
  options: SimOptions;
}
