import { buildArxivUrl, parsePaperInput, parsePaperUrl, type Paper, type ReadingFormat } from './paper';
import { getPreferences, type Preferences } from './settings';
import { translate } from './i18n';

export class NavigationError extends Error {}

export async function openPaperTab(tab: chrome.tabs.Tab, format?: ReadingFormat): Promise<void> {
  const preferences = await getPreferences();
  if (typeof tab.id !== 'number') {
    throw new NavigationError(translate('invalidTab', preferences.language));
  }
  const currentTab = await chrome.tabs.get(tab.id);
  const paper = parsePaperUrl(currentTab.pendingUrl ?? currentTab.url ?? '');
  if (paper === null) {
    throw new NavigationError(translate('unsupportedPage', preferences.language));
  }
  const url = buildArxivUrl(paper, format ?? preferences.format, preferences.version);
  if (preferences.openInNewTab) {
    await chrome.tabs.create({ url, active: true, openerTabId: tab.id, index: currentTab.index + 1, windowId: currentTab.windowId });
  } else {
    await chrome.tabs.update(tab.id, { url });
  }
}

/** A context-menu link opens beside its source, keeping that source available. */
export async function openPaperLink(linkUrl: string, sourceTab?: chrome.tabs.Tab): Promise<void> {
  const preferences = await getPreferences();
  const paper = parsePaperUrl(linkUrl);
  if (paper === null) {
    throw new NavigationError(translate('unsupportedPage', preferences.language));
  }
  await createPaperTab(paper, preferences, sourceTab);
}

/** Explicit input always preserves the page the user started from. */
export async function openPaperInput(input: string, sourceTab?: chrome.tabs.Tab, format?: ReadingFormat): Promise<void> {
  const preferences = await getPreferences();
  const paper = parsePaperInput(input);
  if (paper === null) {
    throw new NavigationError(translate('invalidPaperInput', preferences.language));
  }
  await createPaperTab(paper, preferences, sourceTab, format);
}

async function createPaperTab(paper: Paper, preferences: Preferences, sourceTab?: chrome.tabs.Tab, format?: ReadingFormat): Promise<void> {
  const url = buildArxivUrl(paper, format ?? preferences.format, preferences.version);
  const source = typeof sourceTab?.id === 'number'
    ? await chrome.tabs.get(sourceTab.id).catch(() => undefined)
    : undefined;
  const position = typeof source?.id === 'number'
    ? { openerTabId: source.id, index: source.index + 1, windowId: source.windowId }
    : {};
  await chrome.tabs.create({ url, active: true, ...position });
}
