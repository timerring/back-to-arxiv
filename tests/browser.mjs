import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionPath = join(root, 'dist');
const output = join(root, 'test-results');
const en = JSON.parse(await readFile(join(root, 'public/_locales/en/messages.json'), 'utf8'));
const zh = JSON.parse(await readFile(join(root, 'public/_locales/zh_CN/messages.json'), 'utf8'));
const loadViaCdp = process.env.CHROMIUM_LOAD_EXTENSION_VIA_CDP === '1';
const profile = await mkdtemp(join(tmpdir(), 'back-to-arxiv-test-'));
await mkdir(output, { recursive: true });

const fixture = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Paper fixture</title>
<style>body{margin:0;background:#fbfaf8;color:#242220;font:16px system-ui}main{max-width:760px;margin:100px auto}small{color:#8b5e50}h1{font:46px Georgia}p{line-height:1.8;color:#625e58}a{color:#9d4034}</style></head>
<body><main><small>ALPHAXIV · BROWSER TEST FIXTURE</small><h1>Attention Is All You Need</h1><p>This local fixture exercises the real extension in Chromium. Navigation and preference changes run through Chrome extension APIs.</p><a href="/abs/hep-th/9901001v2">Another paper</a></main></body></html>`;

let context;
const browserErrors = [];

function watchPage(page) {
  page.on('pageerror', (error) => browserErrors.push({ url: page.url(), message: error.message, stack: error.stack }));
}

function serveFixture(route, body) {
  // An extension-created tab can start loading before browser routing attaches.
  // Serve HTML only for documents; any subsequent site scripts/assets stay inert.
  return route.request().resourceType() === 'document'
    ? route.fulfill({ status: 200, contentType: 'text/html', body })
    : route.fulfill({ status: 204, body: '' });
}

async function waitForLink(page, href) {
  await page.waitForFunction((expected) => {
    const host = document.querySelector('#back-to-arxiv-root');
    const link = host?.shadowRoot?.querySelector('a');
    return link?.href === expected && getComputedStyle(host).display !== 'none';
  }, href);
}

async function assertPopupFits(popup) {
  const size = await popup.locator('body').boundingBox();
  assert.ok(size && size.height <= 600, `Popup content must fit Chrome's 600px height limit: ${size?.height}`);
  assert.equal(await popup.locator('body').evaluate((body) => body.scrollWidth), 360);
}

async function openPopup(context, paperPage, extensionId) {
  await paperPage.bringToFront();
  const browserCdp = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await browserCdp.send('Target.getTargets', { filter: [{ type: 'tab' }, { exclude: true }] });
  const targets = targetInfos.filter((target) => target.url === paperPage.url());
  assert.equal(targets.length, 1, 'Expected a unique browser tab for the action grant');
  // Trigger the real toolbar action to grant activeTab, just as a user click does.
  // Open the same popup document in a test tab so its lifetime is deterministic.
  await browserCdp.send('Extensions.triggerAction', { id: extensionId, targetId: targets[0].targetId });
  await browserCdp.detach();
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 700 });
  await paperPage.bringToFront();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForFunction(() => document.getElementById('language')?.disabled === false);
  return popup;
}

try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', ...(loadViaCdp ? [] : [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`])],
  });
  if (loadViaCdp) {
    const cdp = await context.browser().newBrowserCDPSession();
    await cdp.send('Extensions.loadUnpacked', { path: extensionPath });
    await cdp.detach();
  }
  context.on('page', watchPage);
  for (const page of context.pages()) watchPage(page);
  await context.route('https://www.alphaxiv.org/**', (route) => serveFixture(route, fixture));
  await context.route('https://arxiv.org/**', (route) => serveFixture(route, fixture.replace('ALPHAXIV', 'ARXIV')));
  await context.route('https://example.org/**', (route) => serveFixture(route, '<h1>Unrelated page</h1>'));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const setPreferences = (value) => worker.evaluate((preferences) => chrome.storage.local.set({ preferences }), value);
  await setPreferences({ format: 'abs', openInNewTab: false });

  const paper = await context.newPage();
  await paper.goto('https://www.alphaxiv.org/overview/1706.03762v3?utm_source=test#discussion');
  await waitForLink(paper, 'https://arxiv.org/abs/1706.03762v3');
  assert.equal(await paper.locator('#back-to-arxiv-root').count(), 1);
  await paper.screenshot({ path: join(output, 'page-button.png') });
  console.log('PASS: content script injects on the matching site and preserves an explicit version.');

  await paper.bringToFront();
  await paper.getByRole('button', { name: en.copyLink.message, exact: true }).click();
  await paper.waitForFunction((message) => document.querySelector('#back-to-arxiv-root')?.shadowRoot?.querySelector('[role="status"]')?.textContent === message, en.dockCopySucceeded.message);
  await context.grantPermissions(['clipboard-read'], { origin: 'https://www.alphaxiv.org' });
  assert.equal(await paper.evaluate(() => navigator.clipboard.readText()), 'https://arxiv.org/abs/1706.03762v3');
  console.log('PASS: page copy writes a canonical versioned abstract link.');

  await setPreferences({ format: 'pdf', openInNewTab: true });
  await waitForLink(paper, 'https://arxiv.org/pdf/1706.03762v3');
  const [pdf] = await Promise.all([
    context.waitForEvent('page'),
    paper.getByRole('link', { name: en.openArxiv.message }).click(),
  ]);
  await pdf.waitForURL('https://arxiv.org/pdf/1706.03762v3');
  assert.match(paper.url(), /alphaxiv/);
  await pdf.close();
  console.log('PASS: storage preference changes reach existing page buttons; PDF opens in a new tab.');

  await paper.evaluate(() => history.pushState({}, '', '/abs/hep-th/9901001v2'));
  await waitForLink(paper, 'https://arxiv.org/pdf/hep-th/9901001v2');
  await paper.evaluate(() => history.pushState({}, '', '/'));
  await paper.getByRole('link', { name: en.openArxiv.message }).waitFor({ state: 'hidden' });
  await paper.evaluate(() => history.back());
  await waitForLink(paper, 'https://arxiv.org/pdf/hep-th/9901001v2');
  assert.equal(await paper.locator('#back-to-arxiv-root').count(), 1);
  console.log('PASS: SPA navigation, history back, home-page hiding, and legacy IDs work.');

  await setPreferences({ format: 'abs', openInNewTab: false });
  await waitForLink(paper, 'https://arxiv.org/abs/hep-th/9901001v2');
  await paper.getByRole('link', { name: en.openArxiv.message }).click();
  await paper.waitForURL('https://arxiv.org/abs/hep-th/9901001v2');
  assert.equal(await paper.locator('#back-to-arxiv-root').count(), 0);
  console.log('PASS: current-tab navigation lands on arXiv and injection remains scoped to alphaXiv.');

  await paper.goto('https://www.alphaxiv.org/abs/1706.03762v3');
  await waitForLink(paper, 'https://arxiv.org/abs/1706.03762v3');
  let popup = await openPopup(context, paper, extensionId);
  await popup.waitForFunction(() => document.getElementById('paper-id')?.textContent === '1706.03762v3');
  assert.equal(await popup.locator('#open-paper').isEnabled(), true);
  assert.equal(await popup.locator('#language').inputValue(), 'en');
  assert.equal(await popup.locator('html').getAttribute('lang'), 'en');
  assert.equal(await popup.locator('#open-paper').innerText(), en.openArxiv.message);
  assert.equal(await paper.getByRole('link', { name: en.openArxiv.message, exact: true }).count(), 1);
  assert.equal(await popup.locator('#html-note').isHidden(), true);
  await popup.locator('#format-pdf').check();
  await popup.waitForFunction((message) => document.getElementById('status')?.textContent === message, en.savedPreferences.message);
  await popup.locator('#new-tab').check();
  await popup.waitForFunction((message) => document.getElementById('status')?.textContent === message, en.savedPreferences.message);
  await waitForLink(paper, 'https://arxiv.org/pdf/1706.03762v3');
  assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get('preferences')).preferences), { format: 'pdf', openInNewTab: true, language: 'en' });
  await popup.locator('#format-html').check();
  await popup.waitForFunction((message) => document.getElementById('status')?.textContent === message, en.savedPreferences.message);
  await waitForLink(paper, 'https://arxiv.org/html/1706.03762v3');
  assert.equal(await popup.locator('#html-note').isVisible(), true);
  assert.match(await paper.getByRole('link', { name: en.openArxiv.message }).getAttribute('title'), /HTML/);
  assert.match(await paper.locator('#back-to-arxiv-root .detail').innerText(), /HTML/);
  assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get('preferences')).preferences), { format: 'html', openInNewTab: true, language: 'en' });
  await popup.close();
  popup = await openPopup(context, paper, extensionId);
  await popup.waitForFunction(() => document.getElementById('format-html')?.checked === true);
  assert.equal(await popup.locator('#html-note').isVisible(), true);
  await popup.locator('#language').selectOption('zh_CN');
  await popup.waitForFunction((message) => document.getElementById('status')?.textContent === message, zh.savedPreferences.message);
  await paper.getByRole('link', { name: zh.openArxiv.message, exact: true }).waitFor();
  assert.equal(await popup.locator('html').getAttribute('lang'), 'zh-CN');
  assert.equal(await popup.locator('#open-paper').innerText(), zh.openArxiv.message);
  assert.equal(await popup.locator('#format-html').getAttribute('aria-label'), zh.formatHtml.message);
  assert.equal(await popup.locator('#html-note').innerText(), zh.htmlNote.message);
  await assertPopupFits(popup);
  assert.equal(await paper.getByRole('button', { name: zh.copyLink.message, exact: true }).count(), 1);
  assert.match(await paper.getByRole('link', { name: zh.openArxiv.message, exact: true }).getAttribute('title'), /HTML/);
  assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get('preferences')).preferences), { format: 'html', openInNewTab: true, language: 'zh_CN' });
  await popup.locator('body').screenshot({ path: join(output, 'popup-zh-CN.png') });
  await popup.close();
  popup = await openPopup(context, paper, extensionId);
  assert.equal(await popup.locator('#language').inputValue(), 'zh_CN');
  assert.equal(await popup.locator('#open-paper').innerText(), zh.openArxiv.message);
  assert.equal(await popup.locator('#format-html').isChecked(), true);
  assert.equal(await popup.locator('#new-tab').isChecked(), true);
  await popup.locator('#language').selectOption('en');
  await popup.waitForFunction((message) => document.getElementById('status')?.textContent === message, en.savedPreferences.message);
  await paper.getByRole('link', { name: en.openArxiv.message, exact: true }).waitFor();
  assert.equal(await popup.locator('html').getAttribute('lang'), 'en');
  assert.equal(await popup.locator('#format-html').getAttribute('aria-label'), en.formatHtml.message);
  assert.equal(await popup.locator('#html-note').innerText(), en.htmlNote.message);
  await assertPopupFits(popup);
  console.log('PASS: English is the default; Chinese and English localize the popup and live page control, including accessibility labels, and survive reopening.');
  await popup.locator('body').screenshot({ path: join(output, 'popup.png') });
  await popup.bringToFront();
  await popup.locator('#copy-link').click();
  await popup.waitForFunction((message) => document.getElementById('status')?.textContent === message, en.copySucceeded.message);
  await paper.bringToFront();
  assert.equal(await paper.evaluate(() => navigator.clipboard.readText()), 'https://arxiv.org/abs/1706.03762v3');
  console.log('PASS: popup persists HTML across reopening, updates the page control, shows the experimental note, and copies the versioned abstract link.');

  const [openedFromPopup] = await Promise.all([
    context.waitForEvent('page'),
    popup.locator('#open-paper').click(),
  ]);
  // Confirm the destination as soon as navigation commits; site assets can finish later.
  await openedFromPopup.waitForURL('https://arxiv.org/html/1706.03762v3', { waitUntil: 'commit' }).catch((error) => {
    console.error('Popup navigation state:', openedFromPopup.url(), context.pages().map((page) => page.url()));
    throw error;
  });
  assert.equal(paper.url(), 'https://www.alphaxiv.org/abs/1706.03762v3');
  await openedFromPopup.close();
  if (popup.isClosed() === false) await popup.close();
  console.log('PASS: the real MV3 service worker opens a versioned HTML paper in a new tab.');

  await setPreferences({ format: 'html', openInNewTab: false });
  await waitForLink(paper, 'https://arxiv.org/html/1706.03762v3');
  await paper.getByRole('link', { name: en.openArxiv.message }).click();
  await paper.waitForURL('https://arxiv.org/html/1706.03762v3');
  assert.equal(await paper.locator('#back-to-arxiv-root').count(), 0);
  console.log('PASS: the page button opens HTML in the current tab while preserving the requested version.');

  await paper.goto('https://example.org/');
  popup = await openPopup(context, paper, extensionId);
  assert.equal(await popup.locator('#open-paper').isDisabled(), true);
  assert.equal(await popup.locator('#copy-link').isDisabled(), true);
  assert.equal(await popup.locator('#format-fieldset').isEnabled(), true);
  await assertPopupFits(popup);
  await popup.locator('#language').selectOption('zh_CN');
  await popup.waitForFunction((message) => document.getElementById('status')?.textContent === message, zh.savedPreferences.message);
  await assertPopupFits(popup);
  assert.equal(await paper.locator('#back-to-arxiv-root').count(), 0);
  assert.deepEqual(browserErrors, []);
  console.log('PASS: unrelated pages receive no injected UI; popup actions are disabled while preferences remain available.');
  console.log(`Browser integration passed. Screenshots: ${output}`);
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
