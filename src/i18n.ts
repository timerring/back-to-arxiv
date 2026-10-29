import english from '../public/_locales/en/messages.json';
import chinese from '../public/_locales/zh_CN/messages.json';
import type { ReadingFormat } from './paper';

export type Locale = 'en' | 'zh_CN';
export type LanguagePreference = Locale | 'auto';
export type MessageKey = keyof typeof english;

const catalogs = { en: english, zh_CN: chinese };

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'en' || value === 'zh_CN' || value === 'auto';
}

export function resolveLocale(language: LanguagePreference, uiLanguage?: string): Locale {
  if (language === 'en' || language === 'zh_CN') return language;
  const browserLanguage = uiLanguage ?? globalThis.chrome?.i18n?.getUILanguage?.() ?? 'en';
  const normalized = browserLanguage.replaceAll('_', '-').toLowerCase();
  return normalized === 'zh' || /^zh-(cn|sg|hans)(-|$)/.test(normalized) ? 'zh_CN' : 'en';
}

/** Chrome message catalogs are the single source for manifest and runtime text. */
export function translate(
  key: MessageKey,
  language: LanguagePreference = 'en',
  substitutions: string[] = [],
): string {
  const message = catalogs[resolveLocale(language)][key]?.message ?? english[key].message;
  return message.replace(/\$(\$|[1-9])/g, (_match, token: string) =>
    token === '$' ? '$' : substitutions[Number(token) - 1] ?? '',
  );
}

export function formatLabel(format: ReadingFormat, language: LanguagePreference): string {
  const keys = { abs: 'formatAbs', pdf: 'formatPdf', html: 'formatHtml' } as const;
  return translate(keys[format], language);
}

/** Apply translations as text or attributes, preserving icons and other markup. */
export function localize(root: ParentNode, language: LanguagePreference): void {
  for (const [marker, attribute] of [
    ['data-i18n', null],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
  ] as const) {
    for (const node of root.querySelectorAll<HTMLElement>(`[${marker}]`)) {
      const key = node.getAttribute(marker)!;
      if (Object.hasOwn(english, key) === false) throw new Error(`Unknown translation key: ${key}`);
      const message = translate(key as MessageKey, language);
      if (attribute === null) node.textContent = message;
      else node.setAttribute(attribute, message);
    }
  }
}
