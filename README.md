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

- **Page button:** Open the current alphaXiv paper on arXiv. The adjacent copy button copies its abstract-page link; the arrow opens a menu for copying Abstract, PDF, or HTML links.
- **Toolbar popup:** View the paper identifier and destination URL, choose Abstract, PDF, or HTML (experimental), select Current version or Latest version, and choose the current tab or a new tab. The copy menu offers all three link formats.
- **Right-click a paper link:** Choose **Open in arXiv** on a supported alphaXiv or arXiv link in another webpage. The paper opens in a new tab using your saved format and version preference, keeping the source page open.
- **Keyboard shortcut:** Press `Alt+Shift+A` on Windows/Linux or `Option+Shift+A` on macOS. The shortcut uses the same reading preferences as the page button.
- **Language:** The interface starts in English. Choose **English**, **简体中文**, or **Follow browser** in the popup. The choice is saved and also updates controls on open alphaXiv pages and the right-click menu.
- **Shortcut settings:** Open `chrome://extensions/shortcuts` or use the settings control in the popup. The popup displays the shortcut Chrome has actually assigned.

The defaults are **Abstract + Current version + current tab**, with English as the initial language. Changes are saved automatically, and upgrading from an older version keeps existing preferences while adding Current version as the version default.

**Current version** retains an explicit suffix such as `v3`. **Latest version** generates an unversioned URL so arXiv serves its most recent version; the extension constructs this URL locally. Opening actions in the popup, page controls, shortcut, and right-click menu use this version choice. Copy buttons and copy-format menus use the same choice. A source link that already omits a version stays unversioned with either choice.

The main **Copy original link** action produces an abstract-page link. Its adjacent menu can copy an Abstract, PDF, or HTML link for the selected version. Choosing a copy format leaves your saved reading format unchanged. Generated links retain the paper identifier and chosen version behavior, with source tracking parameters and discussion anchors removed.

**HTML (experimental)** opens `https://arxiv.org/html/<identifier>` using the selected version preference. Availability depends on arXiv's HTML support for that paper and version. You can switch to Abstract or PDF in the popup when you need another format. Read more in [arXiv's HTML documentation](https://info.arxiv.org/about/accessible_HTML.html).

## Internationalization

The interface supports English and Simplified Chinese. English is the initial language. **Follow browser** uses Chrome's language, with English as the fallback for other languages. Extension metadata and the keyboard-command description use Chrome's native i18n system with `default_locale` set to `en`.

Messages are stored in `public/_locales/en/messages.json` and `public/_locales/zh_CN/messages.json`. To add a UI language, add its message directory, register the language and catalog in `src/i18n.ts`, and update the popup's language choices and tests. The English catalog defines the message keys and fallback text.

## Supported URLs

- alphaXiv paper routes `/abs/`, `/pdf/`, `/html/`, and `/overview/` on `https://alphaxiv.org/` and `https://www.alphaxiv.org/`.
- arXiv `/abs/`, `/pdf/`, and `/html/` pages through the toolbar popup and keyboard shortcut.
- Supported alphaXiv and arXiv paper links through Chrome’s link context menu, including links on unrelated webpages.
- Modern identifiers such as `1706.03762v3` and legacy identifiers such as `hep-th/9901001v2` or `math.GT/0309136`.

The extension extracts the arXiv identifier from supported paper URLs. Other uploaded documents and profile pages show the waiting-for-a-paper state. Navigation starts when you click an action or press the shortcut.

Try the right-click action on these links: [alphaXiv paper, version 7](https://www.alphaxiv.org/abs/1706.03762v7), [arXiv paper, version 7](https://arxiv.org/abs/1706.03762v7), or [unversioned alphaXiv paper](https://www.alphaxiv.org/abs/1706.03762).

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

Version 0.4.0 passed TypeScript checking, 53 unit tests, the production build, and the browser integration suite on Chrome 155. Browser checks cover current/latest versions, three copy formats, keyboard menu controls, preference migration and persistence, English/Chinese layouts within Chrome's 600px popup limit, and navigation through the real MV3 service worker. Unit tests cover context-menu click handling and lifecycle; the browser suite verifies registration through Chrome's context-menu API. Use the manual checks below for native right-click selection and operating-system shortcuts.

### Manual checks

| Action | Expected result |
| --- | --- |
| Open `https://www.alphaxiv.org/abs/1706.03762` and click the page button | The current tab opens `https://arxiv.org/abs/1706.03762` with the default preferences |
| Select PDF and enable opening in a new tab | The paper's arXiv PDF opens in a new tab |
| Select HTML (experimental) on `https://www.alphaxiv.org/abs/1706.03762v7` | The extension opens `https://arxiv.org/html/1706.03762v7` |
| Open or copy a URL containing `vN` with Current version selected | The arXiv URL retains the same `vN` |
| Select Latest version on a versioned paper | The destination and copied URLs omit `vN`; the selected paper identifier stays the same |
| Choose Copy PDF or Copy HTML from either copy menu | The copied URL uses that format and selected version; the saved reading format stays unchanged |
| Right-click a supported paper link on another webpage | The paper opens in a new tab using the saved format and version; the source page stays open |
| Switch papers within alphaXiv | The page button points to the current paper |
| Navigate to the alphaXiv home page | The page button disappears |
| Press the keyboard shortcut on a paper page | The paper opens using the saved format, version, and tab preferences |
| Open the popup on an unrelated website | The popup prompts you to open a paper; preferences remain available |
| Switch between English and 简体中文, then reopen the popup | The popup and page button use the saved language; reading preferences retain their values |

Refresh existing alphaXiv tabs after installing or reloading the extension. If the shortcut is already assigned elsewhere, choose another one in Chrome's shortcut settings. If another extension redirects arXiv back to alphaXiv, adjust that extension's redirect settings.

## Chrome Web Store package

Run `npm run package:store` to create the extension ZIP and the complete listing kit in `release/`. Packaging requires Node.js 22+ and the `zip` / `unzip` commands included with macOS.

Upload `back-to-arxiv-0.4.0.zip` as the extension. The separate `back-to-arxiv-0.4.0-store-kit.zip` contains that ZIP, English/Chinese listing copy, screenshots, the store icon, permission explanations, reviewer steps, and a privacy-policy page. Each archive has a SHA-256 checksum.

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
src/navigation.ts      Navigation shared by the popup, shortcut, and link actions
src/background.ts      Message, keyboard-command, and context-menu handling
src/context-menu.ts    Paper-link context menu and language updates
scripts/              Build and icon generation
tests/                Unit and browser integration tests
store/                Store listing copy, images, and submission guidance
release/              Generated upload ZIP and complete submission kit
dist/                 Generated Chrome extension
```

## Permissions and data

| Permission or scope | Purpose |
| --- | --- |
| `storage` | Save reading format, version, tab, and language preferences locally |
| `activeTab` | Read the current paper URL when you invoke the extension or its shortcut |
| `clipboardWrite` | Write the selected abstract, PDF, or HTML link when you click a copy action |
| `contextMenus` | Add an action to supported paper links and read the clicked link’s target URL |
| The two alphaXiv HTTPS domains | Add page controls and follow navigation between papers |

URL conversion runs entirely in the browser. Current page URLs and the targets of links you invoke through the context menu are processed transiently to identify papers. Stored data consists of reading-format, version, tab, and language preferences; navigation goes directly to arXiv. Runtime resources are bundled with the extension.
