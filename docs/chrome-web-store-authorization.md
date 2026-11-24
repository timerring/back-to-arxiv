# Kitleaf CI 授权配置

已从开发者后台核实并写入 GitHub Actions Variables：

- `CWS_PUBLISHER_ID=239833e8-426a-48d9-91c5-1453f071f220`
- `CWS_EXTENSION_ID=olekpoigngcmbmkpdaoepfecgfbpocan`

2026-11-18 已完成独立 WIF 配置及服务账号授权，并启用 `CWS_ENABLED=true`。后台公开版本仍为 0.3.0；本次仅验证授权，没有上传或提交新版本。

[GitHub CI 验证记录](https://github.com/timerring/back-to-arxiv/actions/runs/44150121942)：构建、测试、短期令牌认证以及 Chrome Web Store `fetchStatus` 均通过。

## 已授权范围

复用该 Publisher 已关联的服务账号 `cose-chrome-store@doocs-cose-web-store.iam.gserviceaccount.com`，为仓库 `timerring/back-to-arxiv` 新建独立的 Workload Identity Pool 和 Provider，不修改 COSE 的现有 pool/provider。

- Google Cloud 项目：`doocs-cose-web-store`（项目编号 `88342373631`）
- Pool：`back-to-arxiv-github`
- Provider：`github`
- Issuer：`https://token.actions.githubusercontent.com`
- 属性映射：`google.subject=assertion.sub`、`attribute.repository_id=assertion.repository_id`
- 属性条件：

```text
assertion.repository_id == '1438453770' &&
assertion.repository_owner_id == '89397553' &&
assertion.workflow_ref == 'timerring/back-to-arxiv/.github/workflows/chrome-web-store.yml@' + assertion.ref &&
((assertion.event_name == 'workflow_dispatch' && assertion.ref == 'refs/heads/main') ||
 (assertion.event_name == 'release' && assertion.ref.startsWith('refs/tags/v')))
```

仅在上述服务账号上为以下 principal 授予 `roles/iam.workloadIdentityUser`：

```text
principalSet://iam.googleapis.com/projects/88342373631/locations/global/workloadIdentityPools/back-to-arxiv-github/attribute.repository_id/1438453770
```

Google Auth action 取得有效期 30 分钟、scope 为 `https://www.googleapis.com/auth/chromewebstore` 的 access token，不创建或下载 JSON 密钥，不存 refresh token。构建测试作业没有 `id-token: write`；独立发布作业只有检查通过后才执行。

**权限边界：** Chrome Web Store 的服务账号授权作用于整个 Publisher，并不能限制到单个扩展。此服务账号可管理该 Publisher 下的其他扩展；仓库工作流按固定条目 ID 只操作 Kitleaf，但这不是商店端的条目级安全隔离。仓库可信发布工作流维护者应被视为拥有此 Publisher 的发布能力。修改该工作流、创建发布标签和执行手动发布的权限应仅给可信维护者。

## 配置与验证记录

1. 已创建上述独立 pool/provider，并新增指定服务账号 IAM binding。COSE 原有 `cose-github/attribute.repository_id/1108516124` 的 Workload Identity User 授权仍然存在，原有 pool/provider 未修改。
2. 已配置仓库变量：
   - `CWS_WORKLOAD_IDENTITY_PROVIDER=projects/88342373631/locations/global/workloadIdentityPools/back-to-arxiv-github/providers/github`
   - `CWS_SERVICE_ACCOUNT=cose-chrome-store@doocs-cose-web-store.iam.gserviceaccount.com`
3. 已成功运行 Chrome Web Store 工作流：`tag=v0.10.0`、`check_store=true`、`submit=false`，只读取商店状态验证授权。
4. 验证通过后已设置 `CWS_ENABLED=true`，以后正式 GitHub Release 自动上传并提交审核。已有 v0.10.0 如需补交可手动使用 `submit=true`。
