import { NavigationError, openPaperTab } from './navigation';
import { translate } from './i18n';
import { DEFAULT_PREFERENCES, getPreferences } from './settings';
import { registerContextMenu } from './context-menu';

registerContextMenu();

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Navigation requests originate in this extension's popup.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html') || typeof message !== 'object' || message === null) {
    return;
  }
  const request = message as Record<string, unknown>;
  if (request.type !== 'OPEN_ARXIV' || typeof request.tabId !== 'number' || !Number.isInteger(request.tabId)) {
    return;
  }
  void (async () => {
    try {
      const tab = await chrome.tabs.get(request.tabId as number);
      await openPaperTab(tab);
      sendResponse({ ok: true });
    } catch (error) {
      const preferences = await getPreferences().catch(() => DEFAULT_PREFERENCES);
      sendResponse({ ok: false, error: error instanceof NavigationError ? error.message : translate('openFailed', preferences.language) });
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'open-arxiv') return;
  void (async () => {
    const activeTab = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (activeTab) await openPaperTab(activeTab);
  })().catch((error: unknown) => {
    // The popup explains supported pages and exposes the same action.
    console.info('Back to arXiv:', error instanceof Error ? error.message : error);
  });
});
