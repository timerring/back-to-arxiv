import { buildArxivUrl, parsePaperUrl } from './paper';
import { getPreferences } from './settings';

export async function openPaperTab(tab: chrome.tabs.Tab): Promise<void> {
  if (typeof tab.id !== 'number') {
    throw new Error('请重新打开插件后重试。');
  }
  const preferences = await getPreferences();
  const currentTab = await chrome.tabs.get(tab.id);
  const paper = parsePaperUrl(currentTab.pendingUrl ?? currentTab.url ?? '');
  if (paper === null) {
    throw new Error('请先打开一篇 alphaXiv 或 arXiv 论文。');
  }
  const url = buildArxivUrl(paper, preferences.format);
  if (preferences.openInNewTab) {
    await chrome.tabs.create({ url, active: true, openerTabId: tab.id, index: currentTab.index + 1, windowId: currentTab.windowId });
  } else {
    await chrome.tabs.update(tab.id, { url });
  }
}
