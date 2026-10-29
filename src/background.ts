import { openPaperTab } from './navigation';
import { registerContextMenu } from './context-menu';
import { handleOpenMessage } from './messages';

registerContextMenu();

chrome.runtime.onMessage.addListener(handleOpenMessage);

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
