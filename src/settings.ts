import { isReadingFormat, type ReadingFormat } from './paper';

export interface Preferences {
  format: ReadingFormat;
  openInNewTab: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  format: 'abs',
  openInNewTab: false,
});

export function normalizePreferences(value: unknown): Preferences {
  const record = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {};
  return {
    format: isReadingFormat(record.format) ? record.format : DEFAULT_PREFERENCES.format,
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
