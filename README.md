# FlowSim

Interactive fluid-flow simulator for **medical device test loops**. Build a
loop schematic by dragging pumps, reservoirs, connectors, and sensor probes
onto a canvas and joining them with configurable tubing. FlowSim solves the
hydraulic network and reports **volumetric flow rate, pressure, velocity, and
flow regime** at every tube and at any measurement point you designate.

## What it models

- **Volumetric flow** through each tube segment — auto-scaled from µL/min at a
  sampling tap up to L/min on a main line.
- **Pressure** at every node/junction and the **head** developed by each pump
  (mmHg, kPa, psi).
- **Configurable tubing**: inner diameter (common fractional-inch medical
  sizes), length, and material (silicone, PVC/Tygon, C-Flex, PharMed, PU,
  PTFE …).
- **Connectors & fittings** with realistic minor-loss coefficients: barbed
  straight / elbow / reducer / Y / tee, luer locks and Y/tee sites,
  quick-connects, and 3-way stopcocks.
- **Adjustable valves** (pinch, needle, ball) with a 0–100% opening. Throttling
  is modeled as a viscous throat resistance that grows without bound as the
  valve shuts, so a partly-closed valve throttles and a closed valve fully
  blocks its branch — at any flow rate, not just high ones.
- **Working fluids**: water, saline, blood, blood analog (glycerin), glycerin
  solutions — each with proper density and viscosity.

### The physics

Each loop is solved with the electrical-circuit analogy — pressure ↔ voltage,
volumetric flow ↔ current, hydraulic resistance ↔ resistance — using nodal
analysis:

- **Tube friction**: Hagen–Poiseuille in laminar flow (`ΔP = 128 μLQ / πD⁴`),
  Darcy–Weisbach with a Haaland turbulent friction factor otherwise, blended
  through the transitional band.
- **Minor losses** at fittings: `ΔP = K · ½ρv²`, distributed to the attached
  tubing.
- **Reynolds number** classifies each segment as laminar / transitional /
  turbulent (color-coded on the canvas).
- Pumps are prescribed-flow (current) sources; reservoirs are
  prescribed-pressure (voltage) sources; an open outlet is a 0 Pa reference.
  Because turbulent resistance depends on flow, the network is re-solved in an
  under-relaxed fixed-point loop until branch flows converge.

The solver is unit-tested against the closed-form Hagen–Poiseuille result,
mass conservation in series, flow splitting in parallel branches, and
turbulent-regime detection (`npm test`).

## Tech stack

- **Vite + React 18 + TypeScript**
- **[@xyflow/react](https://reactflow.dev)** (React Flow v12) — the interactive
  schematic builder
- **Zustand** — state, with automatic re-solve on every edit
- Custom hydraulic network solver (`src/physics/`) — no backend required

## Getting started (Nix)

This repo ships a Nix flake dev environment.

```sh
nix develop        # enters a shell with node 20 + npm
npm install        # first time only
npm run dev        # http://localhost:5173
```

With [direnv](https://direnv.net):

```sh
echo "use flake" > .envrc && direnv allow
```

Without Nix, any Node ≥ 20 works: `npm install && npm run dev`.

### Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Vite dev server                      |
| `npm run build`     | Type-check + production build        |
| `npm run preview`   | Serve the production build           |
| `npm test`          | Physics solver unit tests            |
| `npm run typecheck` | Type-check only                      |

## Using the app

1. Click **Example loop** for a reservoir → pump → sensor → Y-split → outlets
   loop, or **Flow divider (µL/min)** for the low-flow sampling pattern below.
   You can also start from a blank canvas.
2. **Drag** components from the left palette onto the canvas.
3. **Drag between ports** (the blue dots) to connect components with tubing.
4. Select a **tube** to set its diameter, material, and length; select a
   **component** to set pump flow or reservoir pressure.
5. Drop **Sensor probes** anywhere on the loop to designate measurement
   locations — their pressure and flow appear live in the right panel.
6. Pick the **working fluid** at the top of the inspector. Everything re-solves
   automatically.

## Automatic loop design

Click **Design loop** and specify how many sensors you need, the target flow at
those sensors, and the pump's flow range (min–max). FlowSim generates the loop
with the **fewest nodes and edges** that satisfies the spec, then runs the
solver to confirm the achieved flow.

Each sensor represents an independent device sampling location, so sensors are
**never placed in series** — a device downstream of one would perturb the
others, and a series path forces a single shared flow through all of them.
Every sensor gets its own parallel branch off a manifold:

- **Parallel manifold**: when the pump can supply the combined demand
  (N × target), it runs at exactly that and splits into N identical parallel
  branches — each independently holds the target, no bypass needed.
- **Flow divider manifold**: when the combined demand is below the pump's
  minimum, one bypass branch is added to shed the excess (tapped off first so
  the sample branches see equal manifold pressure), and the N sample branches
  are sized (and solver-verified) to the target.
- **Infeasible**: when the combined demand exceeds the pump's maximum, no
  single-pump loop can supply it — reported rather than faked.

Because parallel branches still couple slightly through the shared manifold
pressure, the report flags any residual branch-to-branch spread and suggests a
per-branch trim valve when exact balancing matters.

## Save & load

**Export** downloads the current schematic (fluid, components, tubing, valve
positions) as a JSON file; **Import** loads one back. Round-trips are lossless,
so loops can be versioned, shared, or used as fixtures.

## Low-flow sampling (flow divider)

Device sampling locations often need very low flow (tens to low hundreds of
µL/min) while the fixture pump runs far higher (e.g. 50 mL/min) for stability
and priming. The **Flow divider** example demonstrates throttling the pump flow
down with tubing physics: a tee splits the line into a wide-bore, low-resistance
**bypass** that carries almost all of the flow, and a fine-bore, high-resistance
**sample capillary** whose resistance ratio sets the tap flow. As shipped it
delivers ~100 µL/min to the sample point from a 50 mL/min pump. Adjust the
sample line's inner diameter and length (or the bypass) to dial in a target —
finer/longer sample tubing lowers the tap flow. Capillary and microbore sizes
(0.25–0.8 mm ID) are in the tubing size list for exactly this.

## Project layout

```
flake.nix                 Nix dev shell
src/physics/              Units, fluids, catalog, hydraulics, network solver (+ tests)
src/state/                Zustand store, schematic↔solver adapter, types
src/components/           Canvas, palette, nodes, tube edge, inspector, results
```

## Status

MVP. Steady-state, single-phase, Newtonian, incompressible flow. Roadmap ideas:
pulsatile/waveform pumps, elevation/gravity head, compliance and capacitance,
non-Newtonian blood models, save/load and export of loop configurations.
