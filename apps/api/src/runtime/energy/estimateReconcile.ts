import type { EnergyEvent, ProviderMeta } from '@doppl/contracts';
import { energyForLlm, energyForTool, energyForSpawn, type CostMapConfig } from './costMap';

/**
 * P3.5 — estimate + reconcile (ARCHITECTURE.md §4, KEY SAFETY RULE #8). A productive call is debited
 * pre-call with an ESTIMATE and reconciled post-call against the returned provider usage; the
 * `energy.spent` event persists BOTH. PURE — builds the frozen `EnergyEvent` payload; the loop (P3.10)
 * appends it (applying the secret-scrub) and emits `provider_call_failed` on a FAILURE (never an
 * `EnergyEvent` — rule #8: energy = successful productive spend only).
 *
 * Rule #8 by shape: the only inputs are the productive `EnergyDraw` / reconcile types; there is no
 * failure/retry/repair input that yields an `EnergyEvent`, and the frozen `EnergyEventType` carries no
 * failure member. For `llm`, the post-call `actual` derives ONLY from real `providerMeta` token counts —
 * so `providerMeta` is REQUIRED for the llm reconcile (a successful llm call always carries it; missing
 * it is a caller bug, never a silent `actual = estimate` fallback that would leak an estimate into the
 * cap-relevant cumulative). `tool`/`spawn` are flat (estimate === actual, no provider usage).
 */

/** Pre-call draw — carries the estimate input (`expectedTokens` for llm). */
export type EnergyDraw =
  | { readonly eventType: 'llm'; readonly expectedTokens: number }
  | { readonly eventType: 'tool' }
  | { readonly eventType: 'spawn' };

/** The scope ids + reason stamped onto the produced `EnergyEvent`. */
export interface EnergyScope {
  readonly id: string;
  readonly runId: string;
  readonly generationId?: string;
  readonly agenomeId?: string;
  readonly reason: string;
}

/**
 * Post-call reconcile input — `eventType`-discriminated so `providerMeta` is REQUIRED for `llm`
 * (compile-time) and absent for `tool`/`spawn`.
 */
export type ReconcileInput =
  | {
      readonly scope: EnergyScope;
      readonly eventType: 'llm';
      readonly estimate: number;
      readonly providerMeta: ProviderMeta;
    }
  | {
      readonly scope: EnergyScope;
      readonly eventType: 'tool' | 'spawn';
      readonly estimate: number;
    };

/** Pre-call estimate in `doppl_energy` (pure over the draw + cost map). */
export function estimateEnergy(draw: EnergyDraw, config: CostMapConfig): number {
  switch (draw.eventType) {
    case 'llm':
      return energyForLlm(draw.expectedTokens, config);
    case 'tool':
      return energyForTool(config);
    case 'spawn':
      return energyForSpawn(config);
  }
}

/**
 * Build the `energy.spent` payload carrying BOTH `estimate` and the reconciled `actual`. For `llm`,
 * `actual` derives from the real `providerMeta.tokensIn + tokensOut`; for `tool`/`spawn`, `actual ===
 * estimate` (flat cost). Fails loud on a type-bypassed llm-without-`providerMeta` call (lesson §31).
 */
export function reconcileEnergy(input: ReconcileInput, config: CostMapConfig): EnergyEvent {
  const { scope, estimate, eventType } = input;
  let actual: number;
  let providerMeta: ProviderMeta | undefined;
  if (input.eventType === 'llm') {
    // Defend against a type-bypassed caller: rule #8 — actual must derive from REAL usage, never estimate.
    const pm: ProviderMeta | undefined = input.providerMeta;
    if (pm === undefined) {
      throw new Error(
        'reconcileEnergy: llm reconcile requires providerMeta — a successful llm call always carries it ' +
          '(rule #8: actual must derive from real provider usage, never the estimate)',
      );
    }
    providerMeta = pm;
    actual = energyForLlm(pm.tokensIn + pm.tokensOut, config);
  } else {
    actual = estimate; // tool/spawn: flat per-event cost, no token variance
  }
  return {
    id: scope.id,
    runId: scope.runId,
    ...(scope.generationId !== undefined ? { generationId: scope.generationId } : {}),
    ...(scope.agenomeId !== undefined ? { agenomeId: scope.agenomeId } : {}),
    eventType,
    estimate,
    actual,
    unit: 'doppl_energy',
    reason: scope.reason,
    ...(providerMeta !== undefined ? { providerMeta } : {}),
  };
}
