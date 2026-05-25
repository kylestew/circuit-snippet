# Phase 0 — Proof of Concept

Goal: parse Falstad export → simulate → render schematic + scope. Validate with RC low-pass filter side-by-side against Falstad.

## Project Setup

- [ ] `npm init`, tsconfig
- [ ] `src/` directory structure: `parser/`, `sim/`, `render/`, `scope/`, `components/`
- [ ] `dev.html` — test page that loads modules via `<script type="module">`

## Parser (XML only)

- [ ] Parse `<cir>` root attrs → SimOptions (`ts`, `f`, `vr`, `mts`, etc.)
- [ ] Parse element children by tag name → component list
- [ ] Extract `x` attr → `{x1, y1, x2, y2}` coordinates
- [ ] Extract `f` attr → flags
- [ ] `<r>` — resistance from `r` attr
- [ ] `<c>` — capacitance from `c` attr, `vd`, `iv`
- [ ] `<v>` / `<R>` — waveform (`wf`), frequency (`fr`), max voltage (`maxv`), bias, phase, duty
- [ ] `<w>` — wire (no extra params)
- [ ] `<g>` — ground (no extra params)
- [ ] `<O>` / `<p>` — output/probe markers
- [ ] `<o>` scope elements with `<p>` plot children
- [ ] Unknown tags → warn + skip
- [ ] **Netlist builder**
  - [ ] Assign node IDs by coordinate matching (same x,y = same node)
  - [ ] Wires merge the nodes at their two endpoints (union-find)
  - [ ] Ground nodes → node 0
  - [ ] Build node list, component list with node references
  - [ ] Validate: no floating nodes, at least one ground

## Simulation Engine

- [ ] **MNA matrix setup**
  - [ ] Count nodes (N) and voltage sources (M)
  - [ ] Allocate `A` matrix and `z` vector as Float64Array (size N+M)
  - [ ] Ground = node 0, excluded from matrix (rows/cols for nodes 1..N)
- [ ] **Component stamping**
  - [ ] Resistor: stamp conductance `1/R` at `[i,i]`, `[j,j]`, `-1/R` at `[i,j]`, `[j,i]`
  - [ ] Voltage source (DC): extra row/col k, `A[i,k]=1`, `A[j,k]=-1`, `A[k,i]=1`, `A[k,j]=-1`, `z[k]=V`
  - [ ] Capacitor companion model: `R_eq = dt/C`, stamp as resistor + current source from previous voltage
  - [ ] AC/square/saw/tri voltage sources: compute instantaneous voltage from waveform type + time
- [ ] **LU solver**
  - [ ] LU decomposition with partial pivoting (in-place, Float64Array)
  - [ ] Forward/back substitution to solve `Ax = z`
- [ ] **Transient analysis loop**
  - [ ] Initialize node voltages to 0
  - [ ] Each timestep: rebuild z vector (time-varying sources + capacitor companions), solve, update state
  - [ ] Capacitor state update: store voltage across cap for next timestep companion
  - [ ] Configurable timestep from SimOptions (`ts` field)
- [ ] **Simulation runner**
  - [ ] `requestAnimationFrame` loop
  - [ ] Run N timesteps per frame (batch to keep up with wall clock)
  - [ ] Track simulation time
  - [ ] Start/stop capability

## Renderer (Canvas 2D)

- [ ] **Canvas setup**
  - [ ] Create canvas element, set dimensions
  - [ ] Compute bounding box of all component coordinates
  - [ ] Scale + translate to fit canvas with padding
- [ ] **Component drawing**
  - [ ] Wire: straight line between endpoints
  - [ ] Resistor: zigzag symbol (US style)
  - [ ] Capacitor: two parallel lines
  - [ ] Voltage source: circle with +/−
  - [ ] Ground: three horizontal lines (decreasing width)
  - [ ] Probe/Output: dot + label
- [ ] **Component labels**
  - [ ] Display values next to components (R=1kΩ, C=100nF)
  - [ ] SI prefix formatting (p, n, μ, m, k, M)
- [ ] **Node voltage visualization**
  - [ ] Color wires/nodes by voltage (green positive, red negative, brightness = magnitude)
- [ ] **Render loop**
  - [ ] Clear + redraw each frame
  - [ ] Sync with simulation runner's rAF

## Scope (Oscilloscope)

- [ ] **Scope canvas**
  - [ ] Separate canvas (or region of main canvas)
  - [ ] Grid lines with voltage/time divisions
  - [ ] Axis labels (voltage in V, time in ms/μs)
- [ ] **Data collection**
  - [ ] Ring buffer of voltage samples per tracked node
  - [ ] Sample on each simulation timestep
  - [ ] Buffer size = canvas width in pixels (1 sample per pixel column)
- [ ] **Waveform drawing**
  - [ ] Plot voltage vs time as connected line segments
  - [ ] Auto-scale voltage axis to fit signal
  - [ ] Auto-scale time axis based on simulation speed
  - [ ] Scrolling display (newest data on right edge)
- [ ] **Scope config from Falstad**
  - [ ] Parse `<o>` elements / `o` lines to determine which component's voltage/current to plot
  - [ ] Map element index (`en` attr) to component in netlist
  - [ ] `v=0` → voltage, `v=3` → current

## Dev Page

- [ ] `dev.html` with two embeds:
  - [ ] Voltage divider (R-R from AC source)
  - [ ] RC low-pass filter (R-C from square wave source)
- [ ] Side-by-side layout: circuit-snippet canvas left, Falstad iframe right (same circuit loaded via `?ctz=`)
- [ ] Visual comparison: waveform shape, voltage values, component rendering
- [ ] Console logging: node voltages per timestep for debugging

## Test Circuits (Falstad XML exports)

- [ ] `circuits/voltage-divider.xml` — two resistors, AC source, ground, probe on midpoint
- [ ] `circuits/rc-lowpass.xml` — resistor + capacitor, square wave source, probe on output

## Validation Criteria

- [ ] Voltage divider: output voltage = Vin * R2/(R1+R2), scope shows correct amplitude
- [ ] RC low-pass: square wave input → exponential charge/discharge on output, time constant τ = RC visible
- [ ] Schematic looks recognizable (components in right positions, wires connecting them)
- [ ] No NaN/Infinity in simulation (matrix solver stable)
- [ ] Runs at 60fps with these simple circuits
