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

export interface Inductor extends BaseComponent {
  type: 'l';
  inductance: number;
  current: number;
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

export interface Diode extends BaseComponent {
  type: 'd';
  saturationCurrent: number;
  emissionCoefficient: number;
}

export interface OpAmp extends BaseComponent {
  type: 'a';
  maxOut: number;
  minOut: number;
  gain: number;
  inputPlus: { x: number; y: number };
  inputMinus: { x: number; y: number };
}

export interface BJT extends BaseComponent {
  type: 't';
  pnp: boolean;
  beta: number;
  // Computed input positions from Falstad geometry
  base: { x: number; y: number };
  collector: { x: number; y: number };
  emitter: { x: number; y: number };
}

export type Component = Resistor | Capacitor | Inductor | VoltageSource | Wire | Ground | Output | Probe | Diode | OpAmp | BJT;

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
