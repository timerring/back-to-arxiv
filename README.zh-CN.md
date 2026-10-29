# Back to arXiv

[English](README.md) | 简体中文

从 alphaXiv 一键回到 arXiv 原文的 Chrome 扩展。采用 Manifest V3 + TypeScript，设置保存在浏览器本地。

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

- **页面按钮**：在 alphaXiv 论文页右下角点击“打开 arXiv”，旁边的复制按钮复制原文链接。
- **工具栏面板**：查看论文编号、打开原文、复制原文链接，选择摘要页、PDF 或 HTML (experimental)，并设置当前标签页或新标签页。
- **快捷键**：Windows/Linux 为 `Alt+Shift+A`，macOS 为 `Option+Shift+A`。快捷键与页面按钮使用相同偏好。
- **界面语言**：首次使用默认显示英文。面板中可选择 **English**、**简体中文** 或 **Follow browser（跟随浏览器）**，选择后自动保存，并同步更新已打开页面上的按钮。
- **设置快捷键**：打开 `chrome://extensions/shortcuts`，或点击面板底部的“设置”。面板显示 Chrome 实际分配的快捷键。

默认偏好是 **摘要页 + 当前标签页**，选择后自动保存。复制功能始终生成 arXiv 摘要页地址，保留明确的版本号；源页面的查询参数和讨论锚点在转换时清理。原始链接包含 `v3` 时，生成链接也包含 `v3`；原始链接省略版本时，生成链接同样省略版本，由 arXiv 展示其当前版本。

**HTML (experimental)** 打开同一论文版本的 `https://arxiv.org/html/<编号>`。HTML 由 arXiv 提供，覆盖范围取决于论文和版本；需要其他格式时，可以在面板切换摘要页或 PDF。详见 [arXiv HTML 说明](https://info.arxiv.org/about/accessible_HTML.html)。

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
| 在带 `vN` 的论文地址上打开或复制 | arXiv 地址保留同一 `vN` |
| 在 alphaXiv 站内切换论文，再点击按钮 | 打开当前论文的 arXiv 地址 |
| 进入 alphaXiv 首页 | 页面按钮收起 |
| 在论文页按快捷键 | 按照保存的格式和标签页偏好打开原文 |
| 在普通网站打开工具栏面板 | 展示“从一篇论文开始”，偏好设置可用 |
| 切换 English / 简体中文，并重新打开面板 | 面板和页面按钮使用所选语言，阅读偏好保持原值 |

安装或重新加载扩展后，刷新已经打开的 alphaXiv 页面，让内容脚本重新加载。快捷键发生占用时，可以在 Chrome 快捷键设置页重新分配。若同时使用会将 arXiv 跳向 alphaXiv 的其他扩展，可以调整对应扩展的跳转设置。

## 支持的地址

- alphaXiv：`https://alphaxiv.org/` 和 `https://www.alphaxiv.org/` 下的 `/abs/`、`/pdf/`、`/html/`、`/overview/` 论文入口。
- 工具栏与快捷键也支持 arXiv 的 `/abs/`、`/pdf/`、`/html/` 入口。
- 现代编号（如 `1706.03762v3`）和旧式编号（如 `hep-th/9901001v2`、`math.GT/0309136`）。

扩展通过受支持地址中的 arXiv 编号建立对应关系。其他上传文档或个人页面显示等待论文状态。所有跳转均由用户点击或按快捷键触发。

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

0.3.0 验证记录：类型检查、35 项单元测试、生产构建和 Chrome 155 浏览器集成测试通过。Chrome 手动测试确认默认英文、英文/简体中文/跟随浏览器切换、偏好保存，以及已打开论文页的按钮同步翻译。此前 0.2.0 手动测试还覆盖摘要/PDF 跳转、新标签页、复制链接，以及面板和 `Option+Shift+A` 打开真实 `1706.03762v7` HTML 正文。

## Chrome Web Store 上架包

运行 `npm run package:store`，即可在 `release/` 生成扩展 ZIP 和完整上架资料包。打包需要 Node.js 22+ 以及 macOS 已内置的 `zip` / `unzip` 命令。

扩展上传文件为 `back-to-arxiv-0.3.0.zip`。另一个 `back-to-arxiv-0.3.0-store-kit.zip` 包含安装包、中英文介绍、截图、图标、权限说明、审核测试步骤和隐私政策网页；每个 ZIP 都有 SHA-256 校验文件。

填写说明见[上架指南](store/START-HERE.txt)。提交前，将[隐私政策](store/privacy-policy.html)放到公开可访问的 HTTPS 地址，并确认开发者联系方式。代码仓库可以继续保持私有。

使用 `npm run store:assets` 可基于已保存的截图和排版重新渲染商店图片；界面修改后的截图更新步骤见指南。

## 文件结构

```text
public/manifest.json   Chrome 配置、权限与快捷键
public/popup.*        面板 HTML 与样式
public/_locales/      Chrome i18n 消息与界面翻译
src/i18n.ts          界面语言选择与消息读取
src/paper.ts          论文地址识别及 arXiv 地址生成
src/settings.ts       本地偏好存取
src/content.ts        alphaXiv 页面按钮及站内导航处理
src/popup.ts          工具栏面板交互
src/navigation.ts    面板与快捷键共用的导航逻辑
src/background.ts    消息处理与快捷键监听
scripts/             构建及图标生成
tests/               地址解析、偏好、导航与浏览器集成测试
dist/                构建生成的 Chrome 扩展
```

## 权限与数据

| 权限/范围 | 用途 |
| --- | --- |
| `storage` | 在本地保存阅读格式、标签页和语言偏好 |
| `activeTab` | 用户点击插件或触发快捷键时，读取当前页的论文地址 |
| `clipboardWrite` | 用户点击复制时，将原文链接写入剪贴板 |
| alphaXiv 的两个 HTTPS 域名 | 注入页面按钮，跟随站内论文切换 |

所有转换逻辑在浏览器内执行。扩展保存的业务数据为阅读与语言偏好，页面跳转直接前往 arXiv。运行时资源均随扩展打包。
