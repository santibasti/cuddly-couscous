import { describe, expect, it } from 'vitest';
import { ACCOUNTS, ROLES, authenticate, canOpen } from './role';

describe('accounts', () => {
  it('has one login for each role', () => {
    expect(ACCOUNTS.map((a) => a.role).sort()).toEqual(['advisor', 'executive', 'leader']);
  });
  it('accepts the right password and refuses a wrong one', () => {
    expect(authenticate('executive', 'alex-exec')?.role).toBe('executive');
    expect(authenticate(' Advisor ', 'alex-advisor')?.role).toBe('advisor');
    expect(authenticate('executive', 'nope')).toBeUndefined();
    expect(authenticate('', '')).toBeUndefined();
  });
  it('keeps sales pages to the executive and customers away from the team leader', () => {
    expect(canOpen('executive', '/executive')).toBe(true);
    expect(canOpen('advisor', '/executive')).toBe(false);
    expect(canOpen('leader', '/customers/c1')).toBe(false);
    expect(ROLES.leader.edit).toBe(false);
  });
});
