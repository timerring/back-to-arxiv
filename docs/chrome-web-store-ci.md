# Chrome Web Store 自动发布

GitHub 正式 Release → 校验版本、类型检查、单元测试和浏览器集成测试 → 构建 ZIP → 上传 Chrome Web Store → 提交审核 → Google 审核通过后自动上线。

工作流使用 Chrome Web Store V2 API 的 `DEFAULT_PUBLISH`，不跳过审核，也不使用等待手动上线的 `STAGED_PUBLISH`。CI 成功只表示提交成功，不代表审核通过。已有商店可见性及灰度比例保持不变；若要面向所有用户，先在后台设置公开可见和所需发布比例。

## 短期令牌认证

支持 Google Workload Identity Federation（WIF），配置 `CWS_WORKLOAD_IDENTITY_PROVIDER` 和 `CWS_SERVICE_ACCOUNT` 后优先使用该方式，无需 OAuth Secrets。构建和发布拆为两个作业，只有发布作业可取得 GitHub OIDC 身份；令牌不写入文件。未配置 WIF 时仍可使用下面的 OAuth 方式。

本仓库的 WIF 已于 2026-11-18 配置并验证，正式 Release 自动提交已启用。已核实的 ID、授权范围和验证记录见 [授权配置](chrome-web-store-authorization.md)。

手动运行时可选 `check_store=true`、`submit=false`，仅验证商店 API 授权，不上传安装包。`submit=true` 则执行上传提交。

## 首次设置

1. 在 [开发者后台](https://chrome.google.com/webstore/devconsole) 创建条目，上传首次安装包，完成商店介绍、隐私说明、分发设置及账号要求。API 无法创建新条目。商店资料变更仍需在后台维护。
2. 按 [Google 官方 API 指南](https://developer.chrome.com/docs/webstore/using-api) 启用 Chrome Web Store API，创建 OAuth 客户端，并以拥有该条目发布权限的账号授权 `https://www.googleapis.com/auth/chromewebstore`。获取可用于持续 CI 的 refresh token；不要使用临时 access token 作为 refresh token。
3. 在 [仓库 Actions Secrets](https://github.com/timerring/back-to-arxiv/settings/secrets/actions) 添加以下三个 secret，勿写入代码、日志或聊天：

   | Secret | 内容 |
   | --- | --- |
   | `CWS_CLIENT_ID` | OAuth 客户端 ID |
   | `CWS_CLIENT_SECRET` | OAuth 客户端密钥 |
   | `CWS_REFRESH_TOKEN` | 已授权的刷新令牌 |

4. 在 [仓库 Actions Variables](https://github.com/timerring/back-to-arxiv/settings/variables/actions) 添加：

   | Variable | 内容 |
   | --- | --- |
   | `CWS_PUBLISHER_ID` | 商店后台 Publisher → Settings 中的 publisher ID |
   | `CWS_EXTENSION_ID` | 商店条目的 32 字符扩展 ID；不要使用本机加载解压目录产生的 ID |
   | `CWS_ENABLED` | 配置完成后设置为 `true`，启用后续正式 Release 的自动提交 |

首次授权要由账号持有人完成。不要把 OAuth Playground 的默认客户端临时凭据用于长期自动化；按官方文档使用自己的 OAuth 客户端，并确认其授权配置适合持续运行。

## 触发与补发

- 正常发版：更新 `package.json`、锁文件根版本和 `public/manifest.json`，推送对应 `vX.Y.Z` 标签并发布正式 GitHub Release。
- 预发布 Release 不提交。普通代码 push 不提交。
- 在 Actions → Chrome Web Store → Run workflow 可指定已有标签。默认 `submit=false`，只验证并保存 ZIP，不访问商店 API。设置 `submit=true` 可补发已经存在的版本（例如初次接通 CI 时的 `v0.10.0`），无需重新创建 Release。
- 发布工具从 `main` 读取，扩展代码从指定标签读取。包版本必须与标签相同。上传的是 CI 根据该标签构建并校验的包；ZIP 时间戳可能与 GitHub Release 附件不同，CI artifact 包含实际上传包及其校验文件。
- GitHub Release 若由另一个工作流的默认 `GITHUB_TOKEN` 创建，通常不会触发后续 release 工作流。应在该工作流中显式 dispatch 此工作流，或用允许触发事件的 GitHub App/PAT 创建 Release。

## 失败与重跑

- 缺少凭据、上传失败、未知上传状态或处理超时都会失败，不调用 publish。
- 同一版本已发布或正在审核时不重复上传；对已经存在的人工提交，不修改其自动／延期上线模式，请在后台确认。
- 其他版本正在审核，或存在已审核但暂存的版本时停止，避免覆盖。不会取消审核或自动绕过拒绝原因。
- API 网络失败不会自动重试写操作。先检查后台实际状态再重跑，避免把网络异常当成“没有提交”。
- 上传成功但 publish 失败时，先修复后台资料、凭据或权限问题。若重跑上传提示重复版本，可在后台对已上传草稿直接提交审核。
- CI 日志不输出令牌及 OAuth 响应体。Secrets 仅传入最终发布步骤，构建作业的 GitHub token 仅有 `contents: read` 权限；发布作业另有 `id-token: write` 用于 WIF。

参考：[publish 的自动上线模式](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)、[上传状态](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/UploadState)。
