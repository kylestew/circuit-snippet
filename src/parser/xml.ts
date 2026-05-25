import type {
  Component, Resistor, Capacitor, Inductor, VoltageSource, Wire, Ground, Output, Probe, Diode, OpAmp, BJT,
  SimOptions, ScopeConfig, ScopePlot, CircuitData, BaseComponent
} from '../components/types.js';

function parseCoords(xAttr: string): { x1: number; y1: number; x2: number; y2: number } {
  const parts = xAttr.split(' ').map(Number);
  return { x1: parts[0], y1: parts[1], x2: parts[2], y2: parts[3] };
}

function num(el: Element, attr: string, fallback = 0): number {
  const v = el.getAttribute(attr);
  return v !== null ? Number(v) : fallback;
}

function parseBase(el: Element): Omit<BaseComponent, 'type'> {
  const coords = parseCoords(el.getAttribute('x') ?? '0 0 0 0');
  return { ...coords, flags: num(el, 'f') };
}

function parseResistor(el: Element): Resistor {
  return { type: 'r', ...parseBase(el), resistance: num(el, 'r', 1000) };
}

function parseCapacitor(el: Element): Capacitor {
  return {
    type: 'c', ...parseBase(el),
    capacitance: num(el, 'c', 1e-6),
    voltDiff: num(el, 'vd'),
    initialVoltage: num(el, 'iv'),
  };
}

function parseInductor(el: Element): Inductor {
  return {
    type: 'l', ...parseBase(el),
    inductance: num(el, 'l', 1e-3),
    current: num(el, 'cur'),
  };
}

function parseVoltageSource(el: Element, tag: 'v' | 'R'): VoltageSource {
  return {
    type: tag, ...parseBase(el),
    waveform: num(el, 'wf'),
    frequency: num(el, 'fr', 60),
    maxVoltage: num(el, 'maxv', 5),
    bias: num(el, 'bias'),
    phaseShift: num(el, 'phaseShift'),
    dutyCycle: num(el, 'dutyCycle', 0.5),
  };
}

function parseWire(el: Element): Wire {
  return { type: 'w', ...parseBase(el) };
}

function parseGround(el: Element): Ground {
  return { type: 'g', ...parseBase(el) };
}

function parseOutput(el: Element): Output {
  return { type: 'O', ...parseBase(el) };
}

function parseProbe(el: Element): Probe {
  return { type: 'p', ...parseBase(el) };
}

function parseDiode(el: Element): Diode {
  return {
    type: 'd', ...parseBase(el),
    saturationCurrent: num(el, 'is', 1e-14),
    emissionCoefficient: num(el, 'n', 1),
  };
}

function parseOpAmp(el: Element): OpAmp {
  const base = parseBase(el);
  const dx = base.x2 - base.x1;
  const dy = base.y2 - base.y1;
  // Inputs are offset perpendicular to the body axis at the x1,y1 end
  // Falstad convention: + input below, - input above (relative to body direction)
  const px = -dy * 0.5;
  const py = dx * 0.5;
  return {
    type: 'a', ...base,
    maxOut: num(el, 'maxo', 15),
    minOut: num(el, 'mino', -15),
    gain: num(el, 'gain', 100000),
    inputPlus: { x: base.x1 + px, y: base.y1 + py },
    inputMinus: { x: base.x1 - px, y: base.y1 - py },
  };
}

function parseBJT(el: Element): BJT {
  const base = parseBase(el);
  const pnp = num(el, 'pnp') !== 0;
  const dx = base.x2 - base.x1;
  const dy = base.y2 - base.y1;
  // Falstad BJT: x1,y1 is base side, x2,y2 is collector/emitter side
  // Collector and emitter are offset perpendicular to the body at the x2,y2 end
  const px = -dy * 0.5;
  const py = dx * 0.5;
  return {
    type: 't', ...base,
    pnp,
    beta: num(el, 'beta', 100),
    base: { x: base.x1, y: base.y1 },
    collector: { x: base.x2 + px, y: base.y2 + py },
    emitter: { x: base.x2 - px, y: base.y2 - py },
  };
}

function parseScope(el: Element): ScopeConfig {
  const plots: ScopePlot[] = [];
  for (const child of el.children) {
    if (child.tagName === 'p') {
      plots.push({
        value: num(child, 'v'),
        scale: num(child, 'sc', 1),
        elementOverride: child.hasAttribute('e') ? num(child, 'e') : undefined,
      });
    }
  }
  return {
    elementIndex: num(el, 'en'),
    speed: num(el, 'sp', 16),
    flags: el.getAttribute('f') ?? '',
    position: num(el, 'p'),
    plots,
  };
}

function parseOptions(cir: Element): SimOptions {
  return {
    timeStep: num(cir, 'ts', 5e-6),
    flags: num(cir, 'f', 1),
    voltageRange: num(cir, 'vr', 5),
    minTimeStep: num(cir, 'mts', 5e-11),
  };
}

const componentParsers: Record<string, (el: Element) => Component> = {
  r: parseResistor,
  c: parseCapacitor,
  l: parseInductor,
  v: (el) => parseVoltageSource(el, 'v'),
  R: (el) => parseVoltageSource(el, 'R'),
  w: parseWire,
  g: parseGround,
  O: parseOutput,
  p: parseProbe,
  d: parseDiode,
  a: parseOpAmp,
  t: parseBJT,
};

export function parseXML(input: string): CircuitData {
  const doc = new DOMParser().parseFromString(input, 'text/xml');
  const cir = doc.querySelector('cir');
  if (!cir) throw new Error('No <cir> root element found');

  const options = parseOptions(cir);
  const components: Component[] = [];
  const scopes: ScopeConfig[] = [];

  for (const el of cir.children) {
    const tag = el.tagName;

    if (tag === 'o') {
      scopes.push(parseScope(el));
      continue;
    }

    const parser = componentParsers[tag];
    if (parser) {
      components.push(parser(el));
    } else {
      console.warn(`Unknown element <${tag}>, skipping`);
    }
  }

  return { options, components, scopes };
}
