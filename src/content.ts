import { buildArxivUrl, getPaperId, isReadingFormat, parsePaperUrl, type Paper, type ReadingFormat } from './paper';
import { formatLabel, localize, resolveLocale, translate, type MessageKey } from './i18n';
import { DEFAULT_PREFERENCES, getPreferences, normalizePreferences, type Preferences } from './settings';

const host = document.createElement('div');
host.id = 'back-to-arxiv-root';
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `
  <style>
    :host { all: initial; position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; color-scheme: light; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .dock { display: flex; align-items: center; max-width: calc(100vw - 32px); padding: 5px; background: #fffdf8; border: 1px solid #e4dcd2; border-radius: 15px; box-shadow: 0 5px 24px #30241d20, 0 1px 3px #30241d10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    a { display: flex; align-items: center; flex: 1; min-width: 0; gap: 11px; min-height: 44px; padding: 6px 14px 6px 11px; border-radius: 10px; background: #933c35; color: #fffaf3; text-decoration: none; transition: background 120ms ease; }
    a:hover { background: #7d302b; }
    .words { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
    .label { font-size: 13px; font-weight: 650; line-height: 18px; }
    .detail { font-size: 10px; line-height: 14px; letter-spacing: .2px; color: #f2d6cd; overflow-wrap: anywhere; }
    svg { display: block; flex: none; }
    button { display: grid; place-items: center; flex: none; width: 42px; height: 44px; padding: 0; border: 0; border-radius: 10px; background: transparent; color: #745e52; cursor: pointer; }
    button:hover { background: #f2eae0; color: #933c35; }
    button:disabled { opacity: .5; cursor: default; }
    .copy-toggle { width: 28px; }
    a:focus-visible, button:focus-visible { outline: 3px solid #ba7864; outline-offset: 3px; }
    .copy-menu { position: absolute; right: 0; bottom: calc(100% + 8px); width: 250px; max-width: calc(100vw - 32px); padding: 5px; border: 1px solid #e4dcd2; border-radius: 10px; background: #fffdf8; box-shadow: 0 5px 20px #30241d24; }
    .copy-menu button { display: block; width: 100%; height: auto; min-height: 36px; padding: 8px 10px; border-radius: 6px; text-align: left; font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .copy-menu button:focus-visible { outline-offset: -2px; }
    .status { position: absolute; right: 0; bottom: calc(100% + 8px); width: max-content; max-width: min(320px, calc(100vw - 32px)); background: #fffdf8; border: 1px solid #e4dcd2; padding: 8px 12px; border-radius: 9px; box-shadow: 0 3px 14px #30241d12; color: #584539; font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .status:empty { display: none; }
    @media (max-width: 600px) { :host { right: 16px; bottom: 16px; } }
    @media (prefers-reduced-motion: reduce) { a { transition: none; } }
  </style>
  <div class="dock" role="group" aria-label="Back to arXiv" data-i18n-aria-label="extName">
    <a aria-label="Open arXiv" data-i18n-aria-label="openArxiv">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="words"><span class="label" data-i18n="openArxiv">Open arXiv</span><span class="detail"></span></span>
    </a>
    <button id="copy-link" type="button" aria-label="Copy original link" title="Copy arXiv abstract link" data-i18n-aria-label="copyLink" data-i18n-title="dockCopyTitle">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="1.6"/></svg>
    </button>
    <button id="copy-menu-toggle" class="copy-toggle" type="button" aria-label="More copy formats" data-i18n-aria-label="copyFormats" aria-haspopup="menu" aria-controls="copy-menu" aria-expanded="false">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 12 4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
  <div id="copy-menu" class="copy-menu" role="menu" aria-label="Copy link format" data-i18n-aria-label="copyFormatMenu" hidden>
    <button id="copy-abs" type="button" role="menuitem" tabindex="-1" data-copy-format="abs" data-i18n="copyAbsLink">Copy abstract link</button>
    <button id="copy-pdf" type="button" role="menuitem" tabindex="-1" data-copy-format="pdf" data-i18n="copyPdfLink">Copy PDF link</button>
    <button id="copy-html" type="button" role="menuitem" tabindex="-1" data-copy-format="html" data-i18n="copyHtmlLink">Copy HTML link (experimental)</button>
  </div>
  <div class="status" role="status" aria-live="polite"></div>
`;

const openLink = shadow.querySelector<HTMLAnchorElement>('a')!;
const detail = shadow.querySelector<HTMLSpanElement>('.detail')!;
const copyButton = shadow.querySelector<HTMLButtonElement>('#copy-link')!;
const copyMenuToggle = shadow.querySelector<HTMLButtonElement>('#copy-menu-toggle')!;
const copyMenu = shadow.querySelector<HTMLDivElement>('#copy-menu')!;
const copyMenuItems = Array.from(copyMenu.querySelectorAll<HTMLButtonElement>('[data-copy-format]'));
const status = shadow.querySelector<HTMLDivElement>('.status')!;
let preferences: Preferences = { ...DEFAULT_PREFERENCES };
let currentPaper: Paper | null = null;
let lastUrl = '';
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let statusMessage: MessageKey | null = null;
let copying = false;

function announce(message: MessageKey): void {
  clearTimeout(statusTimer);
  statusMessage = message;
  status.textContent = translate(message, preferences.language);
  statusTimer = setTimeout(() => { statusMessage = null; status.textContent = ''; }, 2600);
}

function render(): void {
  const nextUrl = location.href;
  if (nextUrl !== lastUrl) {
    closeCopyMenu();
    statusMessage = null;
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
  localize(shadow, preferences.language);
  host.lang = resolveLocale(preferences.language).replace('_', '-');
  if (statusMessage) status.textContent = translate(statusMessage, preferences.language);
  openLink.href = buildArxivUrl(currentPaper, preferences.format, preferences.version);
  openLink.target = preferences.openInNewTab ? '_blank' : '_self';
  openLink.rel = 'noopener noreferrer';
  const label = formatLabel(preferences.format, preferences.language);
  openLink.title = translate(preferences.openInNewTab ? 'dockOpenNew' : 'dockOpenCurrent', preferences.language, [label]);
  detail.textContent = `${getPaperId(currentPaper, preferences.version)} · ${label}${preferences.version === 'latest' ? ` · ${translate('versionLatest', preferences.language)}` : ''}`;
  copyButton.disabled = copying;
  copyMenuToggle.disabled = copying;
  if (!host.isConnected) document.documentElement.append(host);
}

openLink.addEventListener('click', (event) => {
  closeCopyMenu();
  render();
  if (currentPaper === null) event.preventDefault();
});
openLink.addEventListener('auxclick', (event) => {
  closeCopyMenu();
  render();
  if (currentPaper === null) event.preventDefault();
});

function closeCopyMenu(restoreFocus = false): void {
  copyMenu.hidden = true;
  copyMenuToggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus && copyMenuToggle.disabled === false && host.isConnected) copyMenuToggle.focus();
}

function openCopyMenu(last = false): void {
  render();
  if (currentPaper === null || copying) return;
  clearTimeout(statusTimer);
  statusMessage = null;
  status.textContent = '';
  copyMenu.hidden = false;
  copyMenuToggle.setAttribute('aria-expanded', 'true');
  copyMenuItems[last ? copyMenuItems.length - 1 : 0]?.focus();
}

copyMenuToggle.addEventListener('click', () => {
  if (copyMenu.hidden) openCopyMenu();
  else closeCopyMenu(true);
});
copyMenuToggle.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    openCopyMenu(event.key === 'ArrowUp');
  }
});
copyMenu.addEventListener('keydown', (event) => {
  const current = copyMenuItems.indexOf(shadow.activeElement as HTMLButtonElement);
  let next: number;
  if (event.key === 'ArrowDown') next = (current + 1) % copyMenuItems.length;
  else if (event.key === 'ArrowUp') next = (current + copyMenuItems.length - 1) % copyMenuItems.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = copyMenuItems.length - 1;
  else if (event.key === 'Tab') { closeCopyMenu(); return; }
  else return;
  event.preventDefault();
  copyMenuItems[next]?.focus();
});
shadow.addEventListener('keydown', (event) => {
  if (event instanceof KeyboardEvent && event.key === 'Escape' && copyMenu.hidden === false) {
    event.preventDefault();
    event.stopPropagation();
    closeCopyMenu(true);
  }
});
document.addEventListener('pointerdown', (event) => {
  if (event.composedPath().includes(host) === false) closeCopyMenu();
});
document.addEventListener('focusin', (event) => {
  const path = event.composedPath();
  if (path.includes(copyMenu) === false && path.includes(copyMenuToggle) === false) closeCopyMenu();
});

async function copyLink(format: ReadingFormat): Promise<void> {
  const paper = parsePaperUrl(location.href);
  if (paper?.source !== 'alphaxiv' || copying) return;
  const fromMenu = copyMenu.hidden === false;
  closeCopyMenu();
  copying = true;
  render();
  try {
    await navigator.clipboard.writeText(buildArxivUrl(paper, format, preferences.version));
    announce('dockCopySucceeded');
  } catch {
    announce('dockCopyFailed');
  } finally {
    copying = false;
    render();
    if (fromMenu && (document.activeElement === document.body || copyMenu.contains(shadow.activeElement))) {
      copyMenuToggle.focus();
    }
  }
}

copyButton.addEventListener('click', () => { void copyLink('abs'); });
for (const item of copyMenuItems) {
  item.addEventListener('click', () => {
    if (isReadingFormat(item.dataset.copyFormat)) void copyLink(item.dataset.copyFormat);
  });
}

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
  console.info(`Back to arXiv: ${translate('reloadExtension', preferences.language)}`, error);
});
