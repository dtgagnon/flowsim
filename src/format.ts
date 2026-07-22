// Display formatting for solver output (SI internally → engineering units).
import { pressureFromPa, flowFromM3s } from "./physics/units";

export function fmtPressure(pa: number, unit: "mmHg" | "kPa" | "psi" = "mmHg"): string {
  const v = pressureFromPa(pa, unit);
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 1 : 2;
  return `${v.toFixed(digits)} ${unit}`;
}

export function fmtFlow(q: number, unit: "mL/min" | "L/min" = "mL/min"): string {
  const v = flowFromM3s(Math.abs(q), unit);
  const digits = Math.abs(v) >= 100 ? 0 : 1;
  return `${v.toFixed(digits)} ${unit}`;
}

export function fmtVelocity(v: number): string {
  const a = Math.abs(v);
  if (a < 0.01) return `${(a * 1000).toFixed(1)} mm/s`;
  return `${a.toFixed(2)} m/s`;
}

export function fmtReynolds(re: number): string {
  if (re < 1) return "0";
  return re.toFixed(0);
}

export function regimeColor(regime: string): string {
  switch (regime) {
    case "laminar":
      return "#2f9e44";
    case "transitional":
      return "#f08c00";
    case "turbulent":
      return "#e03131";
    default:
      return "#868e96";
  }
}
