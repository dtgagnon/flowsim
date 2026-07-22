// Display formatting for solver output (SI internally → engineering units).
import { pressureFromPa, flowFromM3s } from "./physics/units";

export function fmtPressure(pa: number, unit: "mmHg" | "kPa" | "psi" = "mmHg"): string {
  const v = pressureFromPa(pa, unit);
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 1 : 2;
  return `${v.toFixed(digits)} ${unit}`;
}

// Auto-scales across the wide dynamic range of a test loop: a 50 mL/min pump
// and a 100 µL/min sampling tap each read in their natural unit. Pass an
// explicit unit to force it.
export function fmtFlow(q: number, unit?: "µL/min" | "mL/min" | "L/min"): string {
  const mlmin = flowFromM3s(Math.abs(q), "mL/min");
  const chosen: "µL/min" | "mL/min" | "L/min" =
    unit ?? (mlmin < 1 ? "µL/min" : mlmin >= 1000 ? "L/min" : "mL/min");
  const v = flowFromM3s(Math.abs(q), chosen);
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${chosen}`;
}

export function fmtVelocity(v: number): string {
  const a = Math.abs(v);
  if (a < 1e-3) return `${(a * 1e6).toFixed(0)} µm/s`;
  if (a < 1) return `${(a * 1000).toFixed(a < 0.1 ? 2 : 1)} mm/s`;
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
