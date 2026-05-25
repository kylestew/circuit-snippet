import { formatSI } from '../render/format.js';

export interface SliderConfig {
  label: string;
  min: number;
  max: number;
  value: number;
  scale: 'linear' | 'log';
  unit: string;
  onChange: (value: number) => void;
}

const SLIDER_STEPS = 1000;

function toSliderPos(value: number, min: number, max: number, scale: string): number {
  if (scale === 'log') {
    return Math.round(SLIDER_STEPS * Math.log(value / min) / Math.log(max / min));
  }
  return Math.round(SLIDER_STEPS * (value - min) / (max - min));
}

function fromSliderPos(pos: number, min: number, max: number, scale: string): number {
  if (scale === 'log') {
    return min * Math.pow(max / min, pos / SLIDER_STEPS);
  }
  return min + (max - min) * pos / SLIDER_STEPS;
}

export function createSlider(config: SliderConfig): HTMLElement {
  const row = document.createElement('div');
  row.className = 'cs-slider-row';

  const label = document.createElement('label');
  label.textContent = config.label;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = String(SLIDER_STEPS);
  input.value = String(toSliderPos(config.value, config.min, config.max, config.scale));

  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'cs-slider-value';
  valueDisplay.textContent = formatSI(config.value, config.unit);

  input.addEventListener('input', () => {
    const realValue = fromSliderPos(Number(input.value), config.min, config.max, config.scale);
    valueDisplay.textContent = formatSI(realValue, config.unit);
    config.onChange(realValue);
  });

  row.appendChild(label);
  row.appendChild(input);
  row.appendChild(valueDisplay);
  return row;
}
