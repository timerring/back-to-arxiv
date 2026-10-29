import { isReadingFormat } from './paper';
import { NavigationError, openPaperInput, openPaperTab } from './navigation';
import { translate } from './i18n';
import { DEFAULT_PREFERENCES, getPreferences } from './settings';

type OpenResponse = { ok: true } | { ok: false; error: string };

/** Keep arbitrary input and format overrides inside the trusted popup boundary. */
export function handleOpenMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: OpenResponse) => void,
): true | undefined {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html') || typeof message !== 'object' || message === null) {
    return;
  }
  const request = message as Record<string, unknown>;
  if (request.type !== 'OPEN_ARXIV' && request.type !== 'OPEN_INPUT_ARXIV') return;
  if (request.format !== undefined && isReadingFormat(request.format) === false) return;
  const tabId = request.tabId;
  if (tabId !== undefined && (typeof tabId !== 'number' || Number.isInteger(tabId) === false || tabId < 0)) return;
  if (request.type === 'OPEN_ARXIV' && tabId === undefined) return;
  if (request.type === 'OPEN_INPUT_ARXIV' && typeof request.input !== 'string') return;
  const format = isReadingFormat(request.format) ? request.format : undefined;

  void (async () => {
    try {
      if (request.type === 'OPEN_INPUT_ARXIV') {
        const tab = typeof tabId === 'number' ? await chrome.tabs.get(tabId).catch(() => undefined) : undefined;
        await openPaperInput(request.input as string, tab, format);
      } else {
        const tab = await chrome.tabs.get(tabId as number);
        await openPaperTab(tab, format);
      }
      sendResponse({ ok: true });
    } catch (error) {
      const preferences = await getPreferences().catch(() => DEFAULT_PREFERENCES);
      sendResponse({ ok: false, error: error instanceof NavigationError ? error.message : translate('openFailed', preferences.language) });
    }
  })();
  return true;
}
