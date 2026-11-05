import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';

const xmlText = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function record(id) {
  const special = {
    '1706.03762v3': ['Attention Is All You Need', ['Ashish Vaswani', 'Noam Shazeer'], '2017'],
    '1706.03762v2': ['Attention & Tokens', ['Zoë Müller', 'René Núñez'], '2017'],
    '1706.03762': ['Latest Attention', ['Ashish Vaswani'], '2017'],
    'hep-th/9901001v2': ['Holography and Signals', ['A. Researcher'], '1999'],
    '2401.00001v1': ['A [Safe] <img src=x onerror=window.__citationInjected=true> & \\title', ['Zoë Müller'], '2024'],
  }[id];
  return { id: /v[1-9]\d*$/.test(id) ? id : `${id}v7`,
    title: special?.[0] ?? `Research Paper ${id}`, authors: special?.[1] ?? ['A. Researcher'], year: special?.[2] ?? '2024' };
}
function atom(ids) {
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">${ids.slice().reverse().map((id) => {
    const item = record(id);
    return `<entry><id>http://arxiv.org/abs/${item.id}</id><title>${xmlText(item.title)}</title><published>${item.year}-06-12T17:57:34Z</published><arxiv:primary_category term="cs.LG"/>${item.authors.map((author) => `<author><name>${xmlText(author)}</name></author>`).join('')}</entry>`;
  }).join('')}</feed>`;
}
const idMarkdown = (ids) => ids.map((id) => `- [arXiv:${id}](https://arxiv.org/abs/${id})\n`).join('');

export async function runCitationChecks({ context, worker, extensionId, paper, output, en, zh, readClipboard }) {
  const initialPreferences = { format: 'abs', version: 'current', openInNewTab: false, language: 'en' };
  await worker.evaluate((preferences) => chrome.storage.local.set({ preferences }), initialPreferences);
  const page = await context.newPage();
  const requests = [];
  let mode = 'partial';
  let releaseDelayed;
  let delayedStarted;
  const routeHandler = async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.pathname, '/api/query');
    assert.equal(route.request().method(), 'GET');
    assert.equal(route.request().headers().cookie, undefined);
    assert.equal(route.request().headers().referer, undefined);
    const ids = url.searchParams.get('id_list').split(',');
    assert.ok(ids.length > 0 && ids.length <= 50);
    assert.equal(url.searchParams.get('max_results'), String(ids.length));
    assert.equal(new Set(ids).size, ids.length);
    requests.push({ ids, time: Date.now() });
    const requestMode = mode;
    if (requestMode === 'delayed') await new Promise((resolve) => { releaseDelayed = resolve; delayedStarted?.(); });
    if (requestMode === 'http') return route.fulfill({ status: 503, body: 'temporarily unavailable' });
    const body = requestMode === 'malformed' ? '<html>Not an Atom feed</html>'
      : atom(requestMode === 'partial' ? ids.filter((id) => id !== '2301.12345') : ids);
    // A deliberately delayed request can already have been cancelled by the UI.
    await route.fulfill({ status: 200, contentType: 'application/atom+xml', body }).catch((error) => {
      if (requestMode !== 'delayed') throw error;
    });
  };
  await context.route('https://export.arxiv.org/**', routeHandler);
  const ready = async () => {
    await page.waitForFunction(() => document.getElementById('batch-fetch-metadata')?.getAttribute('aria-busy') === 'false');
  };
  const fetched = async (count) => {
    await page.waitForFunction((expected) => document.getElementById('batch-metadata-count')?.textContent === String(expected)
      && document.getElementById('batch-fetch-metadata')?.getAttribute('aria-busy') === 'false', count);
  };
  const input = page.locator('#batch-input');
  try {
    await page.goto(`chrome-extension://${extensionId}/batch.html`);
    await page.waitForFunction(() => document.getElementById('batch-version')?.disabled === false);
    const source = '1706.03762v3\nhttps://www.alphaxiv.org/pdf/1706.03762v3\nhep-th/9901001v2\n2301.12345\ninvalid reference';
    await input.fill(source);
    assert.equal(requests.length, 0, 'Paste never fetches metadata implicitly');
    assert.equal(await page.locator('#batch-use-titles').isDisabled(), true);
    assert.equal(await page.locator('#batch-bibtex-copy').isDisabled(), true);
    await page.evaluate(() => {
      window.__originalPermissionRequest = chrome.permissions.request.bind(chrome.permissions);
      chrome.permissions.request = async (permissions) => { window.__requestedOrigins = permissions.origins; return false; };
    });
    await page.locator('#batch-fetch-metadata').click();
    await ready();
    assert.equal(await page.locator('#batch-metadata-status').innerText(), en.batchMetadataPermissionDenied.message);
    assert.deepEqual(await page.evaluate(() => window.__requestedOrigins), ['https://export.arxiv.org/*']);
    assert.equal(requests.length, 0);
    assert.equal(await page.locator('#batch-copy').isEnabled(), true);
    assert.equal(await page.locator('#batch-markdown').inputValue(), idMarkdown(['1706.03762v3', 'hep-th/9901001v2', '2301.12345']));
    await page.evaluate(() => { chrome.permissions.request = window.__originalPermissionRequest; delete window.__originalPermissionRequest; });
    await page.locator('#batch-fetch-metadata').click();
    await fetched(2);
    assert.deepEqual(requests[0].ids, ['1706.03762v3', 'hep-th/9901001v2', '2301.12345']);
    assert.equal(await page.locator('#batch-results [data-line="1"] .paper-title').innerText(), 'Attention Is All You Need');
    assert.match(await page.locator('#batch-results [data-line="1"] .paper-authors').innerText(), /Ashish Vaswani; Noam Shazeer/);
    assert.equal(await page.locator('#batch-results [data-line="4"]').getAttribute('data-metadata'), 'failed');
    const titled = '- [Attention Is All You Need](https://arxiv.org/abs/1706.03762v3)\n- [Holography and Signals](https://arxiv.org/abs/hep-th/9901001v2)\n- [arXiv:2301.12345](https://arxiv.org/abs/2301.12345)\n';
    assert.equal(await page.locator('#batch-markdown').inputValue(), titled);
    assert.match(await page.locator('#batch-bibtex-note').innerText(), /2\/3/);
    await page.locator('#batch-copy').click();
    await page.waitForFunction((message) => document.getElementById('batch-status')?.textContent === message, en.batchCopied.message);
    assert.equal(await readClipboard(paper), titled);
    await page.bringToFront();
    const [markdownDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#batch-download').click()]);
    assert.equal(await readFile(await markdownDownload.path(), 'utf8'), titled);
    await page.locator('#batch-bibtex-copy').click();
    await page.waitForFunction((message) => document.getElementById('batch-status')?.textContent === message, en.batchBibtexCopied.message);
    const bibtex = await page.locator('#batch-bibtex').inputValue();
    assert.equal(await readClipboard(paper), bibtex);
    await page.bringToFront();
    const [bibtexDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#batch-bibtex-download').click()]);
    assert.match(bibtexDownload.suggestedFilename(), /\.bib$/);
    assert.equal(await readFile(await bibtexDownload.path(), 'utf8'), bibtex);
    const imported = new Cite(bibtex).data;
    assert.equal(imported.length, 2);
    assert.equal(imported[0].title, 'Attention Is All You Need');
    assert.equal(imported[0].author[0].family, 'Vaswani');
    assert.equal(imported[0].issued['date-parts'][0][0], 2017);
    assert.equal(imported[0].URL, 'https://arxiv.org/abs/1706.03762v3');
    await page.locator('#batch-use-titles').uncheck();
    assert.equal(await page.locator('#batch-markdown').inputValue(), idMarkdown(['1706.03762v3', 'hep-th/9901001v2', '2301.12345']));
    await page.locator('#batch-use-titles').check();
    await page.screenshot({ path: join(output, 'citations-en.png'), fullPage: true });
    console.log('PASS: metadata is opt-in; denial preserves links, real worker fetches only selected unique IDs, partial results enrich Markdown, and downloaded BibTeX imports with title/authors/year/version.');

    mode = 'normal';
    await page.locator('#batch-fetch-metadata').click();
    await fetched(3);
    assert.deepEqual(requests[1].ids, ['2301.12345'], 'Retry requests only unavailable papers');
    assert.equal(await page.locator('#batch-fetch-metadata').isDisabled(), true);
    await worker.evaluate((preferences) => chrome.storage.local.set({ preferences }), { ...initialPreferences, language: 'zh_CN' });
    await page.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    assert.match(await page.locator('#batch-bibtex-note').innerText(), /3\/3/);
    await page.locator('#batch-version').selectOption('latest');
    assert.equal(await page.locator('#batch-metadata-count').innerText(), '1', 'Unchanged unversioned references can retain their matching cache');
    assert.equal(requests.length, 2, 'Version changes do not fetch implicitly or reuse wrong-version metadata');
    await page.locator('#batch-fetch-metadata').click();
    await fetched(3);
    assert.deepEqual(requests[2].ids, ['1706.03762', 'hep-th/9901001']);
    assert.match(await page.locator('#batch-markdown').inputValue(), /Latest Attention/);
    const latestBib = new Cite(await page.locator('#batch-bibtex').inputValue()).data;
    assert.equal(latestBib[0].URL, 'https://arxiv.org/abs/1706.03762');
    await page.locator('h1').click();
    await page.screenshot({ path: join(output, 'citations-zh-CN.png'), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: join(output, 'citations-mobile.png') });
    await page.locator('.results-panel').evaluate((panel) => panel.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: join(output, 'citations-mobile-results.png') });
    await page.setViewportSize({ width: 1280, height: 800 });
    console.log('PASS: retry skips cached successes, language changes retain metadata, and latest-version exports use independently fetched matching details with bilingual/mobile layouts.');

    await page.locator('#batch-version').selectOption('current');
    await input.fill('1706.03762v2');
    mode = 'delayed';
    const beforeDelayed = requests.length;
    const requestStarted = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for the worker request')), 10000);
      delayedStarted = () => { clearTimeout(timer); resolve(); };
    });
    await page.locator('#batch-fetch-metadata').click();
    await page.waitForFunction(() => document.getElementById('batch-fetch-metadata')?.getAttribute('aria-busy') === 'true');
    await requestStarted;
    assert.equal(requests.length, beforeDelayed + 1);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'batch-cancel-metadata');
    await input.fill('2401.00001v1');
    assert.equal(await page.locator('#batch-metadata-count').innerText(), '0');
    releaseDelayed();
    mode = 'normal';
    await page.locator('#batch-fetch-metadata').click();
    await fetched(1);
    assert.equal(await page.locator('#batch-results img').count(), 0);
    assert.equal(await page.evaluate(() => window.__citationInjected), undefined);
    assert.match(await page.locator('#batch-markdown').inputValue(), /\\\[Safe\\\]/);
    assert.match(await page.locator('#batch-markdown').inputValue(), /\\<img/);
    assert.equal(new Cite(await page.locator('#batch-bibtex').inputValue()).data.length, 1);
    assert.doesNotMatch(await page.locator('#batch-markdown').inputValue(), /Attention/);
    console.log('PASS: editing during an active fetch cancels obsolete requests; stale results cannot enter exports, and unsafe title markup stays literal in UI/Markdown/BibTeX.');

    await input.fill('2301.12345v3');
    mode = 'delayed';
    await page.locator('#batch-fetch-metadata').focus();
    await page.locator('#batch-fetch-metadata').press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'batch-cancel-metadata');
    await page.locator('#batch-cancel-metadata').press('Enter');
    await ready();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'batch-fetch-metadata');
    assert.equal(await page.locator('#batch-metadata-status').innerText(), zh.batchMetadataCancelled.message);
    releaseDelayed?.();
    console.log('PASS: keyboard fetch transfers focus to Cancel and restores it after cancellation.');

    await input.fill('2301.12345v2');
    for (const failure of ['http', 'malformed']) {
      mode = failure;
      const before = requests.length;
      await page.locator('#batch-fetch-metadata').click();
      await ready();
      assert.equal(requests.length, before + 1);
      assert.equal(await page.locator('#batch-metadata-status').getAttribute('data-state'), 'error');
      assert.equal(await page.locator('#batch-copy').isEnabled(), true);
      assert.equal(await page.locator('#batch-bibtex-copy').isDisabled(), true);
      assert.equal(await page.locator('#batch-markdown').inputValue(), idMarkdown(['2301.12345v2']));
    }
    mode = 'normal';
    const ids = Array.from({ length: 51 }, (_, index) => `2401.${String(index + 1).padStart(5, '0')}`);
    await input.fill(ids.join('\n'));
    const beforeChunks = requests.length;
    await page.locator('#batch-fetch-metadata').click();
    await fetched(51);
    const chunks = requests.slice(beforeChunks);
    assert.equal(chunks.length, 2);
    assert.deepEqual(chunks.map((chunk) => chunk.ids.length), [50, 1]);
    assert.ok(chunks[1].time - chunks[0].time >= 2900, 'Worker enforces shared request pacing');
    assert.equal(new Cite(await page.locator('#batch-bibtex').inputValue()).data.length, 51);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('batch-version')?.disabled === false);
    assert.equal(await input.inputValue(), '');
    assert.equal(await page.locator('#batch-metadata-count').innerText(), '0');
    assert.deepEqual(await worker.evaluate(async () => chrome.storage.local.get()), { preferences: { ...initialPreferences, language: 'zh_CN' } });
    const session = await worker.evaluate(async () => chrome.storage.session.get());
    assert.deepEqual(Object.keys(session), ['metadataNextRequestAt']);
    assert.equal(typeof session.metadataNextRequestAt, 'number');
    console.log('PASS: HTTP/malformed failures preserve local export, 51-paper fetches split50+1 with pacing, reload clears metadata, and only a throttle timestamp enters session storage.');
  } catch (error) {
    await page.screenshot({ path: join(output, 'citations-failure.png'), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    releaseDelayed?.();
    await context.unroute('https://export.arxiv.org/**', routeHandler);
    await page.close();
  }
}
