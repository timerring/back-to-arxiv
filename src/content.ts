import { buildArxivUrl, buildMarkdownLink, getPaperId, isReadingFormat, parsePaperUrl, type Paper, type ReadingFormat } from './paper';
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
    .open-actions { display: flex; flex: 1; min-width: 0; }
    .open-link { display: flex; align-items: center; flex: 1; min-width: 0; gap: 11px; min-height: 44px; padding: 6px 12px 6px 11px; border-radius: 10px 0 0 10px; background: #933c35; color: #fffaf3; text-decoration: none; transition: background 120ms ease; }
    .open-link:hover, .open-toggle:hover { background: #7d302b; color: #fffaf3; }
    .words { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
    .label { font-size: 13px; font-weight: 650; line-height: 18px; }
    .detail { font-size: 10px; line-height: 14px; letter-spacing: .2px; color: #f2d6cd; overflow-wrap: anywhere; }
    svg { display: block; flex: none; }
    button { display: grid; place-items: center; flex: none; width: 42px; height: 44px; padding: 0; border: 0; border-radius: 10px; background: transparent; color: #745e52; cursor: pointer; }
    button:hover { background: #f2eae0; color: #933c35; }
    button:disabled { opacity: .5; cursor: default; }
    .menu-toggle { width: 28px; }
    .open-toggle { align-self: stretch; height: auto; min-height: 44px; border-left: 1px solid #fffaf32b; border-radius: 0 10px 10px 0; background: #933c35; color: #fffaf3; }
    a:focus-visible, button:focus-visible { outline: 3px solid #ba7864; outline-offset: 3px; }
    .action-menu { position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 1; width: 250px; max-width: calc(100vw - 32px); max-height: calc(100dvh - 112px); overflow-y: auto; padding: 5px; border: 1px solid #e4dcd2; border-radius: 10px; background: #fffdf8; box-shadow: 0 5px 20px #30241d24; }
    .action-menu button, .action-menu a { display: block; width: 100%; height: auto; min-height: 36px; padding: 8px 10px; border-radius: 6px; text-align: left; text-decoration: none; color: #745e52; font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .action-menu a:hover { background: #f2eae0; color: #933c35; }
    .action-menu :focus-visible { outline-offset: -2px; }
    .status { position: absolute; right: 0; bottom: calc(100% + 8px); width: max-content; max-width: min(320px, calc(100vw - 32px)); background: #fffdf8; border: 1px solid #e4dcd2; padding: 8px 12px; border-radius: 9px; box-shadow: 0 3px 14px #30241d12; color: #584539; font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .status:empty { display: none; }
    @media (max-width: 600px) { :host { right: 16px; bottom: 16px; } }
    @media (prefers-reduced-motion: reduce) { a { transition: none; } }
  </style>
  <div class="dock" role="group" aria-label="Back to arXiv" data-i18n-aria-label="extName">
    <div class="open-actions">
      <a id="open-paper" class="open-link" aria-label="Open arXiv" data-i18n-aria-label="openArxiv">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="words"><span class="label" data-i18n="openArxiv">Open arXiv</span><span class="detail"></span></span>
      </a>
      <button id="open-menu-toggle" class="menu-toggle open-toggle" type="button" aria-label="Open once in another format" data-i18n-aria-label="openFormats" aria-haspopup="menu" aria-controls="open-menu" aria-expanded="false">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 12 4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <button id="copy-link" type="button" aria-label="Copy original link" title="Copy arXiv abstract link" data-i18n-aria-label="copyLink" data-i18n-title="dockCopyTitle">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="1.6"/></svg>
    </button>
    <button id="copy-menu-toggle" class="menu-toggle" type="button" aria-label="More copy formats" data-i18n-aria-label="copyFormats" aria-haspopup="menu" aria-controls="copy-menu" aria-expanded="false">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 12 4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
  <div id="open-menu" class="action-menu" role="menu" aria-label="Open once in another format" data-i18n-aria-label="openFormatMenu" hidden>
    <a id="open-abs" role="menuitem" tabindex="-1" data-open-format="abs" data-i18n="openAbsOnce">Open abstract once</a>
    <a id="open-pdf" role="menuitem" tabindex="-1" data-open-format="pdf" data-i18n="openPdfOnce">Open PDF once</a>
    <a id="open-html" role="menuitem" tabindex="-1" data-open-format="html" data-i18n="openHtmlOnce">Open HTML once (experimental)</a>
  </div>
  <div id="copy-menu" class="action-menu" role="menu" aria-label="Copy link format" data-i18n-aria-label="copyFormatMenu" hidden>
    <button id="copy-abs" type="button" role="menuitem" tabindex="-1" data-copy-format="abs" data-i18n="copyAbsLink">Copy abstract link</button>
    <button id="copy-pdf" type="button" role="menuitem" tabindex="-1" data-copy-format="pdf" data-i18n="copyPdfLink">Copy PDF link</button>
    <button id="copy-html" type="button" role="menuitem" tabindex="-1" data-copy-format="html" data-i18n="copyHtmlLink">Copy HTML link (experimental)</button>
    <button id="copy-markdown" type="button" role="menuitem" tabindex="-1" data-copy-format="markdown" data-i18n="copyMarkdownLink">Copy Markdown link</button>
  </div>
  <div class="status" role="status" aria-live="polite"></div>
`;

const openLink = shadow.querySelector<HTMLAnchorElement>('#open-paper')!;
const openFormatLinks = Array.from(shadow.querySelectorAll<HTMLAnchorElement>('[data-open-format]'));
const detail = shadow.querySelector<HTMLSpanElement>('.detail')!;
const copyButton = shadow.querySelector<HTMLButtonElement>('#copy-link')!;
const status = shadow.querySelector<HTMLDivElement>('.status')!;

interface ActionMenu {
  toggle: HTMLButtonElement;
  panel: HTMLDivElement;
  items: HTMLElement[];
}

function actionMenu(name: 'open' | 'copy'): ActionMenu {
  const panel = shadow.querySelector<HTMLDivElement>(`#${name}-menu`)!;
  return {
    toggle: shadow.querySelector<HTMLButtonElement>(`#${name}-menu-toggle`)!,
    panel,
    items: Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]')),
  };
}

const openMenu = actionMenu('open');
const copyMenu = actionMenu('copy');
const menus = [openMenu, copyMenu];
let preferences: Preferences = { ...DEFAULT_PREFERENCES };
let currentPaper: Paper | null = null;
let lastUrl = '';
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let statusMessage: MessageKey | null = null;
let copying = false;

type CopyFormat = ReadingFormat | 'markdown';

function clearStatus(): void {
  clearTimeout(statusTimer);
  statusMessage = null;
  status.textContent = '';
}

function announce(message: MessageKey): void {
  if (menus.some((menu) => menu.panel.hidden === false)) return;
  clearStatus();
  statusMessage = message;
  status.textContent = translate(message, preferences.language);
  statusTimer = setTimeout(clearStatus, 2600);
}

function updateLink(link: HTMLAnchorElement, paper: Paper, format: ReadingFormat): void {
  link.href = buildArxivUrl(paper, format, preferences.version);
  link.target = preferences.openInNewTab ? '_blank' : '_self';
  link.rel = 'noopener noreferrer';
}

function render(): void {
  const nextUrl = location.href;
  if (nextUrl !== lastUrl) {
    closeMenus();
    clearStatus();
  }
  lastUrl = nextUrl;
  currentPaper = parsePaperUrl(nextUrl);
  if (currentPaper?.source !== 'alphaxiv') {
    currentPaper = null;
    closeMenus();
    host.remove();
    return;
  }
  localize(shadow, preferences.language);
  host.lang = resolveLocale(preferences.language).replace('_', '-');
  if (statusMessage) status.textContent = translate(statusMessage, preferences.language);
  updateLink(openLink, currentPaper, preferences.format);
  for (const link of openFormatLinks) {
    if (isReadingFormat(link.dataset.openFormat)) updateLink(link, currentPaper, link.dataset.openFormat);
  }
  const label = formatLabel(preferences.format, preferences.language);
  openLink.title = translate(preferences.openInNewTab ? 'dockOpenNew' : 'dockOpenCurrent', preferences.language, [label]);
  detail.textContent = `${getPaperId(currentPaper, preferences.version)} · ${label}${preferences.version === 'latest' ? ` · ${translate('versionLatest', preferences.language)}` : ''}`;
  copyButton.disabled = copying;
  copyMenu.toggle.disabled = copying;
  if (!host.isConnected) document.documentElement.append(host);
}

function closeMenu(menu: ActionMenu, restoreFocus = false): void {
  menu.panel.hidden = true;
  menu.toggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus && menu.toggle.disabled === false && host.isConnected) menu.toggle.focus();
}

function closeMenus(): void {
  for (const menu of menus) closeMenu(menu);
}

function showMenu(menu: ActionMenu, last = false): void {
  render();
  if (currentPaper === null || menu.toggle.disabled) return;
  closeMenus();
  clearStatus();
  menu.panel.hidden = false;
  menu.toggle.setAttribute('aria-expanded', 'true');
  menu.items[last ? menu.items.length - 1 : 0]?.focus();
}

for (const menu of menus) {
  menu.toggle.addEventListener('click', () => {
    if (menu.panel.hidden) showMenu(menu);
    else closeMenu(menu, true);
  });
  menu.toggle.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      showMenu(menu, event.key === 'ArrowUp');
    }
  });
  menu.panel.addEventListener('keydown', (event) => {
    const current = menu.items.indexOf(shadow.activeElement as HTMLElement);
    let next: number;
    if (event.key === 'ArrowDown') next = (current + 1) % menu.items.length;
    else if (event.key === 'ArrowUp') next = (current + menu.items.length - 1) % menu.items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = menu.items.length - 1;
    else if (event.key === 'Tab') { closeMenu(menu, true); return; }
    else if (event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      menu.items[current]?.click();
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    menu.items[next]?.focus();
  });
}

shadow.addEventListener('keydown', (event) => {
  if (event instanceof KeyboardEvent && event.key === 'Escape') {
    const active = menus.find((menu) => menu.panel.hidden === false);
    if (active) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(active, true);
    }
  }
});

function closeOutsideMenus(event: Event): void {
  const path = event.composedPath();
  for (const menu of menus) {
    if (path.includes(menu.panel) === false && path.includes(menu.toggle) === false) closeMenu(menu);
  }
}

document.addEventListener('pointerdown', closeOutsideMenus);
document.addEventListener('focusin', closeOutsideMenus);

function prepareNavigation(event: MouseEvent, link: HTMLAnchorElement, format?: ReadingFormat): void {
  render();
  if (currentPaper === null) {
    event.preventDefault();
    return;
  }
  updateLink(link, currentPaper, format ?? preferences.format);
  const fromMenu = openMenu.panel.contains(link);
  closeMenus();
  if (fromMenu && (event.type === 'click' || event.button === 1)) closeMenu(openMenu, true);
}

for (const link of [openLink, ...openFormatLinks]) {
  const format = isReadingFormat(link.dataset.openFormat) ? link.dataset.openFormat : undefined;
  link.addEventListener('click', (event) => prepareNavigation(event, link, format));
  link.addEventListener('auxclick', (event) => prepareNavigation(event, link, format));
}

async function copyLink(format: CopyFormat): Promise<void> {
  const sourceUrl = location.href;
  const paper = parsePaperUrl(sourceUrl);
  if (paper?.source !== 'alphaxiv' || copying) return;
  const fromMenu = copyMenu.panel.hidden === false;
  const value = format === 'markdown'
    ? buildMarkdownLink(paper, preferences.version)
    : buildArxivUrl(paper, format, preferences.version);
  closeMenus();
  copying = true;
  render();
  try {
    await navigator.clipboard.writeText(value);
    if (location.href === sourceUrl) announce('dockCopySucceeded');
  } catch {
    if (location.href === sourceUrl) announce('dockCopyFailed');
  } finally {
    copying = false;
    render();
    if (fromMenu && location.href === sourceUrl && host.isConnected && menus.every((menu) => menu.panel.hidden)
      && (document.activeElement === document.body || copyMenu.panel.contains(shadow.activeElement))) {
      copyMenu.toggle.focus();
    }
  }
}

copyButton.addEventListener('click', () => { void copyLink('abs'); });
for (const item of copyMenu.items) {
  item.addEventListener('click', () => {
    const format = item.dataset.copyFormat;
    if (format === 'markdown' || isReadingFormat(format)) void copyLink(format);
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
