// Unit conversions. Internally the solver works in SI base units:
//   length: m,  area: m^2,  pressure: Pa (gauge),  flow: m^3/s,
//   density: kg/m^3,  dynamic viscosity: Pa·s
//
// The UI presents friendlier engineering units; conversions live here.

export const PA_PER_MMHG = 133.322;
export const PA_PER_KPA = 1000;
export const PA_PER_PSI = 6894.757;

export type PressureUnit = "mmHg" | "kPa" | "psi" | "Pa";
export type FlowUnit = "µL/min" | "mL/min" | "L/min" | "mL/s";
export type LengthUnit = "mm" | "cm" | "m" | "in";

export function pressureFromPa(pa: number, unit: PressureUnit): number {
  switch (unit) {
    case "mmHg":
      return pa / PA_PER_MMHG;
    case "kPa":
      return pa / PA_PER_KPA;
    case "psi":
      return pa / PA_PER_PSI;
    case "Pa":
      return pa;
  }
}

export function pressureToPa(value: number, unit: PressureUnit): number {
  switch (unit) {
    case "mmHg":
      return value * PA_PER_MMHG;
    case "kPa":
      return value * PA_PER_KPA;
    case "psi":
      return value * PA_PER_PSI;
    case "Pa":
      return value;
  }
}

// Flow: 1 m^3/s = 1e6 mL/s = 6e7 mL/min = 6e10 µL/min
export function flowFromM3s(q: number, unit: FlowUnit): number {
  switch (unit) {
    case "µL/min":
      return q * 60e9;
    case "mL/min":
      return q * 60e6;
    case "L/min":
      return q * 60e3;
    case "mL/s":
      return q * 1e6;
  }
}

export function flowToM3s(value: number, unit: FlowUnit): number {
  switch (unit) {
    case "µL/min":
      return value / 60e9;
    case "mL/min":
      return value / 60e6;
    case "L/min":
      return value / 60e3;
    case "mL/s":
      return value / 1e6;
  }
}

// Length
export function lengthToM(value: number, unit: LengthUnit): number {
  switch (unit) {
    case "mm":
      return value / 1000;
    case "cm":
      return value / 100;
    case "m":
      return value;
    case "in":
      return value * 0.0254;
  }
}

export function mmToM(mm: number): number {
  return mm / 1000;
}

export function mToMm(m: number): number {
  return m * 1000;
}
