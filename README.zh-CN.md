# Back to arXiv

[English](README.md) | 简体中文

从 alphaXiv 一键回到 arXiv 原文，也可粘贴论文链接或编号的 Chrome 扩展。支持摘要、PDF、HTML，以及纯链接和 Markdown 复制。采用 Manifest V3 + TypeScript，设置保存在浏览器本地。

0.5.1 改善面板稳定性：仅在有效页面网址变化时刷新论文状态，本地化保留已匹配的文本与属性，修复将面板作为独立标签页打开时的重复渲染。

## 安装到 Chrome

需要 **Node.js 22+** 和 **Chrome 120+**。克隆或下载本仓库后，在项目根目录运行：

```sh
npm ci
npm run build
```

构建完成后，项目根目录会生成可加载的 `dist/` 文件夹。

1. 在 Chrome 地址栏输入 `chrome://extensions`。
2. 打开右上角的 **开发者模式**。
3. 点击 **加载已解压的扩展程序**。
4. 选择项目根目录下生成的 **dist 文件夹**。
5. 点击浏览器工具栏的扩展程序图标，将 **Back to arXiv** 固定到工具栏。
6. 打开或刷新一篇 alphaXiv 论文，右下角会出现 **Open arXiv** 按钮。插件界面默认使用英文，可在工具栏面板的语言选项中切换为简体中文。

Chrome 的官方加载说明：[Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)。

## 使用

- **页面按钮**：在 alphaXiv 论文页右下角点击“打开 arXiv”，旁边的打开菜单可为本次操作选择摘要、PDF 或 HTML。主复制按钮复制摘要页链接，复制菜单提供三种格式及 Markdown。
- **工具栏面板**：预览论文编号和目标网址，保存阅读格式、版本和标签页偏好，或通过打开菜单临时选择一次格式。
- **粘贴论文**：输入受支持的 alphaXiv/arXiv 链接、现代或旧式 arXiv 编号，也可输入 `arXiv:1706.03762v3`。面板随输入即时更新预览，手动输入的论文始终在新标签页打开，保留来源页面。
- **右键论文链接**：在其他网页上右键 alphaXiv 或 arXiv 论文链接，选择“在 arXiv 中打开”，即可按保存的阅读格式和版本偏好在新标签页打开，保留来源网页。
- **快捷键**：Windows/Linux 为 `Alt+Shift+A`，macOS 为 `Option+Shift+A`。快捷键与页面按钮使用相同偏好。
- **界面语言**：首次使用默认显示英文。面板中可选择 **English**、**简体中文** 或 **Follow browser（跟随浏览器）**，选择后自动保存，并同步更新已打开页面上的控件和右键菜单。
- **设置快捷键**：打开 `chrome://extensions/shortcuts`，或点击面板底部的“设置”。面板显示 Chrome 实际分配的快捷键。

默认偏好是 **摘要页 + 保留当前版本 + 当前标签页**，界面初始语言为英文。选择后自动保存，升级保留已有偏好。针对当前页面的操作遵循已保存的标签页偏好；手动输入和右键链接始终在新标签页打开。

**保留当前版本**保留 `v3` 等明确版本号；**最新版本**生成省略版本号的地址，由 arXiv 提供最新版本。地址转换在本地完成。版本选择同时适用于面板、页面控件、快捷键和右键链接操作。源链接已经省略版本号时，两种选择都生成省略版本号的地址。

主“复制原文链接”按钮生成摘要页链接，旁边的菜单可复制摘要、PDF、HTML 链接或 Markdown，例如 `[arXiv:1706.03762v3](https://arxiv.org/abs/1706.03762v3)`。Markdown 始终链接到摘要页，以论文编号为标签，标签与链接一起遵循当前／最新版本偏好。临时选择打开格式或复制格式时，保存的默认阅读格式保持原值。生成的链接清理源站跟踪参数和讨论锚点。

输入框有内容时，操作对象以输入为准；输入无效时，打开和复制操作保持禁用，修正或清空后恢复。清空输入会返回当前页面的论文。输入仅在面板运行时内存中处理，关闭面板即清空；剪贴板访问仅用于主动请求的复制操作。

**HTML (experimental)** 按选定的版本偏好打开 `https://arxiv.org/html/<编号>`。HTML 由 arXiv 提供，覆盖范围取决于论文和版本；需要其他格式时，可以在面板切换摘要页或 PDF。详见 [arXiv HTML 说明](https://info.arxiv.org/about/accessible_HTML.html)。

## 国际化

插件支持英文和简体中文。语言偏好保存在本地；选择 **Follow browser** 时，界面跟随 Chrome 的语言，其他语言使用英文回退。扩展名称、说明和快捷键描述通过 Chrome 原生 i18n 加载，`default_locale` 为 `en`。

翻译文件位于 `public/_locales/en/messages.json` 和 `public/_locales/zh_CN/messages.json`。新增界面语言时，添加对应的消息目录，在 `src/i18n.ts` 注册语言和消息，并更新面板语言选项及测试。英文消息是翻译键与回退文案的基准。

## 手动验收

以下界面文案以选择简体中文为例。

| 操作 | 预期结果 |
| --- | --- |
| 打开 `https://www.alphaxiv.org/abs/1706.03762`，点击页面按钮 | 当前标签页进入 `https://arxiv.org/abs/1706.03762` |
| 切换为 PDF，开启新标签页，再点击按钮 | 在新标签页打开对应的 arXiv PDF |
| 在 `https://www.alphaxiv.org/abs/1706.03762v7` 选择 HTML (experimental) 并打开 | 进入 `https://arxiv.org/html/1706.03762v7`，保留 `v7` |
| 选择当前版本，在带 `vN` 的论文地址上打开或复制 | arXiv 地址保留同一 `vN` |
| 在带版本号的论文页面选择最新版本 | 目标网址与复制链接省略 `vN`，论文编号保持一致 |
| 在任一打开菜单临时选择格式 | 本次操作采用所选格式和已保存的版本偏好，默认阅读格式保持原值 |
| 在面板输入 `arXiv:1706.03762v3` 或 `hep-th/9901001v2` | 预览显示输入的论文；即使关闭新标签页偏好，也在新标签页打开 |
| 在受支持论文页的面板输入无效文本 | 打开与复制操作禁用，修正或清空后恢复 |
| 清空输入，或关闭再重新打开面板 | 恢复当前页论文，输入内容清空 |
| 在任一复制菜单选择 PDF 或 HTML | 生成对应格式及所选版本的链接，默认阅读格式保持原值 |
| 为 `1706.03762v3` 选择复制 Markdown 链接 | 当前版本生成 `[arXiv:1706.03762v3](https://arxiv.org/abs/1706.03762v3)`；最新版本同时省略标签和链接中的 `v3` |
| 在其他网页上右键受支持的论文链接 | 按保存的格式和版本在新标签页打开，来源网页保持打开 |
| 在 alphaXiv 站内切换论文，再点击按钮 | 打开当前论文的 arXiv 地址 |
| 进入 alphaXiv 首页 | 页面按钮收起 |
| 在论文页按快捷键 | 按照保存的格式、版本和标签页偏好打开原文 |
| 在普通网站打开工具栏面板 | 可输入论文链接或编号后打开、复制，偏好设置可用 |
| 切换 English / 简体中文，并重新打开面板 | 面板和页面按钮使用所选语言，阅读偏好保持原值 |

安装或重新加载扩展后，刷新已经打开的 alphaXiv 页面，让内容脚本重新加载。快捷键发生占用时，可以在 Chrome 快捷键设置页重新分配。若同时使用会将 arXiv 跳向 alphaXiv 的其他扩展，可以调整对应扩展的跳转设置。

## 支持的地址

- alphaXiv：`https://alphaxiv.org/` 和 `https://www.alphaxiv.org/` 下的 `/abs/`、`/pdf/`、`/html/`、`/overview/` 论文入口。
- 工具栏与快捷键也支持 arXiv 的 `/abs/`、`/pdf/`、`/html/` 入口。
- Chrome 右键菜单支持其他网页里的 alphaXiv 和 arXiv 论文链接。
- 现代编号（如 `1706.03762v3`）和旧式编号（如 `hep-th/9901001v2`、`math.GT/0309136`）。
- 面板输入支持完整论文网址、单独编号及带 `arXiv:` 前缀的编号，会去除前后空白。

扩展通过受支持地址中的 arXiv 编号建立对应关系。在普通网页也可打开面板，每次输入一篇论文。输入为空时，其他上传文档或个人页面显示等待论文状态。所有跳转均由用户点击或按快捷键触发。

可在以下链接上测试右键操作：[alphaXiv 论文 v7](https://www.alphaxiv.org/abs/1706.03762v7)、[arXiv 论文 v7](https://arxiv.org/abs/1706.03762v7)、[省略版本号的 alphaXiv 论文](https://www.alphaxiv.org/abs/1706.03762)。

## 开发与验证

安装依赖后，运行完整的本地检查与构建：

```sh
npm run check
```

`check` 执行 TypeScript 类型检查、单元测试和生产构建，构建结果输出到 `dist/`。更新后，在 `chrome://extensions` 点击扩展卡片上的重新加载按钮，再刷新 alphaXiv 页面。

运行真实 Chromium 扩展集成测试：

```sh
npx playwright install chromium
npm run test:browser
```

浏览器测试使用独立临时配置和本地拦截的论文页面，验证扩展加载、页面按钮、复制、站内导航、阅读偏好、语言切换及弹窗跳转，也会检查中英文 HTML 布局符合 Chrome 弹窗高度限制。截图输出到 `test-results/`。真实网站最终落点及操作系统快捷键通过上面的手动步骤验证。

也可使用本机较新的 Chrome 执行集成测试，以下 macOS 启动方式已在 Chrome 155 验证：

```sh
CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
CHROMIUM_LOAD_EXTENSION_VIA_CDP=1 npm run test:browser
```

此方式同样创建独立的临时浏览器配置。测试通过真实工具栏动作获取 `activeTab` 授权，再在测试标签页检查同一面板文档。

沿用相同浏览器环境变量，运行 `npm run test:memory` 可执行独立的资源生命周期压力测试。它覆盖 500 次站内切换、偏好与菜单操作，以及 40 次弹窗打开／关闭，将垃圾回收后的堆内存、文档、DOM 节点与事件监听器数量写入 `test-results/memory.json`。测量范围为临时配置中的本地拦截页面及扩展面板文档，用于检查这些场景中的资源累积。

在 macOS 的 Codex 中运行浏览器命令时，首次启动即使用 [AGENTS.md](AGENTS.md) 规定的获准执行环境。当前开发机的受限环境可能使 Chrome 在系统应用注册阶段中止，并在加载插件之前出现系统 **Reopen** 提示。类型检查、单元测试、构建和打包仍在工作区沙箱中运行。

0.5.1 已通过类型检查、67 项单元测试、生产构建，以及 Chrome 155 浏览器集成测试和资源生命周期压力测试。浏览器验证确认源论文标题更新时面板 DOM 保持稳定，并覆盖手动输入与校验、临时打开格式、Markdown 和普通链接复制、当前／最新版本、菜单键盘操作、原生中键打开、偏好持久化、中英文弹窗高度，以及真实 MV3 后台导航。右键菜单的点击处理和生命周期由单元测试覆盖，Chrome 集成测试验证菜单已成功注册。浏览器原生右键选择和操作系统快捷键可按上方手动验收步骤检查。

经过 500 次站内切换、20 轮偏好／菜单操作和 40 次面板打开／关闭，预热后的观测目标均保持 1 个文档；内容页保持 114 个节点和 53 个监听器，面板保持 280 个节点和 43 个监听器。面板 JavaScript 堆相对预热基线增加约 8 KiB。这些数值描述有限测试页面及已观测计数范围，适合判断本次场景中的资源累积；Chrome 总内存和其他网页场景需要分别测量。

## Chrome Web Store 上架包

运行 `npm run package:store`，即可在 `release/` 生成扩展 ZIP 和完整上架资料包。打包需要 Node.js 22+ 以及 macOS 已内置的 `zip` / `unzip` 命令。

扩展上传文件为 `back-to-arxiv-0.5.1.zip`。另一个 `back-to-arxiv-0.5.1-store-kit.zip` 包含安装包、中英文介绍、截图、图标、权限说明、审核测试步骤和隐私政策网页；每个 ZIP 都有 SHA-256 校验文件。

填写说明见[上架指南](store/START-HERE.txt)。在 Chrome Web Store 的 Privacy policy URL 字段填写公开的[隐私政策网址](https://timerring.com/back-to-arxiv/store/privacy-policy.html)，提交前确认开发者联系方式。公开支持入口为 [GitHub Issues](https://github.com/timerring/back-to-arxiv/issues)。

GitHub Pages 直接发布 `main` 分支的 `store/privacy-policy.html`。修改该文件并推送到 `main` 后，线上政策会随之更新。仓库根目录的 `.nojekyll` 保留静态 HTML，`index.html` 将首页访问引导到隐私政策。

使用 `npm run store:assets` 可基于已保存的截图和排版重新渲染商店图片；界面修改后的截图更新步骤见指南。

## 文件结构

```text
public/manifest.json   Chrome 配置、权限与快捷键
public/popup.*        面板 HTML 与样式
public/_locales/      Chrome i18n 消息与界面翻译
src/i18n.ts          界面语言选择与消息读取
src/paper.ts          论文地址／编号识别、arXiv 地址及 Markdown 生成
src/settings.ts       本地偏好存取
src/content.ts        alphaXiv 页面按钮及站内导航处理
src/popup.ts          工具栏面板交互
src/navigation.ts    面板、快捷键与链接操作共用的导航逻辑
src/messages.ts      面板导航请求的来源与参数校验
src/background.ts    消息处理、快捷键与右键菜单
src/context-menu.ts  论文链接右键菜单与语言更新
scripts/             构建及图标生成
tests/               地址解析、偏好、导航与浏览器集成测试
dist/                构建生成的 Chrome 扩展
```

## 权限与数据

| 权限/范围 | 用途 |
| --- | --- |
| `storage` | 在本地保存阅读格式、版本、标签页和语言偏好 |
| `activeTab` | 用户点击插件或触发快捷键时，读取当前页的论文地址 |
| `clipboardWrite` | 用户点击复制时，将选定的摘要、PDF、HTML 或 Markdown 链接写入剪贴板 |
| `contextMenus` | 在受支持的论文链接上显示右键操作，并读取用户点击的链接目标网址 |
| alphaXiv 的两个 HTTPS 域名 | 注入页面按钮，跟随站内论文切换 |

所有转换逻辑在浏览器内执行。当前页面网址、主动选择的右键链接目标，以及手动输入的论文网址或编号，用于临时识别论文。输入仅保留在面板内存中，关闭面板即清空。持久保存的数据为阅读格式、版本、标签页和语言偏好；临时格式仅作用于本次操作。Markdown 标签由论文编号在本地生成。页面跳转直接前往 arXiv，运行时资源均随扩展打包。0.5 沿用 0.4 的权限及站点范围。
