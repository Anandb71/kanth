import { useSyncExternalStore } from "react";
import { kanth, type KanthState } from "./kanth.ts";

export function useKanth(): KanthState {
  return useSyncExternalStore(kanth.subscribe, kanth.getState, kanth.getState);
}

/** Median of the defined numbers, or undefined. */
export function median(xs: (number | undefined)[]): number | undefined {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return undefined;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1]! + v[m]!) / 2;
}

export function fmtMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "–";
  if (ms >= 10000) return `${(ms / 1000).toFixed(0)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}
