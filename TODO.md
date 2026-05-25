# Phase 0 — Proof of Concept ✅

All done: XML parser, netlist builder, MNA solver, Canvas renderer, scope with trigger, live simulation runner.

# Phase 1 — Web Component + Nonlinear Devices ✅

All done: `<circuit-snippet>` custom element, IntersectionObserver, inductor, diode (NR), op-amp (VCVS), BJT (Ebers-Moll).

---

# Phase 2 — Interactivity

Goal: readers adjust component values via sliders and see the effect in real-time on the scope.

## Step 1: Hot Component Value Updates

The simulator currently builds its internal state (capState, indState, vsIndices) from the netlist in the constructor. To change a component value at runtime, we need the simulator to pick up changes without full rebuild.

- [ ] `Simulator.setComponentValue(componentIndex, param, value)` method
  - Mutates the component object directly (e.g. `resistor.resistance = newValue`)
  - No matrix rebuild needed — stamp functions already read from component each step
  - For capacitors/inductors: changing C or L changes the companion model parameters, picked up next step automatically
  - For voltage sources: changing frequency/maxVoltage/waveform affects `waveformVoltage()` next step automatically
- [ ] `Renderer.render()` already re-reads component values for labels — re-call after value change to update schematic labels
- [ ] Test: change R in RC low-pass mid-simulation, verify cutoff shifts in scope

## Step 2: Control Bar UI

Extend the web component's shadow DOM with a control bar that holds sliders.

- [ ] **Control bar container** — `div.cs-controls` below the scope canvas
  - Already exists (has play/pause). Extend to hold slider rows.
  - Each slider row: `<label>` + `<input type="range">` + `<span>` value display
  - Scrollable if many controls (max-height with overflow-y)
- [ ] **Slider styling** — minimal, works in light/dark theme
  - Label left-aligned, value right-aligned, slider fills middle
  - Log-scale sliders: map slider position (0-1000 integer range) to log scale
  - Value display updates on input, formatted with SI prefixes

## Step 3: JSON Config Overlay

Users define which components to expose as controls via `<script type="application/json">` inside `<circuit-snippet>`.

- [ ] **Parse JSON config** in `circuit-snippet.ts` init
  - Look for `<script type="application/json">` child element
  - Parse JSON, extract `controls` array
  - Each control: `{ component: "r:0", param: "resistance", label: "R1", min: 100, max: 100000, scale: "log", unit: "Ω" }`
- [ ] **Component referencing** — resolve `"type:index"` strings
  - `"r:0"` = first resistor in CircuitData.components (counting only type matches)
  - Map to netlist component index for `Simulator.setComponentValue()`
- [ ] **Generate sliders** from config
  - For each control entry: create slider row in control bar
  - Wire `input` event → `simulator.setComponentValue()` → `renderer.render()`
  - Apply `scale: "log"` by mapping slider 0-1000 → exponential between min/max
  - Display current value with SI prefix + unit

## Step 4: Auto-Generated Controls from Falstad Elements

When no JSON config is provided, auto-detect interactive elements from the circuit.

- [ ] **Potentiometer** (`174`) — parse from Falstad XML
  - Parser: new `Potentiometer` type with position (0-1), resistance, label
  - Auto-generate slider mapped to pot position
  - Stamp as two resistors: R*pos and R*(1-pos), recalculate on slider change
- [ ] **Switch** (`s`) — parse from Falstad XML
  - Parser: new `Switch` type with position (open/closed)
  - Auto-generate toggle button
  - Stamp as very high resistance (open) or very low resistance (closed)
- [ ] **Adjustable** (`38` lines in Falstad) — respect Falstad slider definitions
  - Parse `38` elements from XML (if present) to get slider range + component binding
  - Auto-generate slider with Falstad-defined min/max

## Step 5: Layout + Theme

- [ ] **Layout attribute** already implemented in circuit-snippet.ts
  - Verify: horizontal, vertical, schematic-only, scope-only all work
  - Ensure control bar appears correctly in each layout
- [ ] **Dark theme**
  - `theme="dark"` attribute → add `.dark` class to container
  - Dark styles: `background: #1a1a1a`, canvas backgrounds `#111`, controls `#222`
  - Scope: dark grid, bright traces
  - Schematic: light component outlines on dark bg
  - Renderer + Scope need theme-aware colors (pass theme string to constructors)
- [ ] **Responsive sizing**
  - If no `width` attr: use container's `clientWidth`
  - `ResizeObserver` to re-render on container resize
  - Canvas resolution matches display size (no blurring)

## Step 6: JavaScript API

Expose public methods on `<circuit-snippet>` element for programmatic control.

- [ ] `element.start()` / `element.stop()` / `element.reset()`
- [ ] `element.setComponentValue('r:0', 'resistance', 4700)`
- [ ] `element.getNodeVoltage(nodeIndex)` / `element.getTime()`
- [ ] These delegate to internal Simulator/Runner instances

## Validation

- [ ] RC low-pass with JSON config slider for R: drag slider from 100Ω to 10kΩ, see cutoff frequency shift in real-time on scope
- [ ] RC low-pass with JSON config slider for source frequency: drag from 20Hz to 2kHz, see waveform period change
- [ ] Two sliders on same embed work independently
- [ ] `theme="dark"` renders correctly (dark background, visible traces + components)
- [ ] Slider values display with SI prefixes (4.7kΩ, 100nF, 440Hz)
- [ ] Log scale: slider midpoint = geometric mean of min/max
- [ ] No simulation glitch when changing values (smooth transition)
- [ ] JS API: `document.querySelector('circuit-snippet').setComponentValue(...)` works from console

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
