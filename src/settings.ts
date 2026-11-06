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

// Keep the two layout choices independent. A drag in a paper tab can finish
// while the popup saves the display mode or a reading preference.
export interface ToolbarPosition { x: number; y: number; }
export interface ToolbarLayout { minimized: boolean; position: ToolbarPosition | null; }

export function normalizeToolbarPosition(value: unknown): ToolbarPosition | null {
  if (value === null || typeof value !== 'object' || !('x' in value) || !('y' in value)) return null;
  const { x, y } = value;
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1 ||
      typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > 1) return null;
  return { x, y };
}

export async function getToolbarLayout(): Promise<ToolbarLayout> {
  const values = await chrome.storage.local.get(['toolbarMinimized', 'toolbarPosition']);
  return {
    minimized: values.toolbarMinimized === true,
    position: normalizeToolbarPosition(values.toolbarPosition),
  };
}

export async function setToolbarMinimized(minimized: boolean): Promise<void> {
  if (minimized) await chrome.storage.local.set({ toolbarMinimized: true });
  else await chrome.storage.local.remove('toolbarMinimized');
}

export async function setToolbarPosition(position: ToolbarPosition | null): Promise<void> {
  if (position === null) {
    await chrome.storage.local.remove('toolbarPosition');
    return;
  }
  const normalized = normalizeToolbarPosition(position);
  if (normalized === null) throw new TypeError('Invalid toolbar position');
  await chrome.storage.local.set({ toolbarPosition: normalized });
}
