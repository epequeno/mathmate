/**
 * Thin wrapper around @tauri-apps/api/core invoke.
 * Dynamic import allows the module to load in non-Tauri (browser) contexts
 * without throwing at module evaluation time.
 */
export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}
