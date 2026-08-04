const WIPRO_EMAIL_DOMAIN = 'wipro.com';

/**
 * Determines whether an email address belongs to Wipro's domain hierarchy.
 *
 * The comparison is case-insensitive and ignores surrounding whitespace, but
 * preserves the existing restriction for Wipro subdomains while rejecting
 * lookalike suffixes and malformed addresses containing more than one `@`
 * separator.
 *
 * @param email Email address returned by the member service.
 * @returns True only for a non-empty local part at the `wipro.com` domain.
 */
export function isWiproEmail(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const emailParts = normalizedEmail.split('@');
  const domainParts = emailParts[1]?.split('.') ?? [];

  return (
    emailParts.length === 2 &&
    emailParts[0].length > 0 &&
    domainParts.every((part) => part.length > 0) &&
    domainParts.slice(-2).join('.') === WIPRO_EMAIL_DOMAIN
  );
}
