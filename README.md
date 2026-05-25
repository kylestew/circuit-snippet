# Circuit Snippet

Embeddable analog circuit simulator. Design circuits in [Falstad CircuitJS](https://www.falstad.com/circuit/circuitjs.html), export the XML, embed as an interactive simulation on any web page.

Built for teaching analog electronics and modular synthesis.

## Quick Start

```html
<script src="circuit-snippet.js"></script>

<circuit-snippet width="700" height="450">
    <script type="text/xml">
        <cir f="1" ts="0.000005" cb="50" vr="5">
          <v x="96 176 96 272" f="0" wf="2" fr="100" maxv="2"/>
          <g x="96 272 96 288" f="0"/>
          <w x="96 176 192 176" f="0"/>
          <r x="192 176 320 176" f="0" r="100"/>
          <w x="320 176 416 176" f="0"/>
          <c x="320 176 320 272" f="0" c="0.00001"/>
          <g x="320 272 320 288" f="0"/>
          <O x="416 176 480 176" f="0"/>
        </cir>
    </script>
</circuit-snippet>
```

One `<script>` tag (28KB), then as many `<circuit-snippet>` elements as you want. Each runs its own independent simulation.

## Getting Circuit Data

1. Open [Falstad CircuitJS](https://www.falstad.com/circuit/circuitjs.html)
2. Build or load your circuit
3. File → Export as Text (or Save as File)
4. Copy the XML output
5. Paste inside `<script type="text/xml">` in your `<circuit-snippet>`

## Adding Interactive Controls

Add a `<script type="application/json">` block to expose component values as sliders:

```html
<circuit-snippet width="700" height="450">
    <script type="text/xml">
        <!-- Falstad XML here -->
    </script>
    <script type="application/json">
        {
            "controls": [
                {
                    "component": "r:0",
                    "param": "resistance",
                    "label": "Resistance",
                    "min": 10,
                    "max": 10000,
                    "scale": "log",
                    "unit": "Ω"
                },
                {
                    "component": "v:0",
                    "param": "frequency",
                    "label": "Frequency",
                    "min": 20,
                    "max": 2000,
                    "scale": "log",
                    "unit": "Hz"
                }
            ]
        }
    </script>
</circuit-snippet>
```

### Component References

Components are referenced as `"type:index"` where index counts from 0 among components of that type:

- `"r:0"` — first resistor
- `"r:1"` — second resistor
- `"c:0"` — first capacitor
- `"v:0"` — first voltage source

### Adjustable Parameters

| Component | Param | Description |
|-----------|-------|-------------|
| Resistor (`r`) | `resistance` | Ohms |
| Capacitor (`c`) | `capacitance` | Farads |
| Inductor (`l`) | `inductance` | Henries |
| Voltage Source (`v`, `R`) | `frequency` | Hz |
| Voltage Source (`v`, `R`) | `maxVoltage` | Volts |
| Voltage Source (`v`, `R`) | `waveform` | 0=DC, 1=AC, 2=Square, 3=Triangle, 4=Sawtooth |

### Auto-Generated Controls

If no JSON config is provided, sliders are automatically generated for all resistors, capacitors, and voltage source frequencies in the circuit (up to 6 components).

## Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `width` | `600` | Container width in pixels |
| `height` | `500` | Container height in pixels |
| `layout` | `vertical` | `vertical`, `horizontal`, `schematic-only`, `scope-only` |
| `scope-ratio` | `0.4` | Fraction of space for the oscilloscope |
| `display-time` | `0.012` | Scope time window in seconds (e.g. `0.02` for 20ms) |
| `theme` | `light` | `light` or `dark` |
| `running` | `true` | Set to `false` to start paused |
| `src` | — | URL to an XML circuit file (alternative to inline XML) |

## JavaScript API

```js
const el = document.querySelector('circuit-snippet');

el.start();
el.stop();
el.setComponentValue('r:0', 'resistance', 4700);
el.getNodeVoltage(1);
el.getTime();
```

## Supported Components

| Falstad Element | Tag | Simulation Model |
|-----------------|-----|-----------------|
| Resistor | `<r>` | Conductance stamp |
| Capacitor | `<c>` | Backward Euler companion |
| Inductor | `<l>` | Backward Euler companion |
| Diode | `<d>` | Shockley equation + Newton-Raphson |
| BJT (NPN/PNP) | `<t>` | Ebers-Moll model |
| Op-Amp | `<a>` | VCVS with rail clamping |
| Voltage Source | `<v>` | DC/AC/Square/Triangle/Sawtooth/Pulse |
| Voltage Rail | `<R>` | Single-terminal source |
| Wire | `<w>` | Node merge |
| Ground | `<g>` | Reference node |
| Output Probe | `<O>` | Measurement point |
| Probe | `<p>` | Measurement point |

Unsupported elements are silently skipped.

## Building from Source

```bash
git clone https://github.com/YOUR_USERNAME/circuit-snippet.git
cd circuit-snippet
npm install
npm run build
```

Output: `dist/circuit-snippet.js` (IIFE, 28KB) and `dist/circuit-snippet.esm.js` (ES module).

## How It Works

1. **Parser** — reads Falstad XML, extracts components and coordinates
2. **Netlist Builder** — assigns node IDs by coordinate matching, merges wires via union-find
3. **MNA Solver** — Modified Nodal Analysis with LU decomposition, Newton-Raphson iteration for nonlinear devices
4. **Renderer** — Canvas 2D schematic drawing with auto-fit
5. **Scope** — oscilloscope with rising-edge trigger, auto-scaled axes
6. **Runner** — requestAnimationFrame loop batching ~3000 timesteps per frame

## License

MIT
