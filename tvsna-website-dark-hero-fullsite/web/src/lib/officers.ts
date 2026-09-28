/*
  Shared helpers for rendering office bearers, so the card and the profile
  page agree on how a name is shown when only some fields are known.
*/

export interface OfficerLike {
  name: string;
  honorific?: string;
  city?: string;
  state?: string;
  country?: string;
  nativePlace?: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  IN: 'India',
};

/** "Dr Nandeesh Rangaswamy" — the honorific is stored separately. */
export function displayName(d: OfficerLike): string {
  return d.honorific ? `${d.honorific} ${d.name}` : d.name;
}

/**
 * Initials for the monogram, from the name only — the honorific is excluded
 * deliberately, or "Dr Nandeesh Rangaswamy" would read as "DN" rather than
 * "NR". A single-word name gives a single letter.
 */
export function initialsFor(name: string): string {
  const letters = name
    .split(/[\s-]+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase());
  if (letters.length === 0) return 'VM';
  return letters.length === 1 ? letters[0] : letters[0] + letters[letters.length - 1];
}

/** "Dallas, TX" · "Toronto" · "India" — whatever is actually known. */
export function whereLine(d: OfficerLike): string | null {
  const local = [d.city, d.state].filter(Boolean).join(', ');
  if (local) return local;
  if (d.country) return COUNTRY_NAMES[d.country] ?? d.country;
  return null;
}

/** Fields the committee still needs to supply, for the editor's checklist. */
export function missingFields(d: Record<string, unknown>): string[] {
  const wanted: [string, string][] = [
    ['city', 'city'],
    ['state', 'state or province'],
    ['country', 'country'],
    ['nativePlace', 'native place'],
    ['profession', 'profession'],
    ['bioShort', 'short bio'],
  ];
  return wanted.filter(([key]) => !d[key]).map(([, label]) => label);
}
