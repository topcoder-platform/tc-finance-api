import { isWiproEmail } from './withdrawal.utils';

describe('isWiproEmail', () => {
  it.each([
    'employee@wipro.com',
    ' Employee@WIPRO.COM ',
    'employee@sub.wipro.com',
  ])('accepts the normalized Wipro domain hierarchy: %s', (email) => {
    expect(isWiproEmail(email)).toBe(true);
  });

  it.each([
    'employee@notwipro.com',
    'employee@wipro.com.attacker.example',
    'wipro.com@attacker.example',
    'employee@wipro.com@attacker.example',
    'employee@.wipro.com',
    '@wipro.com',
    'wipro.com',
    '',
  ])('rejects a lookalike or malformed email address: %s', (email) => {
    expect(isWiproEmail(email)).toBe(false);
  });
});
