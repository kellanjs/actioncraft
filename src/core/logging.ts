import type { CrafterConfig } from "../types/config.js";

/**
 * Lightweight wrapper around the optional logger in `CrafterConfig`.
 */
export type Logger = NonNullable<CrafterConfig["logger"]>;

export function log(
  logger: CrafterConfig["logger"],
  level: "error" | "warn",
  message: string,
  details?: unknown,
): void {
  if (!logger) return;
  const fn = logger[level];
  if (fn) fn(message, details);
}
