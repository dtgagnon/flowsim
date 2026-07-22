// Working-fluid property database. Values are representative engineering
// figures for the temperatures typically used on medical device test loops.
//
//   density   rho  [kg/m^3]
//   viscosity mu   [Pa·s]  (dynamic)
//
// Blood and blood analogs are non-Newtonian in reality; for a lumped-parameter
// test-loop model they are treated as Newtonian with an apparent viscosity,
// which is standard practice for sizing and pressure-drop estimates.

export interface Fluid {
  id: string;
  name: string;
  /** density kg/m^3 */
  density: number;
  /** dynamic viscosity Pa·s */
  viscosity: number;
  /** informational */
  tempC: number;
  note?: string;
}

export const FLUIDS: Fluid[] = [
  {
    id: "water20",
    name: "Water (20 °C)",
    density: 998.2,
    viscosity: 1.002e-3,
    tempC: 20,
  },
  {
    id: "water37",
    name: "Water (37 °C)",
    density: 993.3,
    viscosity: 0.6913e-3,
    tempC: 37,
  },
  {
    id: "saline",
    name: "Saline 0.9% (37 °C)",
    density: 1004.6,
    viscosity: 0.72e-3,
    tempC: 37,
    note: "Isotonic sodium chloride",
  },
  {
    id: "blood",
    name: "Blood (37 °C)",
    density: 1060,
    viscosity: 3.5e-3,
    tempC: 37,
    note: "Apparent viscosity at high shear",
  },
  {
    id: "bloodAnalog",
    name: "Blood analog (40% glycerin)",
    density: 1100,
    viscosity: 3.5e-3,
    tempC: 25,
    note: "Glycerin–water, matches blood viscosity",
  },
  {
    id: "glycerin50",
    name: "Glycerin 50% (25 °C)",
    density: 1126,
    viscosity: 6.0e-3,
    tempC: 25,
  },
];

export function getFluid(id: string): Fluid {
  return FLUIDS.find((f) => f.id === id) ?? FLUIDS[0];
}
