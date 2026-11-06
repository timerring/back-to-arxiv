# Back to arXiv

English | [简体中文](README.zh-CN.md)

A lightweight Chrome extension that opens alphaXiv papers and pasted paper links or identifiers on arXiv. Choose Abstract, PDF, or HTML, and copy clean links or Markdown for your notes. Built with Manifest V3 and TypeScript, with preferences stored locally in your browser.

Version 0.9.0 lets you search arXiv by title or selected text and move the floating controls out of the way. Minimize them to one button when you just want to open the current paper.

## Install in Chrome

For Chrome 120+, extract the versioned extension ZIP from the release, then follow the steps below starting at step 1. Select the extracted folder containing `manifest.json`. To build from source instead, use **Node.js 22.12.0+** and run the following commands in the project directory.

```sh
npm ci
npm run build
```

The build creates a `dist/` directory containing the unpacked extension.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the extracted extension folder or the generated **dist** directory.
5. Pin **Back to arXiv** from Chrome's extensions menu.
6. Open or refresh an alphaXiv paper. An **Open arXiv** button appears in the lower-right corner.

See Chrome's official guide to [loading an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Use

- **Page button:** Open the current alphaXiv paper on arXiv. The arrow beside Open offers Abstract, PDF, or HTML for that action only. The Copy button copies its abstract-page link; its menu offers three link formats and Markdown.
- **Move or minimize the page controls.** Drag the handle to position the toolbar. Choose **Minimize toolbar** on the page or enable **Minimize floating toolbar** in the popup to show a single arXiv button. Drag the button to move it, click to open the paper, or right-click to expand. The popup also restores the full toolbar or resets its position. Chrome remembers this layout across papers.
- **Find a paper by title.** Enter a title or keywords in the popup and choose **Search arXiv**, or highlight text on a webpage and choose **Find selected text on arXiv** from the context menu. An exact supported reference opens directly. For a query, choose a match by title, authors, and first-submission year, then open Abstract, PDF, or HTML in a new tab.
- **Toolbar popup:** Preview the paper identifier and destination URL, save your reading format, version, and tab preferences, or use the Open menu to choose a format just once.
- **Paste a paper:** Enter a supported alphaXiv/arXiv URL, a modern or legacy arXiv identifier, `arXiv:1706.03762v3`, a single Markdown link, or an arXiv DOI in the popup. Preview updates as you type. Opening a manually entered paper always uses a new tab, keeping the source page open.
- **Batch organizer:** Open the separate workspace from the popup. Paste one reference per line, review unique papers, duplicates, and invalid lines, then copy Markdown or download a `.md` file. Optionally fetch titles and authors from arXiv and export BibTeX. The popup remains focused on single-paper actions.
- **Right-click a paper link:** Choose **Open in arXiv** on a supported alphaXiv or arXiv link in another webpage. The paper opens in a new tab using your saved format and version preference, keeping the source page open.
- **Keyboard shortcut:** Press `Alt+Shift+A` on Windows/Linux or `Option+Shift+A` on macOS. The shortcut uses the same reading preferences as the page button.
- **Language:** The interface starts in English. Choose **English**, **简体中文**, or **Follow browser** in the popup. The choice is saved and also updates controls on open alphaXiv pages and the right-click menu.
- **Shortcut settings:** Open `chrome://extensions/shortcuts` or use the settings control in the popup. The popup displays the shortcut Chrome has actually assigned.

The defaults are **Abstract + Current version + current tab**, with English as the initial language. Preferences are saved automatically, and upgrades keep existing choices. Current-page actions follow the saved tab preference; manually entered papers and right-click link actions always open in a new tab.

**Current version** retains an explicit suffix such as `v3`. **Latest version** generates an unversioned URL so arXiv serves its most recent version; the extension constructs this URL locally. Opening actions in the popup, page controls, shortcut, and right-click menu use this version choice. Copy buttons and copy-format menus use the same choice. A source link that already omits a version stays unversioned with either choice.

The main **Copy original link** action produces an abstract-page link. Its adjacent menu can copy an Abstract, PDF, or HTML link, or Markdown such as `[arXiv:1706.03762v3](https://arxiv.org/abs/1706.03762v3)`. Markdown always links to the abstract page and uses the paper identifier as its label; the selected version rule applies to both. Choosing a temporary opening format or a copy format leaves your saved reading format unchanged. Generated links remove source tracking parameters and discussion anchors.

A nonempty input takes priority over the current page. Invalid input disables opening and copying until you correct or clear it. Clearing the field returns to the current paper. Input stays in memory while the popup is open and clears when it closes; clipboard access occurs only when you request a copy.

**HTML (experimental)** opens `https://arxiv.org/html/<identifier>` using the selected version preference. Availability depends on arXiv's HTML support for that paper and version. You can switch to Abstract or PDF in the popup when you need another format. Read more in [arXiv's HTML documentation](https://info.arxiv.org/about/accessible_HTML.html).

Search uses optional access to `export.arxiv.org`. On first use, click Search on the results page and approve access. Once granted, choosing search in the popup or context menu runs the query directly. Each page shows up to 10 results, with up to 200 available per query. Editing a query cancels pending work. Reloading or closing the tab clears it.

## Batch organizer

Paste up to **500 nonblank lines** and **100,000 characters** into the organizer. Each nonblank line is one supported paper reference: a URL, identifier, arXiv DOI, or inline Markdown link. Markdown bullet (`-`, `*`, `+`) and numbered-list prefixes are accepted; blank lines are ignored. Paragraphs and multiple references on one line are marked invalid.

Results update as you edit and retain the original line numbers. Duplicates point to the first matching line, and unique papers keep their first-occurrence order. **Current version** deduplicates the resolved identifier while retaining distinct versions: `1706.03762`, `1706.03762v2`, and `1706.03762v3` remain separate. **Latest version** removes version suffixes and merges them. The organizer starts with your saved version preference; changing it in the organizer does not change your popup preferences.

Before optional metadata retrieval, copy or download exports one Markdown bullet per unique valid paper, using its arXiv identifier and abstract-page URL:

```md
- [arXiv:1706.03762v3](https://arxiv.org/abs/1706.03762v3)
```

Invalid and duplicate lines remain visible for review and are excluded from export. If either input limit is exceeded, the whole batch is rejected and export is disabled; no partial list is silently produced. No export is available when there are no valid papers. Parsing, deduplication, and Markdown generation run locally without network requests. Drafts stay in the organizer's memory and clear when it is closed or reloaded. Copying and downloading happen only when requested.

### Titles, authors, and BibTeX

Click **Fetch paper details** to retrieve metadata from arXiv. On first use, Chrome asks for optional access to `https://export.arxiv.org/*`. This organizer action sends the selected unique arXiv identifiers to the official API. Batch labels and source URLs stay local. Denying or revoking access leaves local parsing and link-list export available. There is no automatic lookup when pasting, editing, changing language, or switching version.

Fetched titles and authors appear in the results. **Use titles in Markdown** replaces identifier labels with fetched titles; papers without a title retain their identifier labels. Markdown still exports every unique valid paper in source order:

```md
- [Attention Is All You Need](https://arxiv.org/abs/1706.03762v3)
```

**Copy BibTeX** and **Download .bib** include only papers with successfully fetched, version-matched metadata. The workbench shows the fetched/total count and excludes unavailable papers from BibTeX; it never invents titles or authors. BibTeX is generated locally from the API's Atom metadata rather than downloaded from arXiv's BibTeX page. Its year is the first-submission year, and its identifier and URL follow the selected current/latest rule. An explicit version must match that version's metadata; latest references use the returned latest paper without changing the unversioned destination.

Retrieval uses batches of at most 50 identifiers through one shared extension connection, waiting at least three seconds after each completed request. A request times out after 20 seconds and rejects responses over 2 MB. You can cancel; editing input, changing version, or closing the workbench also cancels pending work. Retrying requests only unavailable papers. Successful details remain only in this tab and clear on reload or close. The background stores only a request-pacing timestamp in `chrome.storage.session`, not identifiers, titles, authors, or response XML.

For **Obsidian**, paste the copied Markdown into a note or place the downloaded `.md` file in your vault. For **Zotero**, use **File → Import** and select the downloaded `.bib` file. These are standard file exports; the extension does not access either application's account or synchronize a library.

## Internationalization

The interface supports English and Simplified Chinese. English is the initial language. **Follow browser** uses Chrome's language, with English as the fallback for other languages. Extension metadata and the keyboard-command description use Chrome's native i18n system with `default_locale` set to `en`.

Messages are stored in `public/_locales/en/messages.json` and `public/_locales/zh_CN/messages.json`. To add a UI language, add its message directory, register the language and catalog in `src/i18n.ts`, and update the popup's language choices and tests. The English catalog defines the message keys and fallback text.

## Supported URLs

- alphaXiv paper routes `/abs/`, `/pdf/`, `/html/`, and `/overview/` on `https://alphaxiv.org/` and `https://www.alphaxiv.org/`.
- arXiv `/abs/`, `/pdf/`, and `/html/` pages through the toolbar popup and keyboard shortcut.
- Supported alphaXiv and arXiv paper links through Chrome’s link context menu, including links on unrelated webpages.
- Modern identifiers such as `1706.03762v3` and legacy identifiers such as `hep-th/9901001v2` or `math.GT/0309136`.
- Popup input accepts a complete supported paper URL, a plain identifier, or an `arXiv:`-prefixed identifier. Leading and trailing whitespace is trimmed.
- Smart paste accepts one Markdown link such as `[Attention](https://arxiv.org/abs/1706.03762v3)` or `[Attention](<https://arxiv.org/abs/1706.03762v3>)`, or one angle-bracket link such as `<https://arxiv.org/abs/1706.03762v3>`. The destination must be a supported paper or arXiv DOI URL. Labels are ignored; surrounding prose, multiple links, nested links, and optional Markdown titles are not accepted.
- arXiv DOIs: `10.48550/arXiv.1706.03762`, `doi:10.48550/arXiv.1706.03762`, and their `https://doi.org/` or `https://dx.doi.org/` URLs. These are parsed locally, without contacting a DOI resolver. Only the arXiv DOI namespace is supported, and a DOI with a version suffix is rejected. [arXiv DOIs identify the latest version](https://blog.arxiv.org/2022/02/17/new-arxiv-articles-are-now-automatically-assigned-dois/), so both version preferences produce an unversioned destination for DOI input.

The extension extracts the arXiv identifier from supported paper URLs. You can enter one paper at a time in the popup even from an unrelated webpage. Other uploaded documents and profile pages show the waiting-for-a-paper state when the input is empty. Navigation starts when you click an action or press the shortcut.

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

The browser tests use a temporary profile and intercepted fixture pages to exercise extension loading, page controls, copying, navigation, reading preferences, language switching, and popup actions. Citation tests use a staged copy of the build with the API host explicitly granted so headless Chrome can exercise the real service worker; the production manifest keeps this host optional. Permission-denial behavior is tested separately, and the native Chrome permission prompt and revocation need the manual checks below. They also check that English and Chinese HTML layouts fit Chrome's popup height limit. Screenshots are saved in `test-results/`. Use the manual checks below to verify live-site behavior and the operating-system shortcut.

You can also run the integration tests with a recent installed Chrome. This macOS launch method has been verified with Chrome 155:

```sh
CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
CHROMIUM_LOAD_EXTENSION_VIA_CDP=1 npm run test:browser
```

This also uses a temporary browser profile. The test invokes the real toolbar action to obtain `activeTab` access, then exercises the same popup document in a test tab.

Run `npm run test:memory` with the same browser environment variables for a separate resource-lifecycle stress test. It exercises 500 SPA transitions, preference/menu changes, and 40 popup open/close cycles, then writes garbage-collected heap, document, DOM-node, and event-listener measurements to `test-results/memory.json`. Its measurements cover intercepted fixture pages and extension popup documents in a temporary profile; use them to detect accumulation within those scenarios.

When running browser commands through Codex on macOS, use the approved execution context described in [AGENTS.md](AGENTS.md) from the initial launch. The restricted context on the development machine can cause Chrome to abort during application registration and show the system's **Reopen** prompt before loading the extension. Type checks, unit tests, builds, and packaging run in the workspace sandbox.

Version 0.9.0 passed TypeScript checking, 154 unit tests, the production build, and Chrome extension integration tests. Mouse and touch drags, click after drag, compact mode, restoring the toolbar, resize, reload, title search, paging, cancellation, and the original citation workflows were exercised. A live arXiv search returned 10 parseable papers. The resource regression passed 500 in-page navigations and 40 popup cycles after warmup. Native Chrome host-permission dialogs are covered by the manual reviewer steps.

Version 0.8.0 passed TypeScript checking, 113 unit tests, the production build, and Chrome 156 extension integration tests. Citation checks cover explicit retrieval, denied optional access, real service-worker requests with cookies/referrer omitted, title Markdown with identifier fallback, exact downloaded Markdown/BibTeX, missing-only retry, cancellation and stale responses, version changes, 50+1 request batching, pacing, and session-timestamp-only storage. CitationJS independently parses generated and downloaded BibTeX, checking title, authors, year, and URL. A direct live official API probe returned HTTP 200; the parser matched v1/v7 correctly, and generated BibTeX independently imported with eight authors and year 2017 for each. Desktop and 375px layouts were inspected. Native Chrome optional-host approval/revocation remains a manual check; the resource-lifecycle stress test has not been rerun for 0.8.0.

CitationJS and XML test support are development-only and are not bundled into the extension.

Historical validation for version 0.7.0: TypeScript checking, 84 unit tests, the production build, and the extension browser suite passed on Chrome 156. Browser checks cover the popup entry, mixed batch results and line numbers, version-aware deduplication without changing saved preferences, exact clipboard and downloaded Markdown contents, invalid-only and oversized input, clipboard-failure recovery, language changes, a 375px layout, draft clearing on reload, and preference-loading behavior. The organizer made no HTTP requests and stored no draft data in those fixtures. The resource-lifecycle stress test has not been rerun for 0.7.0.

Historical validation for version 0.6.0: TypeScript checking, 72 unit tests, the production build, and the browser integration suite passed on Chrome 156.0.8078.80. The fixture-based browser checks included Markdown/DOI input and real service-worker new-tab navigation, rejection of invalid or misleading references, consecutive keyboard format changes and language-select focus, and English/Chinese layouts within Chrome's 600px popup limit. The resource-lifecycle stress test was not rerun for 0.6.0.

Historical validation for version 0.5.1: TypeScript checking, 67 unit tests, the production build, the browser integration suite, and the resource-lifecycle stress test passed on Chrome 155. Those browser checks covered source-page title updates preserving the popup DOM, manual input and validation, temporary opening formats, Markdown and plain-link copying, current/latest versions, keyboard menu controls, native middle-click behavior, preference persistence, English/Chinese layouts within Chrome's 600px popup limit, and navigation through the real MV3 service worker. Unit tests covered context-menu click handling and lifecycle; the browser suite verified registration through Chrome's context-menu API. Use the manual checks below for native right-click selection and operating-system shortcuts.

In that 0.5.1 stress test, after 500 SPA transitions, 20 preference/menu rounds, and 40 popup open/close cycles, the post-warmup measurements kept one document per observed target, 114 content-page nodes with 53 listeners, and 280 popup nodes with 43 listeners. Popup JavaScript heap grew by approximately 8 KiB from the warm baseline. These historical results describe the finite fixture test and its observed counter scopes; they do not measure later versions, total Chrome memory, or behavior for every webpage.

### Manual checks

| Action | Expected result |
| --- | --- |
| Open `https://www.alphaxiv.org/abs/1706.03762` and click the page button | The current tab opens `https://arxiv.org/abs/1706.03762` with the default preferences |
| Select PDF and enable opening in a new tab | The paper's arXiv PDF opens in a new tab |
| Select HTML (experimental) on `https://www.alphaxiv.org/abs/1706.03762v7` | The extension opens `https://arxiv.org/html/1706.03762v7` |
| Open or copy a URL containing `vN` with Current version selected | The arXiv URL retains the same `vN` |
| Select Latest version on a versioned paper | The destination and copied URLs omit `vN`; the selected paper identifier stays the same |
| Choose a temporary format from either Open menu | That action uses the chosen format and saved version; the saved reading format stays unchanged |
| Enter `arXiv:1706.03762v3` or `hep-th/9901001v2` in the popup | Preview shows the entered paper; opening uses a new tab even when the tab preference is off |
| Paste `[Attention](https://arxiv.org/abs/1706.03762v3)` or `<https://arxiv.org/abs/1706.03762v3>` | Preview selects `1706.03762v3`; copying produces a clean arXiv link |
| Paste `doi:10.48550/arXiv.1706.03762` or `https://doi.org/10.48550/arXiv.1706.03762` | Preview and copied links use unversioned `1706.03762` under either version preference |
| Paste multiple Markdown links, surrounding prose, a journal DOI, or an arXiv DOI ending in `v3` | Opening and copying remain disabled |
| Enter a malformed reference such as `arXiv:invalid` on a supported paper page | Opening and copying are disabled until the input is corrected or cleared |
| Clear the input, or close and reopen the popup | The popup returns to the current page; entered text is cleared |
| Choose Copy PDF or Copy HTML from either copy menu | The copied URL uses that format and selected version; the saved reading format stays unchanged |
| Choose Copy Markdown link for `1706.03762v3` | Current version produces `[arXiv:1706.03762v3](https://arxiv.org/abs/1706.03762v3)`; Latest version removes `v3` from both parts |
| Right-click a supported paper link on another webpage | The paper opens in a new tab using the saved format and version; the source page stays open |
| Switch papers within alphaXiv | The page button points to the current paper |
| Navigate to the alphaXiv home page | The page button disappears |
| Press the keyboard shortcut on a paper page | The paper opens using the saved format, version, and tab preferences |
| Open the popup on an unrelated website | Enter a paper URL or identifier to open or copy it; preferences remain available |
| Switch between English and 简体中文, then reopen the popup | The popup and page button use the saved language; reading preferences retain their values |
| Change format, version, or language using the keyboard | Focus returns to that preference after saving; moving to another control during saving keeps that new focus |
| Open Batch organizer and paste a mixed paper list | Results mark unique, duplicate, and invalid lines using the original line numbers |
| Paste unversioned, `v2`, and `v3` references to one paper | Current version keeps three entries; Latest version merges them and leaves the saved popup preference unchanged |
| Copy or download a mixed batch before Fetch | Markdown contains unique valid papers in first-occurrence order, with identifier labels and abstract links |
| Paste more than 500 nonblank lines or 100,000 characters | The whole batch shows a limit error and export remains disabled |
| Paste references without clicking Fetch | No metadata request or optional-host prompt occurs; identifier Markdown remains available |
| Click Fetch paper details and approve Chrome's optional arXiv access prompt | Titles and authors appear; title-based Markdown and BibTeX become available |
| Deny or revoke arXiv access, then request details | A clear access message appears; local link-list export still works |
| Toggle Use titles in Markdown after fetching | Markdown changes between fetched-title labels and identifier labels without another lookup |
| Copy/download BibTeX and import the .bib file into Zotero | Only successful unique papers are imported, with title, authors, first-submission year, and selected identifier/URL |
| Cancel a fetch, edit the list, or change its version | Pending retrieval stops and old responses cannot populate the new selection |
| Reload or close the organizer | Draft and fetched metadata clear; saved reading preferences remain available |

Refresh existing alphaXiv tabs after installing or reloading the extension. If the shortcut is already assigned elsewhere, choose another one in Chrome's shortcut settings. If another extension redirects arXiv back to alphaXiv, adjust that extension's redirect settings.

## Chrome Web Store package

Run `npm run package:store` to create the extension ZIP and the complete listing kit in `release/`. Packaging requires Node.js 22.12.0+ and the `zip` / `unzip` commands included with macOS.

Upload `back-to-arxiv-0.9.0.zip` as the extension. The separate `back-to-arxiv-0.9.0-store-kit.zip` contains that ZIP, English/Chinese listing copy, screenshots, the store icon, permission explanations, reviewer steps, and a privacy-policy page. Each archive has a SHA-256 checksum.

See [the submission guide](store/START-HERE.txt) for fields and assets. Use the public [privacy policy](https://timerring.com/back-to-arxiv/store/privacy-policy.html) in the Chrome Web Store's Privacy policy URL field. Confirm the publisher contact details before submitting. Support is available through [GitHub Issues](https://github.com/timerring/back-to-arxiv/issues).

GitHub Pages publishes the policy directly from `store/privacy-policy.html` on `main`. Updating that file and pushing to `main` updates the live policy. The repository root's `.nojekyll` preserves the static HTML, and `index.html` points visitors to the policy.

Use `npm run store:assets` to render the store graphics from their saved captures and layouts. After future UI changes, refresh the captures as described in the guide.

## Project structure

```text
public/manifest.json   Chrome configuration, permissions, and shortcut
public/popup.*         Popup HTML and styles
public/batch.*         Separate batch-organizer HTML and styles
public/_locales/       Chrome i18n messages and UI translations
src/i18n.ts            UI language selection and message lookup
src/paper.ts           Paper URL/identifier parsing, URL and Markdown generation
src/search.ts          Search input, query and launch URL handling
src/search-page.ts     Search results, pagination and cancellation
src/batch.ts           Batch parsing, deduplication, and Markdown-list generation
src/batch-page.ts      Batch-organizer interactions and export
src/citations.ts       Atom metadata parsing and title/BibTeX generation
src/metadata-protocol.ts  Validated metadata message contract and limits
src/metadata-service.ts   Shared arXiv request queue, pacing, and cancellation
src/settings.ts        Local preferences
src/content.ts         alphaXiv page controls and navigation handling
src/popup.ts           Toolbar popup interactions
src/navigation.ts      Navigation shared by the popup, shortcut, and link actions
src/messages.ts        Validated popup requests for current-page and entered papers
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
| `storage` | Save reading preferences and the floating toolbar layout locally and a request-pacing timestamp in session storage |
| `activeTab` | Read the current paper URL when you invoke the extension or its shortcut |
| `clipboardWrite` | Write a requested paper link, Markdown list, or generated BibTeX |
| `contextMenus` | Open a chosen paper link or find a paper from text selected for the context-menu action |
| The two alphaXiv HTTPS domains | Add page controls and follow navigation between papers |
| Optional `https://export.arxiv.org/*` | Search by title or keywords, or fetch batch metadata, after optional Chrome authorization |

URL parsing, deduplication, and export generation run in the browser. Current-page URLs, chosen context-menu link targets, pasted references, and fetched metadata are transient; drafts and metadata clear when their page closes or reloads. Reading preferences, the toolbar position, and its minimized state are saved locally. The only metadata-service session value is a pacing timestamp; no identifiers or responses are stored there.

Metadata retrieval is optional. After your Fetch click and Chrome permission grant, selected unique identifiers are sent to `https://export.arxiv.org/api/query`. Requests omit cookies and the referrer; arXiv still receives the identifiers and normal network information such as IP address and headers. It handles these requests under its own privacy practices. Pasted labels and complete source URLs are not sent. Markdown uses fetched title labels when selected, with identifier fallback; generated BibTeX includes fetched papers only. Copy and file download require your action. Search also uses the optional API host. Choosing Search sends the query text or selected words and the requested page offset. Query text travels to the extension results page in a fragment cleared on entry. Queries and results stay in that tab’s memory and clear on reload or close. Executable resources remain bundled.
