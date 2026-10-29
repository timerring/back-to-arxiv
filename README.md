# Back to arXiv

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
6. 打开或刷新一篇 alphaXiv 论文，右下角会出现 **打开 arXiv** 按钮。

Chrome 的官方加载说明：[Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)。

## 使用

- **页面按钮**：在 alphaXiv 论文页右下角点击“打开 arXiv”，旁边的复制按钮复制原文链接。
- **工具栏面板**：查看论文编号、打开原文、复制原文链接，选择摘要页、PDF 或 HTML (experimental)，并设置当前标签页或新标签页。
- **快捷键**：Windows/Linux 为 `Alt+Shift+A`，macOS 为 `Option+Shift+A`。快捷键与页面按钮使用相同偏好。
- **设置快捷键**：打开 `chrome://extensions/shortcuts`，或点击面板底部的“设置”。面板显示 Chrome 实际分配的快捷键。

默认偏好是 **摘要页 + 当前标签页**，选择后自动保存。复制功能始终生成 arXiv 摘要页地址，保留明确的版本号；源页面的查询参数和讨论锚点在转换时清理。原始链接包含 `v3` 时，生成链接也包含 `v3`；原始链接省略版本时，生成链接同样省略版本，由 arXiv 展示其当前版本。

**HTML (experimental)** 打开同一论文版本的 `https://arxiv.org/html/<编号>`。HTML 由 arXiv 提供，覆盖范围取决于论文和版本；需要其他格式时，可以在面板切换摘要页或 PDF。详见 [arXiv HTML 说明](https://info.arxiv.org/about/accessible_HTML.html)。

## 手动验收

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

浏览器测试使用独立临时配置和本地拦截的论文页面，验证扩展加载、页面按钮、复制、站内导航、阅读偏好及弹窗跳转。截图输出到 `test-results/`。真实网站最终落点及操作系统快捷键通过上面的手动步骤验证。

也可使用本机较新的 Chrome 执行集成测试，以下 macOS 启动方式已在 Chrome 155 验证：

```sh
CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
CHROMIUM_LOAD_EXTENSION_VIA_CDP=1 npm run test:browser
```

此方式同样创建独立的临时浏览器配置。测试通过真实工具栏动作获取 `activeTab` 授权，再在测试标签页检查同一面板文档。

0.2.0 验证记录：类型检查和 26 项单元测试通过；Chrome 手动测试覆盖 HTML 选项保存、页面按钮同步，以及面板和 `Option+Shift+A` 打开真实 `1706.03762v7` HTML 正文。摘要、PDF、新标签页、复制链接及快捷键也已完成安装后的手动验证。浏览器集成脚本包含 HTML 用例，可使用上述命令运行。

## 文件结构

```text
public/manifest.json   Chrome 配置、权限与快捷键
public/popup.*        面板 HTML 与样式
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
| `storage` | 在本地保存阅读格式和标签页偏好 |
| `activeTab` | 用户点击插件或触发快捷键时，读取当前页的论文地址 |
| `clipboardWrite` | 用户点击复制时，将原文链接写入剪贴板 |
| alphaXiv 的两个 HTTPS 域名 | 注入页面按钮，跟随站内论文切换 |

所有转换逻辑在浏览器内执行。扩展保存的业务数据仅为阅读偏好，页面跳转直接前往 arXiv。运行时资源均随扩展打包。
