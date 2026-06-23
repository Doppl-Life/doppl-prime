/**
 * PD.20 — a trailing-edge debounce: coalesce a burst of rapid calls into ONE invocation after `waitMs`
 * of quiet, and `cancel()` to drop a pending invocation. The Dashboard uses it to bound the live
 * projection re-fetch rate during an SSE event burst (no hammering), and cancels the pending re-fetch
 * on unmount / observed-run switch (no setState-after-unmount, no leak). Pure timing — no DOM, no React.
 */
export interface Debounced {
  (): void;
  cancel(): void;
}

export function debounce(fn: () => void, waitMs: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (() => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, waitMs);
  }) as Debounced;
  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}
