import type { VoltageSource } from '../components/types.js';

export function waveformVoltage(src: VoltageSource, t: number): number {
  const { waveform, frequency, maxVoltage, bias, phaseShift, dutyCycle } = src;
  const phase = (t * frequency + phaseShift) % 1;

  switch (waveform) {
    case 0: // DC
      return maxVoltage + bias;
    case 1: // AC (sine)
      return Math.sin(phase * 2 * Math.PI) * maxVoltage + bias;
    case 2: // Square
      return (phase < dutyCycle ? maxVoltage : -maxVoltage) + bias;
    case 3: // Triangle
      if (phase < 0.25) return maxVoltage * (phase * 4) + bias;
      if (phase < 0.75) return maxVoltage * (2 - phase * 4) + bias;
      return maxVoltage * (phase * 4 - 4) + bias;
    case 4: // Sawtooth
      return maxVoltage * (2 * phase - 1) + bias;
    case 5: // Pulse
      return (phase < dutyCycle ? maxVoltage : 0) + bias;
    case 6: // Noise
      return (Math.random() * 2 - 1) * maxVoltage + bias;
    default:
      return bias;
  }
}
