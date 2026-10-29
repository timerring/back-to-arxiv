import { buildArxivUrl, parsePaperUrl } from './paper';
import { getPreferences } from './settings';
import { translate } from './i18n';

export class NavigationError extends Error {}

export async function openPaperTab(tab: chrome.tabs.Tab): Promise<void> {
  const preferences = await getPreferences();
  if (typeof tab.id !== 'number') {
    throw new NavigationError(translate('invalidTab', preferences.language));
  }
  const currentTab = await chrome.tabs.get(tab.id);
  const paper = parsePaperUrl(currentTab.pendingUrl ?? currentTab.url ?? '');
  if (paper === null) {
    throw new NavigationError(translate('unsupportedPage', preferences.language));
  }
  const url = buildArxivUrl(paper, preferences.format);
  if (preferences.openInNewTab) {
    await chrome.tabs.create({ url, active: true, openerTabId: tab.id, index: currentTab.index + 1, windowId: currentTab.windowId });
  } else {
    await chrome.tabs.update(tab.id, { url });
  }
}
