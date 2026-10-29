# Back to arXiv

English | [简体中文](README.zh-CN.md)

A lightweight Chrome extension that opens alphaXiv papers on arXiv in abstract, PDF, or HTML format. Built with Manifest V3 and TypeScript, with preferences stored locally in your browser.

## Install in Chrome

Requires **Node.js 22+** and **Chrome 120+**. Clone or download this repository, then run these commands from the project directory:

```sh
npm ci
npm run build
```

The build creates a `dist/` directory containing the unpacked extension.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the generated **dist** directory.
5. Pin **Back to arXiv** from Chrome's extensions menu.
6. Open or refresh an alphaXiv paper. An **Open arXiv** button appears in the lower-right corner.

See Chrome's official guide to [loading an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Use

- **Page button:** Open the current alphaXiv paper on arXiv. The adjacent copy button copies its original arXiv link.
- **Toolbar popup:** View the paper identifier, open or copy its link, choose Abstract, PDF, or HTML (experimental), and select the current tab or a new tab.
- **Keyboard shortcut:** Press `Alt+Shift+A` on Windows/Linux or `Option+Shift+A` on macOS. The shortcut uses the same reading preferences as the page button.
- **Language:** The interface starts in English. Choose **English**, **简体中文**, or **Follow browser** in the popup. The choice is saved and also updates buttons on open alphaXiv pages.
- **Shortcut settings:** Open `chrome://extensions/shortcuts` or use the settings control in the popup. The popup displays the shortcut Chrome has actually assigned.

The default reading preference is **Abstract + current tab**. Changes are saved automatically. Copying always produces an arXiv abstract-page URL and preserves an explicit version such as `v3`. Source query parameters and discussion anchors are removed. Links that omit a version continue to omit it, allowing arXiv to display its current version.

**HTML (experimental)** opens `https://arxiv.org/html/<identifier>` for the same paper version. Availability depends on arXiv's HTML support for that paper and version. You can switch to Abstract or PDF in the popup when you need another format. Read more in [arXiv's HTML documentation](https://info.arxiv.org/about/accessible_HTML.html).

## Internationalization

The interface supports English and Simplified Chinese. English is the initial language. **Follow browser** uses Chrome's language, with English as the fallback for other languages. Extension metadata and the keyboard-command description use Chrome's native i18n system with `default_locale` set to `en`.

Messages are stored in `public/_locales/en/messages.json` and `public/_locales/zh_CN/messages.json`. To add a UI language, add its message directory, register the language and catalog in `src/i18n.ts`, and update the popup's language choices and tests. The English catalog defines the message keys and fallback text.

## Supported URLs

- alphaXiv paper routes `/abs/`, `/pdf/`, `/html/`, and `/overview/` on `https://alphaxiv.org/` and `https://www.alphaxiv.org/`.
- arXiv `/abs/`, `/pdf/`, and `/html/` pages through the toolbar popup and keyboard shortcut.
- Modern identifiers such as `1706.03762v3` and legacy identifiers such as `hep-th/9901001v2` or `math.GT/0309136`.

The extension extracts the arXiv identifier from supported paper URLs. Other uploaded documents and profile pages show the waiting-for-a-paper state. Navigation starts when you click an action or press the shortcut.

## Development and testing

After installing dependencies, run the local checks and production build:

```sh
npm run check
```

This runs TypeScript checking, unit tests, and the build. To load a new build into Chrome, click **Reload** on the extension's card at `chrome://extensions`, then refresh any open alphaXiv pages.

Run the Chromium extension integration tests with:

```sh
npx playwright install chromium
npm run test:browser
```

The browser tests use a temporary profile and intercepted fixture pages to exercise extension loading, page controls, copying, navigation, reading preferences, language switching, and popup actions. They also check that English and Chinese HTML layouts fit Chrome's popup height limit. Screenshots are saved in `test-results/`. Use the manual checks below to verify live-site behavior and the operating-system shortcut.

You can also run the integration tests with a recent installed Chrome. This macOS launch method has been verified with Chrome 155:

```sh
CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
CHROMIUM_LOAD_EXTENSION_VIA_CDP=1 npm run test:browser
```

This also uses a temporary browser profile. The test invokes the real toolbar action to obtain `activeTab` access, then exercises the same popup document in a test tab.

Version 0.3.0 passed TypeScript checking, 35 unit tests, the production build, and the browser integration suite on Chrome 155. Manual Chrome checks confirmed the English default, English/Chinese/Follow browser selection, saved preferences, and live page-button translations. Earlier 0.2.0 checks also covered abstract/PDF navigation, new tabs, copying, and the keyboard shortcut, including opening the HTML version of `1706.03762v7`.

### Manual checks

| Action | Expected result |
| --- | --- |
| Open `https://www.alphaxiv.org/abs/1706.03762` and click the page button | The current tab opens `https://arxiv.org/abs/1706.03762` with the default preferences |
| Select PDF and enable opening in a new tab | The paper's arXiv PDF opens in a new tab |
| Select HTML (experimental) on `https://www.alphaxiv.org/abs/1706.03762v7` | The extension opens `https://arxiv.org/html/1706.03762v7` |
| Open or copy a URL containing `vN` | The arXiv URL retains the same `vN` |
| Switch papers within alphaXiv | The page button points to the current paper |
| Navigate to the alphaXiv home page | The page button disappears |
| Press the keyboard shortcut on a paper page | The paper opens using the saved format and tab preference |
| Open the popup on an unrelated website | The popup prompts you to open a paper; preferences remain available |
| Switch between English and 简体中文, then reopen the popup | The popup and page button use the saved language; reading preferences retain their values |

Refresh existing alphaXiv tabs after installing or reloading the extension. If the shortcut is already assigned elsewhere, choose another one in Chrome's shortcut settings. If another extension redirects arXiv back to alphaXiv, adjust that extension's redirect settings.

## Chrome Web Store package

Run `npm run package:store` to create the extension ZIP and the complete listing kit in `release/`. Packaging requires Node.js 22+ and the `zip` / `unzip` commands included with macOS.

Upload `back-to-arxiv-0.3.0.zip` as the extension. The separate `back-to-arxiv-0.3.0-store-kit.zip` contains that ZIP, English/Chinese listing copy, screenshots, the store icon, permission explanations, reviewer steps, and a privacy-policy page. Each archive has a SHA-256 checksum.

See [the submission guide](store/START-HERE.txt) for fields and assets. Use the public [privacy policy](https://timerring.com/back-to-arxiv/store/privacy-policy.html) in the Chrome Web Store's Privacy policy URL field. Confirm the publisher contact details before submitting. Support is available through [GitHub Issues](https://github.com/timerring/back-to-arxiv/issues).

GitHub Pages publishes the policy directly from `store/privacy-policy.html` on `main`. Updating that file and pushing to `main` updates the live policy. The repository root's `.nojekyll` preserves the static HTML, and `index.html` points visitors to the policy.

Use `npm run store:assets` to render the store graphics from their saved captures and layouts. After UI changes, refresh the captures as described in the guide.

## Project structure

```text
public/manifest.json   Chrome configuration, permissions, and shortcut
public/popup.*         Popup HTML and styles
public/_locales/       Chrome i18n messages and UI translations
src/i18n.ts            UI language selection and message lookup
src/paper.ts           Paper URL parsing and arXiv URL generation
src/settings.ts        Local preferences
src/content.ts         alphaXiv page controls and navigation handling
src/popup.ts           Toolbar popup interactions
src/navigation.ts      Navigation shared by the popup and shortcut
src/background.ts      Message and keyboard-command handling
scripts/              Build and icon generation
tests/                Unit and browser integration tests
store/                Store listing copy, images, and submission guidance
release/              Generated upload ZIP and complete submission kit
dist/                 Generated Chrome extension
```

## Permissions and data

| Permission or scope | Purpose |
| --- | --- |
| `storage` | Save reading, tab, and language preferences locally |
| `activeTab` | Read the current paper URL when you invoke the extension or its shortcut |
| `clipboardWrite` | Copy the original paper link when you click Copy |
| The two alphaXiv HTTPS domains | Add page controls and follow navigation between papers |

URL conversion runs entirely in the browser. The extension stores reading and language preferences, and navigation goes directly to arXiv. Runtime resources are bundled with the extension.
