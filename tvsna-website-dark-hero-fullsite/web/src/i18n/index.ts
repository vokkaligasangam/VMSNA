/*
  Translation scaffolding.

  The decision was English now, structured so Tamil becomes content work
  rather than a rebuild. So the plumbing is here — locale typing, a lookup
  with a fallback, and a place for the strings — but no /ta/ routes are
  generated and no language switcher is shown.

  That is deliberate. A half-translated site reads worse than an English one:
  a visitor who switches to Tamil and lands on English body copy concludes the
  site is broken, not that translation is in progress. Tamil goes live when a
  locale is complete, which `missingKeys()` below makes checkable.

  To add Tamil:
    1. Fill in the `ta` dictionary.
    2. Run the coverage check; it must be complete.
    3. Add `i18n: { defaultLocale: 'en', locales: ['en','ta'] }` to
       astro.config.mjs and move pages under src/pages/[locale]/.
    4. Turn on the switcher in SiteHeader.
*/

export const LOCALES = ['en', 'ta'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Locales complete enough to be offered to visitors. */
export const ENABLED_LOCALES: Locale[] = ['en'];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ta: 'தமிழ்',
};

/**
 * Shared UI strings. Page body copy stays in the pages and in content
 * collections; this is for chrome that appears everywhere.
 */
const en = {
  'nav.about': 'About',
  'nav.leadership': 'Leadership',
  'nav.chapters': 'Chapters',
  'nav.events': 'Events',
  'nav.media': 'Media',
  'nav.support': 'Support',
  'nav.donate': 'Donate',
  'nav.contact': 'Contact',
  'nav.menu': 'Menu',
  'nav.skip': 'Skip to content',

  'auth.login': 'Member log in',
  'auth.join': 'Join VMSNA',
  'auth.account': 'My account',
  'auth.signout': 'Sign out',
  'auth.directory': 'Directory',

  'gate.pendingTitle': 'Your application is being reviewed',
  'gate.unpaidTitle': 'Activate your membership',
  'gate.guestTitle': 'This is for members',

  'footer.blurb':
    'A volunteer-run, non-profit community of Tamil Nadu Vokkaliga families across the United States, Canada and India.',
  'footer.rights': 'All rights reserved.',

  'common.readMore': 'Read more',
  'common.loading': 'Loading…',
  'common.required': 'required',
  'common.optional': 'optional',
} as const;

export type StringKey = keyof typeof en;

/** Tamil. Empty entries fall back to English, so partial work is safe. */
const ta: Partial<Record<StringKey, string>> = {
  // 'nav.about': 'எங்களைப் பற்றி',
};

const dictionaries: Record<Locale, Partial<Record<StringKey, string>>> = { en, ta };

/** Look up a string, falling back to English rather than rendering a key. */
export function t(key: StringKey, locale: Locale = DEFAULT_LOCALE): string {
  return dictionaries[locale]?.[key] ?? en[key] ?? key;
}

/** Bind a locale once, for use through a page. */
export function useTranslations(locale: Locale = DEFAULT_LOCALE) {
  return (key: StringKey) => t(key, locale);
}

/** Which keys a locale is still missing — the gate for enabling it. */
export function missingKeys(locale: Locale): StringKey[] {
  const dict = dictionaries[locale] ?? {};
  return (Object.keys(en) as StringKey[]).filter((k) => !dict[k]);
}

export function coverage(locale: Locale): number {
  const total = Object.keys(en).length;
  return Math.round(((total - missingKeys(locale).length) / total) * 100);
}

/** Extract a locale from a path such as /ta/about/. */
export function localeFromPath(pathname: string): Locale {
  const seg = pathname.split('/').filter(Boolean)[0];
  return (LOCALES as readonly string[]).includes(seg) ? (seg as Locale) : DEFAULT_LOCALE;
}
