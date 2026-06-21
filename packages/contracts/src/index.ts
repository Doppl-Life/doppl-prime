/**
 * @doppl/contracts — frozen shared contracts (Appendix-A models) crossed by the §2.5 subsystem
 * seams. This barrel is the single import boundary every track consumes; no model is redefined
 * outside this package.
 */
export * from './checks/check-result';
export * from './checks/check-runner-adapter';
export * from './config/validate';
export * from './domain/agenome';
export * from './domain/candidate-idea';
export * from './domain/culling-event';
export * from './domain/energy-event';
export * from './domain/evidence-ref';
export * from './domain/generation';
export * from './domain/reproduction-event';
export * from './domain/run';
export * from './domain/subtype';
export * from './domain/subtype-payloads';
export * from './events/actor';
export * from './events/event-type';
export * from './events/envelope';
export * from './events/payload-map';
export * from './gateway/gateway-request';
export * from './gateway/gateway-response';
export * from './gateway/model-role';
export * from './gateway/model-route';
export * from './gateway/provider-capability';
export * from './gateway/provider-meta';
export * from './projections/lineage-graph';
export * from './run/run-caps';
export * from './run/run-config';
export * from './scoring/fitness-score';
export * from './scoring/novelty-score';
export * from './scoring/scoring-policy';
export * from './security/redaction';
export * from './verifier/critic-input';
export * from './verifier/critic-review';
export * from './verifier/final-judge-rubric';
export * from './version';
// P0.14 contract-test surface — canonical fixtures + consolidated field-set snapshot harness
// (shipped from src/ for cross-track contract tests; see §16 / §2.5).
export * from './__schema-snapshots__/field-sets';
export * from './test-fixtures';
