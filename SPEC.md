# Circuit Snippet — Spec

Embeddable analog circuit simulator for teaching modular synthesis. Lightweight alternative to Falstad's CircuitJS1, purpose-built for embedding multiple instances on a page. Reads Falstad's text export format directly.

---

## Goals

1. **Embed anywhere** — `<script>` tag + declarative markup, no iframe, no build step required
2. **Falstad-compatible** — parse Falstad "save to text" exports (subset of components relevant to analog audio)
3. **Interactive teaching** — expose controls (potentiometers, source parameters) and show live waveforms
4. **Lightweight** — small bundle, multiple instances per page without perf degradation
5. **Audio-focused** — component set and defaults tuned for modular synthesis education

## Non-Goals (for now)

- Full Falstad feature parity (digital logic, power electronics, etc.)
- Circuit editor (Phase 3 — use Falstad as editor, export text)
- SPICE-level model accuracy
- Mobile touch editing

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Embed API                       │
│  <circuit-snippet> web component                 │
├──────────┬──────────┬──────────┬────────────────┤
│  Parser  │ Renderer │  Scope   │   Controls     │
│ (Falstad │ (Canvas  │ (Canvas  │  (DOM sliders, │
│  format) │  2D)     │  2D)     │   buttons)     │
├──────────┴──────────┴──────────┴────────────────┤
│              Simulation Engine                   │
│  MNA solver · Newton-Raphson · Transient analysis│
├─────────────────────────────────────────────────┤
│              Component Models                    │
│  R · C · L · Diode · BJT · JFET · MOSFET ·     │
│  OpAmp · OTA · Sources · Switch · Pot           │
└─────────────────────────────────────────────────┘
```

### Core Modules

| Module        | Responsibility                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Parser**    | Reads Falstad text format → internal netlist. Handles `$` header, component lines, `o` scope lines, `38` slider definitions               |
| **Netlist**   | Internal circuit representation: nodes, components, connections. Topology extraction from Falstad coordinate-based connections            |
| **Simulator** | MNA matrix assembly, LU decomposition, Newton-Raphson iteration for nonlinear devices. Transient analysis with backward Euler integration |
| **Renderer**  | Canvas 2D schematic drawing. Component symbols, wire routing, node voltage coloring, current animation dots                               |
| **Scope**     | Oscilloscope display. Time-domain waveforms, optional FFT, trigger, multiple traces                                                       |
| **Controls**  | DOM-based UI overlays. Sliders for potentiometers, value displays, play/pause, speed                                                      |
| **Audio**     | Web Audio API output. ScriptProcessorNode/AudioWorklet fed from simulation                                                                |

---

## Falstad Format Compatibility

### Format

Falstad's live site now exports **XML**. The older space-delimited text format (visible in the public GitHub repo, last updated Nov 2022) is not supported — the deployed version has diverged from the open-source repo.

We parse **XML only** — what the current live site exports via "Export as Text" / "Save as File".

### XML Format (Current Falstad Export)

Root element `<cir>` with simulation options as attributes. Each component is a self-closing child element whose tag name matches the component type code.

```xml
<cir f="1" ts="0.000005" ic="10.20027730826997" cb="50" pb="50" vr="5" mts="5e-11">
  <v x="96 176 96 272" f="0" wf="2" fr="100" maxv="2"/>
  <g x="96 272 96 288" f="0"/>
  <w x="96 176 192 176" f="0"/>
  <r x="192 176 320 176" f="0" r="100"/>
  <c x="320 176 320 272" f="0" c="0.00001" iv="0.001" sr="0" vd="1.971..."/>
  <O x="416 176 480 176" f="0" sc="0"/>
  <o en="2" sp="16" f="x3" p="0">
    <p v="0" sc="5"/>
    <p v="3" sc="0.05"/>
    <p e="6" v="0" sc="5"/>
  </o>
</cir>
```

#### `<cir>` Root Attributes (Simulation Options)

| Attr | Meaning | Example |
|------|---------|---------|
| `f` | Flags (bitfield: 1=dots, 2=smallGrid, 4=hideVolts, 8=power, 16=hideValues, 64=adjustTimestep) | `1` |
| `ts` | Max timestep (seconds) | `0.000005` |
| `ic` | Iteration count (log-scale) | `10.200...` |
| `cb` | Current bar slider value | `50` |
| `pb` | Power bar slider value | `50` |
| `vr` | Voltage display range | `5` |
| `mts` | Min timestep (seconds) | `5e-11` |

#### Common Element Attributes

| Attr | Meaning | Used By |
|------|---------|---------|
| `x` | Coordinates as `"x1 y1 x2 y2"` | All elements |
| `f` | Element flags (bitfield) | All elements |
| `r` | Resistance (ohms) | `<r>` |
| `c` | Capacitance (farads) | `<c>` |
| `vd` | Voltage difference | `<c>` |
| `iv` | Initial voltage | `<c>` |
| `sr` | Series resistance | `<c>`, `<d>` |
| `l` | Inductance (henries) | `<l>` |
| `wf` | Waveform type (0-6) | `<v>`, `<R>` |
| `fr` | Frequency (Hz) | `<v>`, `<R>` |
| `maxv` | Max voltage | `<v>`, `<R>` |
| `sc` | Scale | `<O>`, `<p>` |

#### Scope Element `<o>`

Contains child `<p>` (plot) elements for each trace:

| Attr | Meaning |
|------|---------|
| `en` | Element number (index into component list) |
| `sp` | Speed |
| `f` | Flags (string like `"x3"`) |
| `p` | Position |

Plot `<p>` child attributes:

| Attr | Meaning |
|------|---------|
| `v` | Value index (0=voltage, 3=current) |
| `sc` | Scale |
| `e` | Element number override |

### Coordinate System

- Coordinates: integer pixels, typically multiples of 16
- Two terminals defined by (x1,y1) and (x2,y2) in the `x` attribute
- Node identification by coordinate matching (same x,y = same node)

### Supported Component Types

| Code/Tag | Component               | Priority | Why                                            |
| -------- | ----------------------- | -------- | ---------------------------------------------- |
| `r`      | Resistor                | P0       | Everywhere                                     |
| `c`      | Capacitor               | P0       | Integrators, filters, timing                   |
| `l`      | Inductor                | P0       | Some filter topologies                         |
| `d`      | Diode                   | P0       | Waveshaping, clipping, rectification           |
| `z`      | Zener diode             | P0       | Voltage limiting                               |
| `t`      | BJT (NPN/PNP)           | P0       | Exponential converters, diff pairs, amplifiers |
| `j`      | JFET                    | P1       | VCO switches, buffers                          |
| `f`      | MOSFET                  | P1       | Switching                                      |
| `a`      | Op-amp (ideal)          | P0       | Integrators, buffers, summing amps             |
| `401`    | Comparator              | P1       | Reset circuits, envelope generators            |
| `402`    | OTA                     | P1       | Voltage-controlled gain (VCF, VCA)             |
| `v`      | Voltage source (2-term) | P0       | AC/DC/square/saw/tri/pulse sources             |
| `R`      | Voltage rail (1-term)   | P0       | Power rails, signal injection                  |
| `i`      | Current source          | P1       | Biasing                                        |
| `g`      | Ground                  | P0       | Reference node                                 |
| `w`      | Wire                    | P0       | Connections                                    |
| `p`      | Probe                   | P0       | Voltage measurement point                      |
| `O`      | Output                  | P0       | Output marker                                  |
| `174`    | Potentiometer           | P0       | Interactive controls                           |
| `159`    | Analog switch           | P1       | Routing, envelope generators                   |
| `207`    | Labeled node            | P1       | Named connection points                        |
| `s`      | Switch                  | P1       | User interaction                               |
| `165`    | 555 Timer               | P2       | Oscillators, timing circuits                   |
| `209`    | Polarized capacitor     | P1       | Electrolytic caps in audio paths               |
| `x`      | Text label              | P1       | Annotations                                    |

**Ignored:** All digital logic, display elements, data recorder, motors, custom composites (logged as warnings).

### VoltageElm Waveform Types

| Value | Waveform  |
| ----- | --------- |
| 0     | DC        |
| 1     | AC (sine) |
| 2     | Square    |
| 3     | Triangle  |
| 4     | Sawtooth  |
| 5     | Pulse     |
| 6     | Noise     |

XML: `<v x="..." wf="2" fr="100" maxv="2"/>`

---

## Embed API

### Basic Usage

```html
<!-- Single script include -->
<script src="circuit-snippet.js"></script>

<!-- Embed with inline Falstad XML (copy-paste from Falstad "Export as Text") -->
<circuit-snippet>
  <cir f="1" ts="0.000005" ic="10.20027730826997" cb="50" pb="50" vr="5" mts="5e-11">
    <v x="96 176 96 272" f="0" wf="2" fr="100" maxv="2"/>
    <g x="96 272 96 288" f="0"/>
    <w x="96 176 192 176" f="0"/>
    <r x="192 176 320 176" f="0" r="100"/>
    <c x="320 176 320 272" f="0" c="0.00001" iv="0.001" sr="0" vd="1.971"/>
    <O x="416 176 480 176" f="0" sc="0"/>
    <o en="2" sp="16" f="x3" p="0">
      <p v="0" sc="5"/>
      <p v="3" sc="0.05"/>
    </o>
  </cir>
</circuit-snippet>

<!-- Or load from file -->
<circuit-snippet src="circuits/rc-lowpass.xml"></circuit-snippet>

<!-- Or from compressed Falstad URL parameter -->
<circuit-snippet ctz="CQAgjCAMB0l3BWcMHMcAsBaMA7..."></circuit-snippet>
```

The `<cir>` XML inside `<circuit-snippet>` is valid HTML (custom elements + self-closing tags). The parser extracts the `<cir>` element from the web component's innerHTML. This means Falstad XML export can be pasted directly into the page source — no escaping, no encoding, no intermediate files needed.

### Web Component: `<circuit-snippet>`

#### Attributes

| Attribute       | Type    | Default        | Description                                                                                                                  |
| --------------- | ------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src`           | string  | —              | URL to Falstad text file                                                                                                     |
| `ctz`           | string  | —              | LZString-compressed circuit data (same as Falstad URL param)                                                                 |
| `width`         | number  | 600            | Canvas width in px                                                                                                           |
| `height`        | number  | 400            | Canvas height in px                                                                                                          |
| `layout`        | string  | `"horizontal"` | `"horizontal"` (schematic left, scope right), `"vertical"` (schematic top, scope bottom), `"schematic-only"`, `"scope-only"` |
| `scope-ratio`   | number  | 0.4            | Fraction of space given to scope pane                                                                                        |
| `theme`         | string  | `"light"`      | `"light"` or `"dark"`                                                                                                        |
| `running`       | boolean | true           | Auto-start simulation                                                                                                        |
| `interactive`   | boolean | true           | Enable controls / value changes                                                                                              |
| `show-controls` | boolean | true           | Show play/pause, speed, component value sliders                                                                              |
| `speed`         | number  | 1              | Simulation speed multiplier                                                                                                  |
| `audio`         | boolean | false          | Enable Web Audio output from probe nodes                                                                                     |
| `title`         | string  | —              | Display title above embed                                                                                                    |

#### Configuration Overlay (JSON)

For advanced control over what's exposed, use a `<script type="application/json">` child:

```html
<circuit-snippet>
    <script type="application/json">
        {
            "circuit": "$ 1 0.000005...\nr 208 144...",
            "scope": {
                "nodes": [
                    { "label": "Input", "probe": "node:3", "color": "#4fc3f7" },
                    { "label": "Output", "probe": "node:7", "color": "#81c784" }
                ],
                "timeRange": 0.01,
                "voltageRange": [-6, 6],
                "showFFT": false
            },
            "controls": [
                {
                    "component": "r:0",
                    "param": "resistance",
                    "label": "R1",
                    "min": 100,
                    "max": 100000,
                    "scale": "log",
                    "unit": "Ω"
                },
                {
                    "component": "v:0",
                    "param": "frequency",
                    "label": "Input Freq",
                    "min": 20,
                    "max": 20000,
                    "scale": "log",
                    "unit": "Hz"
                }
            ],
            "annotations": [{ "x": 300, "y": 200, "text": "Cutoff = 1/(2πRC)" }]
        }
    </script>
</circuit-snippet>
```

#### Component Referencing

Components referenced in controls/scope config by `type:index` where index is order of appearance in circuit text. E.g., `"r:0"` = first resistor, `"r:1"` = second resistor, `"v:0"` = first voltage source.

Alternatively, if labeled nodes (`207`) exist, reference by label: `"node:OutputSignal"`.

#### JavaScript API

```js
const snippet = document.querySelector('circuit-snippet')

// Control
snippet.start()
snippet.stop()
snippet.reset()
snippet.setSpeed(2)

// Read state
snippet.getNodeVoltage('Output') // by labeled node
snippet.getNodeVoltageByIndex(3) // by node index
snippet.getTime()

// Modify circuit
snippet.setComponentValue('r:0', 'resistance', 4700)
snippet.setComponentValue('v:0', 'frequency', 1000)

// Events
snippet.addEventListener('tick', (e) => {
    // e.detail.time, e.detail.nodeVoltages
})

// Import/Export
snippet.loadCircuit(falstadText)
snippet.exportCircuit() // → Falstad-compatible text
```

---

## Simulation Engine

### Modified Nodal Analysis (MNA)

Same approach as Falstad — independent TypeScript implementation, not a port or fork.

**Why not copy Falstad's code?**
- Falstad is Java compiled to JS via GWT — the output is a monolithic, obfuscated bundle, not something you can extract modules from
- The GWT source is tightly coupled to a full desktop-style UI (menus, dialogs, side panel), not separable from the simulation logic
- The public repo hasn't been updated since Nov 2022; the live site has diverged (XML format, unknown other changes) with no published source
- MNA is a well-documented textbook algorithm — implementing from spec is straightforward and gives us control over performance tradeoffs
- No GPL license concerns since we're implementing the algorithm, not copying code. Parsing a file format is not a derivative work.

**Matrix equation:** `Ax = z`

- `A`: (N+M) × (N+M) conductance matrix where N = node count, M = voltage source count
- `x`: vector of N node voltages + M branch currents
- `z`: current/voltage source vector

**Component stamping:**

| Component                      | Matrix Contribution                                                            |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Resistor (R between nodes i,j) | `A[i,i] += 1/R`, `A[j,j] += 1/R`, `A[i,j] -= 1/R`, `A[j,i] -= 1/R`             |
| Voltage Source (V from i to j) | Extra row/column k: `A[i,k]=1`, `A[j,k]=-1`, `A[k,i]=1`, `A[k,j]=-1`, `z[k]=V` |
| Current Source (I from i to j) | `z[i] -= I`, `z[j] += I`                                                       |
| Capacitor                      | Companion model: `R_eq = dt/C` resistor + current source from previous state   |
| Inductor                       | Companion model: `R_eq = L/dt` resistor + current source from previous state   |

**Nonlinear iteration (Newton-Raphson):**

1. Linearize nonlinear devices at current operating point
2. Stamp linearized equivalent (resistor + current source)
3. Solve matrix
4. Check convergence (voltage/current deltas below threshold)
5. Re-linearize and repeat (max ~100 iterations)

**Integration:** Backward Euler (stable, simple). Trapezoidal as optional upgrade for accuracy.

**Timestep:** Default 5μs. Configurable via `$` header. Adaptive timestep for circuits with fast switching.

### Device Models

**Diode:**

- Shockley equation: `I = Is(e^(V/nVt) - 1)`
- Newton-Raphson linearization: equivalent conductance `gd = I/nVt` + current source
- Parameters from Falstad DiodeModel (Is, n, seriesResistance, emissionCoefficient)

**BJT (NPN/PNP):**

- Ebers-Moll model
- Two diode junctions (B-E, B-C) + current gain (beta)
- Linearized as three-terminal stamp

**JFET:**

- Shichman-Hodges model
- Pinch-off voltage Vp, transconductance beta

**MOSFET:**

- Level 1 SPICE model
- Threshold voltage Vt, transconductance parameter beta

**Op-Amp (ideal):**

- Infinite gain approximation: stamps voltage constraint `Vout = A*(V+ - V-)` with clipping at rail voltages
- Or: voltage source with extra row, gain reflected in stamp

**OTA:**

- `Iout = gm * (V+ - V-)` where gm proportional to bias current
- Stamps as VCCS

### Performance Targets

| Metric                            | Target                               |
| --------------------------------- | ------------------------------------ |
| Bundle size (gzipped)             | < 80KB                               |
| Startup time per instance         | < 100ms                              |
| Simulation (20-component circuit) | > 60 fps render, ~200k timesteps/sec |
| Memory per instance               | < 5MB                                |
| Instances per page                | 10+ without jank                     |

### Performance Strategy

- **IntersectionObserver**: pause simulation + rendering when embed not visible
- **requestAnimationFrame**: rendering loop decoupled from simulation
- **Simulation batching**: run N timesteps per frame, render once
- **Shared code**: all instances share one JS bundle, no per-instance overhead
- **TypedArrays**: Float64Array for matrix operations
- **LU factorization caching**: for linear circuits, factorize once, only update RHS

---

## Renderer

### Schematic Drawing (Canvas 2D)

- Component symbols drawn programmatically (no sprites/images)
- Coordinate system matches Falstad's pixel grid
- Auto-fit: compute bounding box of all components, scale/translate to fit canvas
- Wire routing preserved from Falstad layout (no auto-routing)

**Visual features:**

- Component value labels (R=4.7kΩ, C=100nF)
- Node voltage coloring (green = positive, red = negative, brightness = magnitude)
- Current flow animation (moving dots along wires, Falstad-style)
- Highlighted interactive elements (potentiometers glow on hover)

**Component symbols needed:**

| Component      | Symbol Style                                               |
| -------------- | ---------------------------------------------------------- |
| Resistor       | US zigzag (default) or EU rectangle box (attribute toggle) |
| Capacitor      | Two parallel lines (polarized: one curved)                 |
| Inductor       | Loopy coil                                                 |
| Diode          | Triangle + bar                                             |
| Zener          | Bent-bar diode variant                                     |
| BJT            | Circle with arrow on emitter (NPN→out, PNP→in)             |
| JFET           | Standard JFET symbol                                       |
| MOSFET         | Standard MOSFET symbol with gate insulation                |
| Op-amp         | Triangle with +/- inputs                                   |
| OTA            | Op-amp triangle with bias current input                    |
| Voltage source | Circle with +/-                                            |
| Current source | Circle with arrow                                          |
| Ground         | Standard 3-line ground                                     |
| Switch         | Gap with contact arm                                       |
| Potentiometer  | Resistor with arrow                                        |

### Theme

**Light (default):** White background, dark component outlines, colored traces. Matches typical web page context and print-friendly.

**Dark:** Black background, green/cyan wires. Falstad-style, familiar to EE students. Use `theme="dark"` attribute.

---

## Scope (Oscilloscope)

### Display

- Time-domain waveform plot, Canvas 2D
- Multiple traces with distinct colors
- Configurable time range (auto-scale or fixed)
- Configurable voltage range (auto-scale or fixed)
- Grid lines with labeled divisions
- Trace labels with current value readout
- Optional cursor/crosshair for value reading

### Features

- **Trigger**: edge trigger on selected trace for stable display
- **FFT mode**: optional frequency spectrum view (toggle per trace)
- **Freeze**: pause scope capture while simulation continues
- **Multiple scopes**: support for 2+ scope panes (e.g., input and output)

### Scope Config (from Falstad `o` lines)

```
o <column> <speed> <value1> <flags> <voltageRange> <timeRange> <position> <count> [plotN ...]
```

Parse Falstad scope lines to auto-configure which nodes to display. Also accept JSON overlay for custom labels/colors.

---

## Controls

### Auto-Generated Controls

When `interactive=true` and `show-controls=true`:

1. **Potentiometers** (`174`): auto-generate slider mapped to pot position (0-1)
2. **Switches** (`s`, `S`): auto-generate toggle button
3. **Variable voltage** (`172`): auto-generate slider for voltage
4. **Adjustable components** (`38` lines): respect Falstad slider definitions

### Custom Controls (JSON config)

Override or supplement auto-generated controls:

```json
{
    "controls": [
        {
            "component": "r:0",
            "param": "resistance",
            "label": "Feedback R",
            "min": 1000,
            "max": 1000000,
            "scale": "log",
            "unit": "Ω",
            "default": 47000
        }
    ]
}
```

`scale`: `"linear"` | `"log"` — log scale natural for frequency, resistance.

### Control Bar

Bottom of embed (or configurable position):

- Play/Pause button
- Reset button
- Speed slider (0.1x – 10x)
- Component sliders (scrollable if many)

---

## Audio Output (Phase 3)

Audio output is not part of core implementation — deferred to Phase 3 after simulation + rendering + interactivity are solid.

### Web Audio Integration

When `audio=true`:

- Create AudioContext on user interaction (browser autoplay policy)
- Use AudioWorkletNode (with ScriptProcessorNode fallback)
- Feed simulated voltage from designated probe node(s) to audio output
- Sample rate conversion: simulation timestep → 44.1kHz/48kHz
- Volume normalization: map simulation voltage range to [-1, 1] audio range

### Use Case

Hear a VCO output, filter sweep, wavefolder distortion. The circuit simulation produces the actual audio waveform.

### Limitations

- Simulation must run fast enough for real-time audio (~44k samples/sec minimum)
- Complex circuits may not achieve real-time; degrade gracefully (stutter or disable audio)
- Latency: buffer size tradeoff (128-2048 samples)

---

## Supported Circuits for Modular Synthesis Teaching

### Target Circuit Complexity

| Category              | Example                             | Components | Nodes |
| --------------------- | ----------------------------------- | ---------- | ----- |
| Basic passive         | RC low-pass filter                  | 3-5        | 3-4   |
| Active filter         | Sallen-Key LPF                      | 8-12       | 6-8   |
| Op-amp circuit        | Inverting amplifier                 | 5-8        | 4-6   |
| Simple VCO            | Relaxation oscillator               | 8-15       | 6-10  |
| Diode waveshaper      | Soft clipper                        | 6-10       | 4-6   |
| State-variable filter | SVF with resonance                  | 15-25      | 10-15 |
| Full VCO              | Expo converter + integrator + reset | 20-35      | 15-25 |

Maximum comfortable circuit size: ~40 components, ~30 nodes. Larger circuits supported but may impact performance with multiple embeds.

### Curriculum-Aligned Example Circuits

Phased by component support. Circuits only work once their required components are implemented.

**Phase 0 (R, C, V, wire, ground):**
1. **Voltage divider** — Ohm's law, loading effects
2. **RC low-pass filter** — cutoff frequency, time constant
3. **RC high-pass filter** — AC coupling, bass roll-off

**Phase 1 (add diode, BJT, op-amp, inductor):**
4. **RL circuits** — inductor behavior
5. **Diode clipper** — hard/soft clipping, overdrive
6. **Diode rectifier** — envelope follower precursor
7. **BJT common-emitter amplifier** — gain, biasing
8. **Op-amp inverting amplifier** — virtual ground, gain = -Rf/Ri
9. **Op-amp integrator** — core of VCO sawtooth generator
10. **Op-amp Schmitt trigger** — hysteresis, square wave generation
11. **Relaxation oscillator** — simplest VCO

**Phase 2+ (add potentiometer, controls, interactivity):**
12. **Sallen-Key LPF** — second-order filter, resonance (with adjustable R)

**Phase 3+ (add JFET, OTA, analog switch):**
13. **State-variable filter** — simultaneous LP/HP/BP, Q control
14. **Diode ladder filter** — Moog-style, voltage-controlled cutoff
15. **OTA-based VCA** — voltage-controlled amplitude
16. **Exponential converter** — V/Oct pitch tracking (BJT diff pair)
17. **Full waveshaper** — triangle-to-sine conversion
18. **Wavefolder** — Buchla/Serge-style harmonic generation
19. **ADSR envelope generator** — gate→envelope conversion
20. **Ring modulator** — diode ring, AM synthesis

---

## Technology Stack

| Layer        | Choice                         | Rationale                                               |
| ------------ | ------------------------------ | ------------------------------------------------------- |
| Language     | TypeScript                     | Type safety for matrix math, good DX                    |
| Build        | esbuild or Rollup              | Fast builds, tree-shaking, single-file output           |
| Component    | Web Component (Custom Element) | No framework dependency, works everywhere               |
| Rendering    | Canvas 2D                      | Fast, lightweight, good for multiple instances          |
| Math         | Native Float64Array            | No WASM dependency, sufficient for target circuit sizes |
| Audio        | AudioWorklet API               | Low-latency audio output                                |
| Distribution | npm + CDN (unpkg/jsdelivr)     | `<script>` tag or `npm install`                         |

### Bundle Output

```
dist/
  circuit-snippet.js          # IIFE bundle for <script> tag
  circuit-snippet.esm.js      # ES module for bundlers
  circuit-snippet.d.ts         # TypeScript declarations
  circuit-snippet.css          # Optional external styles (or inlined in JS)
```

---

## Phased Delivery

### Phase 0 — Proof of Concept

- Falstad XML parser for R, C, V, wire, ground
- MNA solver for linear circuits only
- Canvas renderer for basic components
- Single hardcoded scope
- No controls, no audio
- Dev page with side-by-side: circuit-snippet embed vs Falstad iframe of same circuit
- **Validates**: parse a voltage divider and RC low-pass from Falstad export, simulate, render schematic + scope waveform. Visually compare output against Falstad to confirm correctness.
- **Deliverable**: open `dev.html`, see working RC low-pass filter with correct waveform

### Phase 1 — Core Simulator

- All P0 components (add diode, BJT, op-amp)
- Newton-Raphson for nonlinear devices
- Full scope with Falstad `o` line parsing
- Auto-fit schematic rendering
- Play/pause/reset
- Web Component registration
- **Validates**: can simulate and display real synth circuits (RC filter, op-amp integrator, clipper)

### Phase 2 — Interactivity

- Potentiometer sliders (auto-generated from `174`)
- JSON config overlay for custom controls
- Component value adjustment
- Multiple embed instances on one page
- IntersectionObserver pause/resume
- Dark/light theme
- **Validates**: interactive teaching embeds working in a real page

### Phase 3 — Audio & Polish

- P1 components (JFET, MOSFET, comparator, OTA, analog switch)
- Web Audio output
- FFT scope mode
- Current flow animation
- Labeled nodes
- Performance optimization
- npm publish + CDN
- **Validates**: full modular synth curriculum coverage

### Phase 4 — Editor

- Visual configuration editor (separate app/page)
- Load Falstad text → preview embed → configure controls/scope/layout → export embed code
- Drag-to-select scope probe nodes
- Control binding UI
- Live preview of final embed
- Copy-paste embed snippet output

---

## Open Questions

1. License — GPL (match Falstad) or MIT? Falstad code is GPL but clean-room reimplementation of MNA algorithm shouldn't require GPL. However, format compatibility may be a gray area.
2. Component rendering — match Falstad's visual style exactly, or develop distinct visual identity?
3. Matrix solver — pure JS Float64Array vs. tiny WASM linear algebra lib? JS simpler, WASM faster for 30+ node circuits.
4. Responsive sizing — fixed pixel dimensions or fluid/responsive within container?
5. Offline support — service worker for offline use, or always-online acceptable?
6. Touch interaction — scope pinch-to-zoom, slider drag? Mobile is read-mostly or interactive?
7. Audio output — which probe node(s) drive audio by default? Require explicit config, or auto-detect `O`/`p`/`211` (AudioOutput) elements?
8. Falstad `38` (adjustable) lines — support these as first-class controls, or only honor potentiometer/switch elements?
9. State-saving — should embeds remember user's control positions across page loads (localStorage)?
10. Accessibility — ARIA labels on controls, keyboard navigation for sliders — scope of a11y effort?
