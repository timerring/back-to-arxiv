import { translate } from './i18n';
import { buildSearchPageUrl, normalizeSearchQuery } from './search';
import { DEFAULT_PREFERENCES, getPreferences } from './settings';

type SearchOpenResponse = { ok: true } | { ok: false; error: string };

/** Search text stays in a local fragment, and the source page remains available. */
export async function openSearchPage(query: string, sourceTab?: chrome.tabs.Tab): Promise<void> {
  const url = buildSearchPageUrl(chrome.runtime.getURL('search.html'), query);
  const source = typeof sourceTab?.id === 'number'
    ? await chrome.tabs.get(sourceTab.id).catch(() => undefined)
    : undefined;
  const position = typeof source?.id === 'number'
    ? { openerTabId: source.id, index: source.index + 1, windowId: source.windowId }
    : {};
  try {
    await chrome.tabs.create({ url, active: true, ...position });
  } catch (error) {
    // A source can also close between the lookup and tab creation.
    if (typeof source?.id !== 'number' || await chrome.tabs.get(source.id).catch(() => undefined) !== undefined) throw error;
    await chrome.tabs.create({ url, active: true });
  }
}

/** Only the popup can launch a search from an explicit user entry. */
export function handleSearchOpenMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: SearchOpenResponse) => void,
): true | undefined {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')
    || typeof message !== 'object' || message === null) return;
  const request = message as Record<string, unknown>;
  if (request.type !== 'OPEN_ARXIV_SEARCH') return;
  const query = normalizeSearchQuery(request.query);
  const tabId = request.tabId;
  if (query === null || (tabId !== undefined
    && (typeof tabId !== 'number' || !Number.isSafeInteger(tabId) || tabId < 0))) return;

  void (async () => {
    try {
      const source = typeof tabId === 'number' ? await chrome.tabs.get(tabId).catch(() => undefined) : undefined;
      await openSearchPage(query, source);
      sendResponse({ ok: true });
    } catch {
      const preferences = await getPreferences().catch(() => DEFAULT_PREFERENCES);
      sendResponse({ ok: false, error: translate('openFailed', preferences.language) });
    }
  })();
  return true;
}
