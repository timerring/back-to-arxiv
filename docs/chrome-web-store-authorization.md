# Back to arXiv CI 授权配置（待确认）

已从开发者后台核实并写入 GitHub Actions Variables：

- `CWS_PUBLISHER_ID=239833e8-426a-48d9-91c5-1453f071f220`
- `CWS_EXTENSION_ID=olekpoigngcmbmkpdaoepfecgfbpocan`

后台当前公开版本为 0.3.0。以下云端授权尚未执行，`CWS_ENABLED` 尚未启用。

## 拟授权范围

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

**权限边界：** Chrome Web Store 的服务账号授权作用于整个 Publisher，并不能限制到单个扩展。此服务账号可管理该 Publisher 下的其他扩展；仓库工作流按固定条目 ID 只操作 Back to arXiv，但这不是商店端的条目级安全隔离。仓库可信发布工作流维护者应被视为拥有此 Publisher 的发布能力。修改该工作流、创建发布标签和执行手动发布的权限应仅给可信维护者。

## 获得确认后的执行步骤

1. 创建上述独立 pool/provider，添加指定服务账号 IAM binding。
2. 配置仓库变量：
   - `CWS_WORKLOAD_IDENTITY_PROVIDER=projects/88342373631/locations/global/workloadIdentityPools/back-to-arxiv-github/providers/github`
   - `CWS_SERVICE_ACCOUNT=cose-chrome-store@doocs-cose-web-store.iam.gserviceaccount.com`
3. 手动运行 Chrome Web Store 工作流：`tag=v0.10.0`、`check_store=true`、`submit=false`，只读取商店状态验证授权。
4. 验证通过后设 `CWS_ENABLED=true`，以后正式 GitHub Release 自动上传并提交审核。已有 v0.10.0 如需补交可手动使用 `submit=true`。
