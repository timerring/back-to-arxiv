import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function runBatchChecks({ context, worker, extensionId, paper, openPopup, assertPopupFits, output, en, zh, readClipboard }) {
  const initialPreferences = { format: 'html', openInNewTab: false, version: 'current', language: 'en' };
  const setPreferences = (preferences) => worker.evaluate((value) => chrome.storage.local.set({ preferences: value }), preferences);
  await setPreferences(initialPreferences);
  let popup = await openPopup(context, paper, extensionId);
  await assertPopupFits(popup);
  const [batch] = await Promise.all([context.waitForEvent('page'), popup.locator('#batch-organizer').click()]);
  await batch.waitForURL(`chrome-extension://${extensionId}/batch.html`);
  await batch.waitForFunction(() => document.getElementById('batch-version')?.disabled === false);
  assert.equal(paper.url(), 'https://example.org/');
  if (popup.isClosed() === false) await popup.close();

  const input = batch.locator('#batch-input');
  const resultRows = batch.locator('#batch-results [data-status]');
  const waitForCounts = async (unique, duplicates, invalid) => {
    await batch.waitForFunction(([a, b, c]) => document.getElementById('batch-unique-count')?.textContent === String(a)
      && document.getElementById('batch-duplicate-count')?.textContent === String(b)
      && document.getElementById('batch-invalid-count')?.textContent === String(c), [unique, duplicates, invalid]);
  };
  const markdown = (ids) => ids.map((id) => `- [arXiv:${id}](https://arxiv.org/abs/${id})\n`).join('');
  const source = [
    '- [Attention](https://www.alphaxiv.org/overview/1706.03762v3?utm_source=list)',
    'https://arxiv.org/pdf/1706.03762v3.pdf',
    '',
    'arXiv:1706.03762v2',
    '10.48550/arXiv.1706.03762',
    'hep-th/9901001v2',
    'not a paper',
    '[unsafe](https://arxiv.org.evil.example/abs/1706.03762)',
    '1. https://arxiv.org/abs/hep-th/9901001v2',
    '<img src=x onerror=window.__batchInjected=true>',
  ].join('\n');
  const currentMarkdown = markdown(['1706.03762v3', '1706.03762v2', '1706.03762', 'hep-th/9901001v2']);
  const latestMarkdown = markdown(['1706.03762', 'hep-th/9901001']);
  const remoteRequests = [];
  const watchRequests = (request) => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); };
  batch.on('request', watchRequests);

  try {
    assert.equal(await batch.locator('#batch-copy').isDisabled(), true);
    assert.equal(await batch.locator('#batch-download').isDisabled(), true);
    assert.equal(await batch.locator('#batch-version').inputValue(), 'current');
    const tabsBeforePaste = context.pages().length;
    await input.fill(source);
    await waitForCounts(4, 2, 3);
    assert.equal(await resultRows.count(), 9);
    assert.equal(await batch.locator('#batch-results [data-line="2"]').getAttribute('data-status'), 'duplicate');
    assert.equal(await batch.locator('#batch-results [data-line="7"]').getAttribute('data-status'), 'invalid');
    assert.match(await batch.locator('#batch-results [data-line="2"]').innerText(), /1/);
    assert.equal(await batch.locator('#batch-results img').count(), 0);
    assert.equal(await batch.evaluate(() => window.__batchInjected), undefined);
    assert.equal(await batch.locator('#batch-markdown').inputValue(), currentMarkdown);
    assert.equal(context.pages().length, tabsBeforePaste, 'Pasting does not open paper tabs');
    await batch.bringToFront();
    await batch.locator('#batch-copy').click();
    await batch.waitForFunction((message) => document.getElementById('batch-status')?.textContent === message, en.batchCopied.message);
    assert.equal(await readClipboard(paper), currentMarkdown);
    console.log('PASS: batch entry preserves the source; mixed references retain versioned uniques, mark duplicates/invalid physical lines, and copy only valid Markdown.');

    await batch.bringToFront();
    await batch.locator('#batch-version').selectOption('latest');
    await waitForCounts(2, 4, 3);
    assert.equal(await batch.locator('#batch-markdown').inputValue(), latestMarkdown);
    assert.deepEqual(await worker.evaluate(async () => chrome.storage.local.get()), { preferences: initialPreferences });
    const [download] = await Promise.all([batch.waitForEvent('download'), batch.locator('#batch-download').click()]);
    assert.match(download.suggestedFilename(), /\.md$/);
    assert.equal(await download.failure(), null);
    assert.equal(await readFile(await download.path(), 'utf8'), latestMarkdown);
    await batch.screenshot({ path: join(output, 'batch-en.png'), fullPage: true });
    console.log('PASS: latest-version dedup merges variants, Markdown download bytes match the preview, and batch controls do not change saved preferences.');

    await setPreferences({ ...initialPreferences, version: 'current', language: 'zh_CN' });
    await batch.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    assert.equal(await batch.locator('#batch-version').inputValue(), 'latest');
    assert.equal(await input.inputValue(), source);
    assert.equal(await batch.locator('#batch-markdown').inputValue(), latestMarkdown);
    await batch.screenshot({ path: join(output, 'batch-zh-CN.png'), fullPage: true });
    await batch.setViewportSize({ width: 375, height: 812 });
    assert.equal(await batch.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await batch.screenshot({ path: join(output, 'batch-mobile.png'), fullPage: true });
    await batch.setViewportSize({ width: 1280, height: 800 });
    await batch.reload();
    await batch.waitForFunction(() => document.getElementById('batch-version')?.disabled === false);
    assert.equal(await input.inputValue(), '');
    assert.equal(await batch.locator('#batch-version').inputValue(), 'current');
    assert.equal(await batch.locator('#batch-copy').isDisabled(), true);
    console.log('PASS: live language changes preserve the draft and chosen dedup policy; Chinese/mobile layouts fit, and reload clears the memory-only draft.');

    // A quick paste must not export under defaults while a saved Latest preference is loading.
    await setPreferences({ ...initialPreferences, version: 'latest', language: 'zh_CN' });
    await batch.addInitScript(() => {
      if (new URL(location.href).searchParams.has('delay-preferences') === false) return;
      const get = chrome.storage.local.get.bind(chrome.storage.local);
      chrome.storage.local.get = (...args) => new Promise((resolve, reject) => {
        window.__releaseBatchPreferences = () => get(...args).then(resolve, reject);
      });
    });
    await batch.goto(`chrome-extension://${extensionId}/batch.html?delay-preferences`);
    await batch.waitForFunction(() => typeof window.__releaseBatchPreferences === 'function');
    await input.fill('1706.03762v2\n1706.03762v3');
    assert.equal(await batch.locator('#batch-version').isDisabled(), true);
    assert.equal(await batch.locator('#batch-copy').isDisabled(), true);
    assert.equal(await batch.locator('#batch-download').isDisabled(), true);
    assert.equal(await batch.locator('#batch-preview').isHidden(), true);
    await batch.evaluate(() => window.__releaseBatchPreferences());
    await batch.waitForFunction(() => document.getElementById('batch-version')?.disabled === false);
    await waitForCounts(1, 1, 0);
    assert.equal(await batch.locator('#batch-version').inputValue(), 'latest');
    assert.equal(await batch.locator('#batch-markdown').inputValue(), markdown(['1706.03762']));
    await setPreferences({ ...initialPreferences, language: 'zh_CN' });
    await batch.goto(`chrome-extension://${extensionId}/batch.html`);
    await batch.waitForFunction(() => document.getElementById('batch-version')?.disabled === false);
    console.log('PASS: early pastes cannot export until saved version preferences finish loading.');

    await input.fill('1706.03762\nwrong');
    await waitForCounts(1, 0, 1);
    await input.fill('1706.03762\n2301.12345v2');
    await waitForCounts(2, 0, 0);
    await input.fill('https://evil.example/abs/1706.03762\njavascript:alert(1)');
    await waitForCounts(0, 0, 2);
    for (const id of ['batch-copy', 'batch-download']) assert.equal(await batch.locator(`#${id}`).isDisabled(), true);
    await input.fill('1706.03762');
    await waitForCounts(1, 0, 0);
    await batch.evaluate(() => {
      window.__originalClipboardWrite = navigator.clipboard.writeText;
      navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); };
    });
    await batch.locator('#batch-copy').click();
    await batch.waitForFunction((message) => document.getElementById('batch-status')?.textContent === message, zh.batchCopyFailed.message);
    assert.equal(await batch.locator('#batch-markdown').inputValue(), markdown(['1706.03762']));
    assert.match(await batch.locator('#batch-status').innerText(), /复制失败/);
    await batch.evaluate(() => {
      navigator.clipboard.writeText = window.__originalClipboardWrite;
      delete window.__originalClipboardWrite;
    });
    await input.fill(Array(501).fill('1706.03762').join('\n'));
    assert.equal(await resultRows.count(), 0);
    assert.equal(await batch.locator('#batch-copy').isDisabled(), true);
    assert.equal(await batch.locator('#batch-download').isDisabled(), true);
    assert.match(await batch.locator('#batch-status').innerText(), /500/);
    // Dispatch as a real input update; the engine must reject rather than truncate huge pastes.
    await input.evaluate((node) => {
      node.value = 'x'.repeat(100001);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await batch.locator('#batch-copy').isDisabled(), true);
    assert.equal(await resultRows.count(), 0);
    assert.match((await batch.locator('#batch-status').innerText()).replaceAll(',', ''), /100000/);
    await batch.locator('#batch-clear').click();
    await waitForCounts(0, 0, 0);
    assert.equal(await input.inputValue(), '');
    await batch.locator('#batch-example').click();
    assert.ok((await input.inputValue()).length > 0);
    assert.equal(await batch.locator('#batch-copy').isEnabled(), true);
    await batch.screenshot({ path: join(output, 'batch-example-zh-CN.png'), fullPage: true });
    await batch.locator('#batch-clear').click();
    assert.equal(await batch.locator('#batch-markdown').inputValue(), '');
    assert.deepEqual(remoteRequests, [], 'Batch parsing and export make no HTTP requests');
    assert.deepEqual(await worker.evaluate(async () => chrome.storage.local.get()), { preferences: { ...initialPreferences, language: 'zh_CN' } });
    console.log('PASS: editing fixes errors, invalid-only/oversize batches disable export, clipboard failures preserve the draft, and example/clear work without network or draft storage.');

    popup = await openPopup(context, paper, extensionId);
    assert.equal(await popup.locator('#batch-organizer [data-i18n]').innerText(), zh.batchOrganizer.message);
    await assertPopupFits(popup);
    await popup.close();
    await setPreferences(initialPreferences);
  } catch (error) {
    await batch.screenshot({ path: join(output, 'batch-failure.png'), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    batch.off('request', watchRequests);
    await batch.close();
  }
}
