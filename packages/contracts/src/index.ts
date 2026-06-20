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
export * from './domain/evidence-ref';
export * from './domain/subtype';
export * from './domain/subtype-payloads';
export * from './events/actor';
export * from './events/event-type';
export * from './events/envelope';
export * from './run/run-caps';
export * from './run/run-config';
export * from './security/redaction';
export * from './verifier/critic-input';
export * from './verifier/critic-review';
export * from './version';
