import { isPaperVersion, isReadingFormat, type PaperVersion, type ReadingFormat } from './paper';
import { isLanguagePreference, type LanguagePreference } from './i18n';

export interface Preferences {
  format: ReadingFormat;
  version: PaperVersion;
  openInNewTab: boolean;
  language: LanguagePreference;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  format: 'abs',
  version: 'current',
  openInNewTab: false,
  language: 'en',
});

export function normalizePreferences(value: unknown): Preferences {
  const record = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {};
  return {
    language: isLanguagePreference(record.language) ? record.language : DEFAULT_PREFERENCES.language,
    format: isReadingFormat(record.format) ? record.format : DEFAULT_PREFERENCES.format,
    version: isPaperVersion(record.version) ? record.version : DEFAULT_PREFERENCES.version,
    openInNewTab: typeof record.openInNewTab === 'boolean'
      ? record.openInNewTab
      : DEFAULT_PREFERENCES.openInNewTab,
  };
}

export async function getPreferences(): Promise<Preferences> {
  const stored = await chrome.storage.local.get('preferences');
  return normalizePreferences(stored.preferences);
}

export async function savePreferences(patch: Partial<Preferences>): Promise<void> {
  const current = await getPreferences();
  await chrome.storage.local.set({ preferences: normalizePreferences({ ...current, ...patch }) });
}
