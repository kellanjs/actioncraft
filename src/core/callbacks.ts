/**
 * Executes a callback function safely.
 * Any error thrown by the callback is caught and logged (if a logFn is supplied)
 * so that it never interrupts the main action flow.
 */
export async function safeExecuteCallback(
  callback: (() => Promise<void> | void) | undefined,
  callbackName: string,
  // Logger accepts (level, message, details?)
  logFn?: (level: "error" | "warn", message: string, details?: unknown) => void,
): Promise<void> {
  if (!callback) return;

  try {
    await callback();
  } catch (error) {
    if (logFn) {
      logFn("error", `Error in ${callbackName} callback`, error);
    }
  }
}
