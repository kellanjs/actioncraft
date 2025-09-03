import type { Config } from "../../types/builder.js";

export function log(
  logger: Config["logger"],
  level: "error" | "warn",
  message: string,
  details?: unknown,
): void {
  if (!logger) return;
  const fn = logger[level];
  if (fn) fn(message, details);
}
