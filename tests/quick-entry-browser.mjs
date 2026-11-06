import assert from 'node:assert/strict';
import { join } from 'node:path';

const api = 'https://export.arxiv.org/**';
function searchFeed(start) {
  const records = Array.from({ length: Math.min(10, 11 - start) }, (_, i) => {
    const id = '2401.' + String(start + i + 1).padStart(5, '0') + 'v2';
    return `<entry><id>http://arxiv.org/abs/${id}</id><title>Attention &amp; tokens ${start + i + 1}</title><author><name>Anne Example</name></author><published>2024-01-04T00:00:00Z</published></entry>`;
  });
  return `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:os="http://a9.com/-/spec/opensearch/1.1/"><os:totalResults>11</os:totalResults><os:startIndex>${start}</os:startIndex><os:itemsPerPage>10</os:itemsPerPage>${records.join('')}</feed>`;
}

export async function runSearchChecks({ context, worker, extensionId, paper, openPopup, output, en, zh }) {
  const preferences = { format: 'abs', version: 'current', openInNewTab: true, language: 'en' };
  await worker.evaluate((prefs) => chrome.storage.local.set({ preferences: prefs }), preferences);
  const seen = [];
  let response = 'results';
  const serve = async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.pathname, '/api/query');
    assert.equal(url.searchParams.get('max_results'), '10');
    assert.equal(route.request().headers().referer, undefined);
    const start = Number(url.searchParams.get('start'));
    seen.push({ start, query: url.searchParams.get('search_query') });
    await route.fulfill({ contentType: 'application/atom+xml', body: response === 'results' ? searchFeed(start) : '<bad/>' });
  };
  await context.route(api, serve);
  let page, popup;
  try {
    popup = await openPopup(context, paper, extensionId);
    await popup.locator('#paper-input').fill('Attention tokens');
    assert.equal(await popup.locator('#open-paper').innerText(), en.searchArxiv.message);
    assert.equal(seen.length, 0);
    [page] = await Promise.all([context.waitForEvent('page'), popup.locator('#paper-input').press('Enter')]);
    const baseUrl = 'chrome-extension://' + extensionId + '/search.html';
    const first = page.locator('[data-paper-id="2401.00001v2"]');
    await first.waitFor();
    assert.equal(page.url(), baseUrl);
    assert.equal(await page.locator('#search-input').inputValue(), 'Attention tokens');
    assert.match(await first.innerText(), /Attention & tokens 1/);
    assert.match(await first.innerText(), /Anne Example/);
    assert.match(await first.innerText(), /2024/);
    for (const format of ['abs', 'pdf', 'html']) {
      const action = first.locator('[data-open-format="' + format + '"]');
      assert.equal(await action.getAttribute('href'), 'https://arxiv.org/' + format + '/2401.00001v2');
      assert.equal(await action.getAttribute('target'), '_blank');
    }
    await page.locator('#search-next').click();
    await page.locator('[data-paper-id="2401.00011v2"]').waitFor();
    assert.deepEqual(seen, [{ start: 0, query: 'all:"Attention" AND all:"tokens"' }, { start: 10, query: 'all:"Attention" AND all:"tokens"' }]);
    assert.equal(await page.locator('#search-next').isEnabled(), false);
    await page.locator('#search-prev').click();
    await first.waitFor();
    await worker.evaluate((prefs) => chrome.storage.local.set({ preferences: prefs }), { ...preferences, version: 'latest', language: 'zh_CN' });
    await page.waitForFunction(() => document.querySelector('[data-open-format="abs"]').href.endsWith('/2401.00001'));
    await page.screenshot({ path: join(output, 'search-results.png') });
    await page.setViewportSize({ width: 375, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const beforeReload = seen.length;
    await page.reload();
    assert.equal(await page.locator('#search-input').inputValue(), '');
    assert.equal(await page.locator('[data-paper-id]').count(), 0);
    assert.equal(seen.length, beforeReload);
    await page.addInitScript(() => {
      if (location.protocol !== 'chrome-extension:') return;
      chrome.permissions.contains = async () => false;
      chrome.permissions.request = async () => false;
    });
    await page.goto('about:blank');
    await page.goto(baseUrl + '#q=rare+query&run=1');
    await page.waitForFunction(() => !location.hash && document.querySelector('#search-input').value === 'rare query');
    await page.locator('#search-submit').click();
    await page.waitForFunction((message) => document.querySelector('#search-status').textContent === message, zh.searchPermissionDenied.message);
    assert.equal(seen.length, beforeReload);
    await page.evaluate(() => { chrome.permissions.request = async () => true; });
    response = 'malformed';
    await page.locator('#search-submit').click();
    await page.waitForFunction((expected) => document.querySelector('#search-status').textContent === expected,
      zh.searchInvalidResponse.message);
    assert.equal(await page.locator('[data-paper-id]').count(), 0);
    // Hold a reply so an edit or Cancel can overtake it. A late success must
    // never replace the new query or put results back after cancellation.
    await page.evaluate(() => {
      window.cancelledSearches = [];
      chrome.runtime.sendMessage = async (message) => {
        if (message.type === 'SEARCH_ARXIV') return new Promise(resolve => { window.finishSearch = resolve; });
        window.cancelledSearches.push(message.requestId);
        return { ok: false, error: 'cancelled' };
      };
    });
    for (const action of ['edit', 'cancel']) {
      await page.locator('#search-submit').click();
      await page.waitForFunction(() => typeof window.finishSearch === 'function');
      if (action === 'edit') await page.locator('#search-input').fill('a different title');
      else await page.locator('#search-cancel').click();
      await page.evaluate((xml) => { window.finishSearch({ ok: true, xml }); delete window.finishSearch; }, searchFeed(0));
      assert.equal(await page.locator('[data-paper-id]').count(), 0);
      assert.equal(await page.locator('#search-submit').isEnabled(), true);
    }
    assert.equal(await page.evaluate(() => window.cancelledSearches.length), 2);
    assert.deepEqual(Object.keys(await worker.evaluate(() => chrome.storage.local.get())), ['preferences']);
    console.log('PASS: popup title search, two pages of results, version-aware reading links, language, permission denial, malformed responses, and ephemeral queries.');
  } finally {
    await page?.close(); if (popup && !popup.isClosed()) await popup.close();
    await context.unroute(api, serve);
  }
}

async function drag(page, locator, x, y) {
  const r = await locator.boundingBox();
  assert.ok(r);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
}

export async function runToolbarChecks({ context, worker, extensionId, paper, openPopup, output, assertPopupFits }) {
  await worker.evaluate(() => chrome.storage.local.set({ preferences: { format: 'pdf', openInNewTab: true, version: 'current', language: 'zh_CN' } }));
  await paper.goto('https://www.alphaxiv.org/abs/1706.03762v3');
  await paper.setViewportSize({ width: 1000, height: 700 });
  await paper.bringToFront();
  const dock = paper.locator('#back-to-arxiv-root');
  const grip = dock.locator('#dock-grip');
  const link = dock.locator('#open-paper');
  await grip.waitFor();
  await drag(paper, grip, 90, 100);
  await paper.waitForFunction(() => document.querySelector('#back-to-arxiv-root').getBoundingClientRect().top < 130);
  const moved = await dock.boundingBox();
  assert.ok(moved.x < 150);
  await paper.reload();
  await grip.waitFor();
  await paper.waitForFunction(() => document.querySelector('#back-to-arxiv-root').getBoundingClientRect().top < 130);
  await dock.locator('#open-menu-toggle').click();
  const menu = await dock.locator('#open-menu').boundingBox();
  assert.ok(menu && menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= 1000 && menu.y + menu.height <= 700);
  await paper.keyboard.press('Escape');
  await paper.locator('h1').click();
  await dock.screenshot({ path: join(output, 'toolbar-expanded-crop.png') });
  await dock.locator('#dock-minimize').click();
  await grip.waitFor({ state: 'hidden' });
  assert.equal(await dock.locator('a:visible, button:visible').count(), 1);
  await dock.screenshot({ path: join(output, 'toolbar-compact-crop.png') });
  await link.click({ button: 'right' });
  await grip.waitFor();
  await dock.locator('#dock-minimize').click();
  await grip.waitFor({ state: 'hidden' });
  const tabCount = context.pages().length;
  await drag(paper, link, 970, 665);
  assert.equal(paper.url(), 'https://www.alphaxiv.org/abs/1706.03762v3');
  assert.equal(context.pages().length, tabCount);
  const [pdf] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await pdf.waitForURL('https://arxiv.org/pdf/1706.03762v3', {waitUntil:'commit'});
  await pdf.close();
  await paper.setViewportSize({ width: 375, height: 540 });
  await paper.reload();
  await link.waitFor();
  const bounds = await dock.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 375.5 && bounds.y + bounds.height <= 540.5);
  assert.equal(await dock.locator('a:visible, button:visible').count(), 1);
  const cdp = await context.newCDPSession(paper);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  try {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: 130 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await paper.waitForFunction(() => document.querySelector('#back-to-arxiv-root').getBoundingClientRect().top < 160);
    assert.equal(context.pages().length, tabCount);
  } finally {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.detach();
  }
  const popup = await openPopup(context, paper, extensionId);
  assert.equal(await popup.locator('#toolbar-minimized').isChecked(), true);
  await assertPopupFits(popup);
  await popup.locator('#toolbar-minimized').uncheck();
  await grip.waitFor();
  await popup.locator('#reset-toolbar-position').click();
  await popup.close();
  await paper.setViewportSize({ width: 1000, height: 700 });
  await paper.waitForFunction(() => document.querySelector('#back-to-arxiv-root').getBoundingClientRect().bottom >= 675);
  console.log('PASS: dragging persists across reload, compact mode has one working paper button, drag does not navigate, resizing keeps it visible, and popup restores the toolbar.');
}
