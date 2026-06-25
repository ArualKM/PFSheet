import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a signed modifier, e.g. 3 -> "+3", -1 -> "-1". */
export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}
