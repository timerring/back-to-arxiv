import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'store/assets-source');
const output = join(root, 'store/assets');
await mkdir(source, { recursive: true });
await mkdir(output, { recursive: true });

// Keep genuine extension captures as source assets; refresh them intentionally after UI changes.
if (process.argv.includes('--refresh-captures')) {
  await copyFile(join(root, 'test-results/popup.png'), join(source, 'popup-en.png'));
  await copyFile(join(root, 'test-results/popup-zh-CN.png'), join(source, 'popup-zh-CN.png'));
}
await copyFile(join(root, 'dist/icons/icon-128.png'), join(output, 'icon-128.png'));

const styles = `
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; }
  body { color: #342a25; background: #f7f3eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; }
  .showcase { position: relative; width: 1280px; height: 800px; overflow: hidden; }
  .right { position: absolute; inset: 0 0 0 auto; width: 495px; background: #933c35; }
  .right::before, .right::after { content: ''; position: absolute; border: 1px solid #d89d7c45; border-radius: 50%; }
  .right::before { width: 740px; height: 740px; left: -140px; top: 32px; }
  .right::after { width: 940px; height: 940px; left: -240px; top: -68px; }
  .brand { position: absolute; left: 66px; top: 54px; display: flex; align-items: center; gap: 14px; }
  .brand img { width: 48px; height: 48px; }
  .brand span { font: 31px/1.2 Georgia, 'Times New Roman', serif; letter-spacing: -.8px; }
  .copy { position: absolute; left: 72px; top: 182px; width: 640px; }
  .eyebrow { margin: 0 0 18px; color: #9a5244; font-size: 14px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; }
  h1 { margin: 0; font: 67px/1.05 Georgia, 'Times New Roman', serif; letter-spacing: -2.7px; }
  h1 em { font-style: normal; color: #933c35; }
  .intro { margin: 25px 0 29px; font-size: 23px; line-height: 1.5; color: #706056; letter-spacing: -.25px; }
  .features { margin: 0; padding: 0; list-style: none; display: grid; gap: 16px; }
  .features li { display: flex; align-items: center; gap: 13px; font-size: 20px; line-height: 1.3; }
  .features svg { flex: none; width: 20px; height: 20px; color: #933c35; }
  .foot { position: absolute; left: 72px; bottom: 57px; font-size: 16px; color: #8e7b6c; letter-spacing: .1px; }
  .foot::before { content: ''; display: block; width: 52px; height: 2px; margin-bottom: 19px; background: #cfa78e; }
  .capture-frame { position: absolute; top: 80px; right: 65px; width: 390px; padding: 1px; border: 1px solid #fff7e9a0; background: #faf8f4; border-radius: 15px; overflow: hidden; box-shadow: 0 24px 65px #41110e4d; }
  .capture-frame img { display: block; width: 100%; height: auto; }
  .capture-label { position: absolute; bottom: 39px; right: 65px; width: 390px; text-align: center; font-size: 13px; color: #f1d4bd; letter-spacing: .35px; }
  html[lang='zh-CN'] h1 { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; font-size: 58px; font-weight: 580; line-height: 1.25; letter-spacing: -1.6px; }
  html[lang='zh-CN'] .intro { margin-top: 23px; margin-bottom: 30px; font-size: 23px; }
  html[lang='zh-CN'] .features { gap: 18px; }
  html[lang='zh-CN'] .features li { font-size: 21px; }
  html[lang='zh-CN'] .eyebrow { letter-spacing: 2px; }
`;

const arrow = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const sharedHead = (language, title, css) => `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head>`;
function showcase(language, copy) {
  return `${sharedHead(language, `Back to arXiv — ${copy.title}`, styles)}<body><main class="showcase">
    <div class="right" aria-hidden="true"></div>
    <div class="brand"><img src="../assets/icon-128.png" alt=""><span>Back to arXiv</span></div>
    <section class="copy"><p class="eyebrow">${copy.eyebrow}</p><h1>${copy.headline}</h1><p class="intro">${copy.intro}</p>
      <ul class="features">${copy.features.map((feature) => `<li>${arrow}<span>${feature}</span></li>`).join('')}</ul>
    </section>
    <p class="foot">${copy.foot}</p>
    <div class="capture-frame"><img src="${copy.capture}" alt="${copy.alt}"></div>
    <div class="capture-label">${copy.label}</div>
  </main></body></html>`;
}

const artworks = [
  {
    name: 'showcase-en', width: 1280, height: 800,
    html: showcase('en', {
      title: 'Original papers, one click away', eyebrow: 'A shortcut for your research',
      headline: 'Back to the<br><em>original paper.</em>',
      intro: 'Open alphaXiv papers on arXiv.<br>Choose the way you like to read.',
      features: ['Right-click paper links to open arXiv', 'Keep the current version or open the latest', 'Copy Abstract, PDF &amp; HTML links'],
      foot: 'Your next read starts with the original.', capture: 'popup-en.png',
      alt: 'Actual Back to arXiv popup in English', label: 'Actual extension interface · English',
    }),
  },
  {
    name: 'showcase-zh-CN', width: 1280, height: 800,
    html: showcase('zh-CN', {
      title: '回到论文原文', eyebrow: '让论文阅读更顺手',
      headline: '从 alphaXiv<br><em>回到论文原文</em>',
      intro: '一键打开对应的 arXiv 论文。<br>选择你习惯的阅读方式。',
      features: ['右键论文链接，直接打开 arXiv', '保留当前版本，或选择最新版本', '复制摘要、PDF、HTML 链接'],
      foot: '从原文开始，继续你的研究。', capture: 'popup-zh-CN.png',
      alt: 'Back to arXiv 的真实简体中文弹窗', label: '真实插件界面 · 简体中文',
    }),
  },
  {
    name: 'promo-small', width: 440, height: 280,
    html: `${sharedHead('en', 'Back to arXiv', `
      *{box-sizing:border-box}html,body{margin:0;width:440px;height:280px;overflow:hidden;background:#933c35;color:#fff8ec}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      main{position:relative;width:440px;height:280px;padding:26px 30px}
      .brand{display:flex;align-items:center;gap:11px;font:26px Georgia,serif;letter-spacing:-.5px}
      .mark{display:grid;place-items:center;width:44px;height:44px;background:#fff7ea;border-radius:11px}.mark img{width:42px;height:42px}
      h1{position:relative;margin:23px 0 17px;font:41px/1.05 Georgia,serif;letter-spacing:-1.2px}
      p{margin:0;font-size:15px;color:#f2c9b4;letter-spacing:.25px}
      .orbit{position:absolute;width:370px;height:370px;left:300px;top:15px;border:1px solid #f0c2a744;border-radius:50%}
    `)}<body><main><div class="orbit" aria-hidden="true"></div><div class="brand"><span class="mark"><img src="../assets/icon-128.png" alt=""></span>Back to arXiv</div><h1>Back to the<br>original paper.</h1><p>alphaXiv → arXiv</p></main></body></html>`,
  },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, headless: true });
try {
  for (const artwork of artworks) {
    const htmlPath = join(source, `${artwork.name}.html`);
    await writeFile(htmlPath, artwork.html);
    const page = await browser.newPage({ viewport: { width: artwork.width, height: artwork.height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), artwork.width);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), artwork.height);
    await page.screenshot({ path: join(output, `${artwork.name}.png`), omitBackground: false });
    const png = await readFile(join(output, `${artwork.name}.png`));
    assert.equal(png.readUInt32BE(16), artwork.width);
    assert.equal(png.readUInt32BE(20), artwork.height);
    assert.equal(png[25], 2, 'Store screenshots use opaque RGB PNGs');
    console.log(`${artwork.name}.png: ${artwork.width}×${artwork.height}, opaque RGB PNG, ${png.length} bytes`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`Store graphics: ${output}`);
