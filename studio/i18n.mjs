import en from './locales/en.json' with { type: 'json' };
import hi from './locales/hi.json' with { type: 'json' };

export const supportedLocales = Object.freeze(['en', 'hi']);
export const catalogs = Object.freeze({ en, hi });

export function normalizeLocale(value) {
  const tag = String(value ?? '').trim().replaceAll('_', '-').toLowerCase();
  if (!tag) return 'en';
  const base = tag.split('-')[0];
  return supportedLocales.includes(base) ? base : 'en';
}

export function translate(key, locale = 'en', vars = {}) {
  const lang = normalizeLocale(locale);
  const template = catalogs[lang][key] ?? catalogs.en[key] ?? key;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match
  );
}

export function missingTranslations() {
  return Object.keys(catalogs.en).filter(key => !(key in catalogs.hi));
}
