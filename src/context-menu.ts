import { translate } from './i18n';
import { openPaperLink } from './navigation';
import { getPreferences } from './settings';

export const PAPER_LINK_MENU_ID = 'back-to-arxiv-open-link';

export const PAPER_LINK_PATTERNS = [
  ...['alphaxiv.org', 'www.alphaxiv.org'].flatMap((host) =>
    ['abs', 'pdf', 'html', 'overview'].map((route) => `*://${host}/${route}/*`)),
  ...['arxiv.org', 'www.arxiv.org'].flatMap((host) =>
    ['abs', 'pdf', 'html'].map((route) => `*://${host}/${route}/*`)),
];

function reportFailure(error: unknown): void {
  console.info('Back to arXiv:', error instanceof Error ? error.message : error);
}

/** Chrome retains menu items across service-worker lifetimes. Update or create one item. */
async function updateContextMenu(): Promise<void> {
  const preferences = await getPreferences();
  const properties: chrome.contextMenus.CreateProperties = {
    id: PAPER_LINK_MENU_ID,
    title: translate('contextMenuOpen', preferences.language),
    contexts: ['link'],
    targetUrlPatterns: [...PAPER_LINK_PATTERNS],
  };

  await new Promise<void>((resolve, reject) => {
    const { id: _id, ...update } = properties;
    chrome.contextMenus.update(PAPER_LINK_MENU_ID, update, () => {
      if (chrome.runtime.lastError === undefined) {
        resolve();
        return;
      }
      chrome.contextMenus.create(properties, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message ?? 'Creating the paper-link menu failed.'));
        else resolve();
      });
    });
  });
}

/** Register event handlers synchronously so Chrome can wake this worker for them. */
export function registerContextMenu(): () => Promise<void> {
  let queue: Promise<void> = Promise.resolve();
  const refresh = (): Promise<void> => {
    const operation = queue.then(updateContextMenu);
    queue = operation.catch(reportFailure);
    return operation;
  };
  const requestRefresh = (): void => { void refresh().catch(() => undefined); };

  chrome.runtime.onInstalled.addListener(requestRefresh);
  chrome.runtime.onStartup.addListener(requestRefresh);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.preferences) requestRefresh();
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === PAPER_LINK_MENU_ID && typeof info.linkUrl === 'string') {
      void openPaperLink(info.linkUrl, tab).catch(reportFailure);
    }
  });
  requestRefresh();
  return refresh;
}
