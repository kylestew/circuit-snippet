# Phase 0 — Proof of Concept ✅

All done: XML parser, netlist builder, MNA solver, Canvas renderer, scope with trigger, live simulation runner.

---

# Phase 1 — Web Component + Nonlinear Devices

Goal: `<circuit-snippet>` custom element that works with a `<script>` tag. Add nonlinear components for real synth circuits.

## Web Component

- [ ] `<circuit-snippet>` custom element registration
  - [ ] Parse `<cir>` from innerHTML or `src` attribute (fetch XML file)
  - [ ] Create internal canvases (schematic + scope) in shadow DOM
  - [ ] Auto-run: parse → netlist → simulator → renderer → scope → runner on connectedCallback
  - [ ] Attributes: `width`, `height`, `layout` (horizontal/vertical/schematic-only/scope-only), `scope-ratio`, `running`, `theme`
- [ ] Multiple instances on one page (each has own simulator + runner)
- [ ] IntersectionObserver: pause sim when embed not visible
- [ ] Play/pause/reset controls (minimal control bar)

## Inductor

- [ ] Parser: `<l>` tag, inductance from `l` attr
- [ ] Type: `Inductor` interface
- [ ] Simulator: companion model `R_eq = L/dt`, current source from previous state
- [ ] Renderer: loopy coil symbol
- [ ] Test: RL circuit

## Diode

- [ ] Parser: `<d>` tag, model name from attrs
- [ ] Type: `Diode` interface
- [ ] Simulator: Shockley equation `I = Is(e^(V/nVt) - 1)`, Newton-Raphson linearization
- [ ] Newton-Raphson iteration loop in `step()` (converge within timestep)
- [ ] Renderer: triangle + bar symbol
- [ ] Test: diode clipper circuit

## Op-Amp

- [ ] Parser: `<a>` tag, maxOut/minOut/gbw from attrs
- [ ] Type: `OpAmp` interface
- [ ] Simulator: ideal model — VCVS with very high gain, output clipping at rails
- [ ] Renderer: triangle with +/− inputs (3-terminal drawing)
- [ ] Test: inverting amplifier, op-amp integrator

## BJT

- [ ] Parser: `<t>` tag, pnp flag, beta, model name
- [ ] Type: `BJT` interface
- [ ] Simulator: Ebers-Moll model, two diode junctions + current gain
- [ ] Renderer: circle with emitter arrow (NPN/PNP)
- [ ] Test: common-emitter amplifier

## Validation

- [ ] Diode clipper: output clipped at ~0.7V, visible in scope
- [ ] Op-amp inverting amp: gain = -Rf/Ri, correct output amplitude
- [ ] Multiple `<circuit-snippet>` elements on one page, each independent
- [ ] Embed pauses when scrolled off-screen, resumes when visible

---

# Phase 2 — Interactivity

Goal: readers can adjust component values and see the effect in real-time.

## Controls

- [ ] Potentiometer (`174`): auto-generate slider from Falstad pot elements
- [ ] Switch (`s`): auto-generate toggle button
- [ ] Adjustable components (`38` lines): respect Falstad slider definitions
- [ ] JSON config overlay for custom controls (component ref, param, min/max/scale/label)
- [ ] Control bar UI: sliders below scope, play/pause/reset/speed

## Component Value Adjustment

- [ ] `snippet.setComponentValue('r:0', 'resistance', 4700)` JS API
- [ ] Slider drag → update component → re-stamp matrix (hot update without rebuild)
- [ ] Log-scale sliders for resistance/frequency

## Layout + Theme

- [ ] `layout` attribute: horizontal, vertical, schematic-only, scope-only
- [ ] `theme` attribute: light (default), dark
- [ ] Responsive: fit within container width

## Validation

- [ ] RC filter with adjustable R: drag slider, cutoff frequency changes visibly in scope
- [ ] Potentiometer in Falstad export auto-generates working slider
- [ ] Dark theme looks good

---

# Phase 3 — Audio + Advanced Components

Goal: hear circuits through speakers. Full component set for synth curriculum.

## Audio Output

- [ ] `audio` attribute enables Web Audio
- [ ] AudioWorkletNode fed from designated probe/output node
- [ ] Sample rate conversion: sim timestep → 48kHz
- [ ] Volume normalization
- [ ] Requires user click to start (autoplay policy)

## Additional Components

- [ ] JFET (`j`): Shichman-Hodges model, symbol
- [ ] MOSFET (`f`): Level 1 model, symbol
- [ ] Comparator (`401`): rail-to-rail output, symbol
- [ ] OTA (`402`): gm × (V+ − V−) VCCS, symbol
- [ ] Analog switch (`159`): voltage-controlled on/off
- [ ] 555 Timer (`165`): behavioral model
- [ ] Polarized capacitor (`209`): curved plate symbol
- [ ] Labeled node (`207`): named connection points
- [ ] Current source (`i`): stamp, circle-with-arrow symbol

## Scope Enhancements

- [ ] FFT mode toggle per trace
- [ ] Current flow animation (moving dots on wires)
- [ ] Multiple scope panes

## Distribution

- [ ] esbuild bundler: single `circuit-snippet.js` IIFE bundle
- [ ] ESM build for bundlers
- [ ] npm publish
- [ ] CDN (unpkg/jsdelivr)

## Validation

- [ ] Hear a VCO oscillator output through speakers
- [ ] State-variable filter with adjustable cutoff: audible sweep
- [ ] OTA-based VCA: amplitude responds to control voltage

---

# Phase 4 — Editor

Goal: visual tool for content creators to configure embeds.

- [ ] Separate editor app/page
- [ ] Paste Falstad XML → preview embed
- [ ] Click nodes to assign scope traces
- [ ] Click components to expose as sliders
- [ ] Configure layout, theme, display time, title
- [ ] Export: copy-paste `<circuit-snippet>` HTML snippet
- [ ] Live preview updates as you configure
