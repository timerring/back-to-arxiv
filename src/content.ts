import { buildArxivUrl, parsePaperUrl, READING_FORMAT_LABELS, type Paper } from './paper';
import { DEFAULT_PREFERENCES, getPreferences, normalizePreferences, type Preferences } from './settings';

const host = document.createElement('div');
host.id = 'back-to-arxiv-root';
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `
  <style>
    :host { all: initial; position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; color-scheme: light; }
    * { box-sizing: border-box; }
    .dock { display: flex; align-items: center; padding: 5px; background: #fffdf8; border: 1px solid #e4dcd2; border-radius: 15px; box-shadow: 0 5px 24px #30241d20, 0 1px 3px #30241d10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    a { display: flex; align-items: center; gap: 11px; min-height: 44px; padding: 6px 14px 6px 11px; border-radius: 10px; background: #933c35; color: #fffaf3; text-decoration: none; transition: background 120ms ease; }
    a:hover { background: #7d302b; }
    .words { display: flex; flex-direction: column; gap: 2px; }
    .label { font-size: 13px; font-weight: 650; line-height: 18px; }
    .detail { font-size: 10px; line-height: 14px; letter-spacing: .2px; color: #f2d6cd; }
    svg { display: block; flex: none; }
    button { display: grid; place-items: center; flex: none; width: 42px; height: 44px; padding: 0; border: 0; border-radius: 10px; background: transparent; color: #745e52; cursor: pointer; }
    button:hover { background: #f2eae0; color: #933c35; }
    a:focus-visible, button:focus-visible { outline: 3px solid #ba7864; outline-offset: 3px; }
    .status { position: absolute; right: 0; bottom: calc(100% + 8px); width: max-content; max-width: min(320px, calc(100vw - 32px)); background: #fffdf8; border: 1px solid #e4dcd2; padding: 8px 12px; border-radius: 9px; box-shadow: 0 3px 14px #30241d12; color: #584539; font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .status:empty { display: none; }
    @media (max-width: 600px) { :host { right: 16px; bottom: 16px; } }
    @media (prefers-reduced-motion: reduce) { a { transition: none; } }
  </style>
  <div class="dock" role="group" aria-label="Back to arXiv">
    <a aria-label="打开 arXiv">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="words"><span class="label">打开 arXiv</span><span class="detail"></span></span>
    </a>
    <button type="button" aria-label="复制原文链接" title="复制 arXiv 摘要链接">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="1.6"/></svg>
    </button>
  </div>
  <div class="status" role="status" aria-live="polite"></div>
`;

const openLink = shadow.querySelector<HTMLAnchorElement>('a')!;
const detail = shadow.querySelector<HTMLSpanElement>('.detail')!;
const copyButton = shadow.querySelector<HTMLButtonElement>('button')!;
const status = shadow.querySelector<HTMLDivElement>('.status')!;
let preferences: Preferences = { ...DEFAULT_PREFERENCES };
let currentPaper: Paper | null = null;
let lastUrl = '';
let statusTimer: ReturnType<typeof setTimeout> | undefined;

function announce(message: string): void {
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = setTimeout(() => { status.textContent = ''; }, 2600);
}

function render(): void {
  const nextUrl = location.href;
  if (nextUrl !== lastUrl) {
    status.textContent = '';
    clearTimeout(statusTimer);
  }
  lastUrl = nextUrl;
  currentPaper = parsePaperUrl(nextUrl);
  if (currentPaper?.source !== 'alphaxiv') {
    currentPaper = null;
    host.remove();
    return;
  }
  openLink.href = buildArxivUrl(currentPaper, preferences.format);
  openLink.target = preferences.openInNewTab ? '_blank' : '_self';
  openLink.rel = 'noopener noreferrer';
  const formatLabel = READING_FORMAT_LABELS[preferences.format];
  openLink.title = `在${preferences.openInNewTab ? '新' : '当前'}标签页打开 arXiv ${formatLabel}`;
  detail.textContent = `${currentPaper.id} · ${formatLabel}`;
  if (!host.isConnected) document.documentElement.append(host);
}

openLink.addEventListener('click', (event) => {
  render();
  if (currentPaper === null) event.preventDefault();
});
openLink.addEventListener('auxclick', (event) => {
  render();
  if (currentPaper === null) event.preventDefault();
});

copyButton.addEventListener('click', () => {
  const paper = parsePaperUrl(location.href);
  if (paper === null) return;
  void navigator.clipboard.writeText(buildArxivUrl(paper, 'abs'))
    .then(() => announce('已复制 arXiv 原文链接'))
    .catch(() => announce('复制失败，请在浏览器插件面板中重试。'));
});

async function start(): Promise<void> {
  preferences = await getPreferences();
  render();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.preferences) {
      preferences = normalizePreferences(changes.preferences.newValue);
      render();
    }
  });

  // Browser navigation events also cover pushState/replaceState in alphaXiv's SPA.
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  navigation?.addEventListener('currententrychange', render);
  window.addEventListener('popstate', render);
  window.addEventListener('hashchange', render);
  window.addEventListener('pageshow', render);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });

  // Restore the control when the site's render replaces its containing DOM.
  new MutationObserver(() => {
    if (location.href !== lastUrl || (currentPaper !== null && !host.isConnected)) render();
  }).observe(document.documentElement, { childList: true, subtree: true });
}

void start().catch((error: unknown) => {
  console.info('Back to arXiv: 请刷新页面以重新加载插件。', error);
});
