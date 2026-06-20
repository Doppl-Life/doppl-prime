/**
 * @doppl/contracts — frozen shared contracts (Appendix-A models) crossed by the §2.5 subsystem
 * seams. This barrel is the single import boundary every track consumes; no model is redefined
 * outside this package.
 */
export * from './events/actor';
export * from './events/event-type';
export * from './events/envelope';
export * from './version';
