// P0.1 — Actor: closed 7-role union. spec(§4): ARCHITECTURE.md §4 closed actor union
// (canonical; supersedes the draft's `actor: string`).
import { describe, it, expect } from 'vitest';
import { Actor } from '@doppl/contracts';

const SEVEN_ROLES = [
  'operator',
  'runtime',
  'agenome',
  'critic',
  'check_runner',
  'selection_controller',
  'system',
] as const;

describe('Actor — closed 7-role union (spec §4)', () => {
  it('actor_accepts_all_seven_roles', () => {
    // spec(§4): each of the 7 canonical roles parses to itself.
    for (const role of SEVEN_ROLES) {
      expect(Actor.parse(role)).toBe(role);
    }
    expect(SEVEN_ROLES).toHaveLength(7);
  });

  it('actor_rejects_out_of_set_value', () => {
    // spec(§4): the closed union supersedes `actor: string` — any other value is rejected.
    expect(() => Actor.parse('hacker')).toThrow();
    expect(() => Actor.parse('admin')).toThrow();
    expect(() => Actor.parse('')).toThrow();
  });
});
