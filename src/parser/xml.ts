import type {
  Component, Resistor, Capacitor, Inductor, VoltageSource, Wire, Ground, Output, Probe,
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
