> 前端已迁至 `../apps/ledger/`。请在仓库根目录执行 `npm ci`，使用 `npm run dev:ledger` / `npm run build:ledger`。以下历史说明中的 frontend 路径以新目录为准。独立导出和统一部署见 [应用架构文档](../docs/门户与独立应用架构及拆分部署.md)。

# SmartLedger（独立记账应用）

SmartLedger 是 WhereToGo 仓库内单独运行的记账应用。它有自己的 Vue Web 前端、Java 8 / Spring Boot API、PostgreSQL 数据库、OIDC 登录和部署配置；WhereToGo 仅提供旅行账本入口，旅行账本按当前用户与旅行 ID 幂等关联。

## 当前能力

- 五个主要工作区：首页概览、账本、流水、记一笔、更多。
- 本地优先：每个登录账号用 IndexedDB 保存分类、账本、流水、预算、置顶区间和设置；本机快照可以独立使用。
- 记账与账本：收支流水新增/编辑/删除、多账本归属、自动归集、置顶账本、账本参与人、分期拆分、原价/优惠/溢价字段、账本导出 CSV/HTML/Markdown/打印。
- 分类与预算：多层级收支分类、月度/区间预算、按分类和账本统计预算进度。
- 统计：周/月/年总览、收支趋势、分类分布、财务日历、流水多条件筛选和区间查询。
- 分账：流水可选择账本、付款人和参与成员，统计按当前用户份额计算。
- 图片和文件导入：浏览器端 Tesseract OCR、交易文本/截图解析、批量文本、CSV、XLSX、PDF；导入先进入候选列表，用户确认后才写入流水。
- 云同步：登录账号隔离的版本化 JSON 快照、revision 比较、并发冲突提示，以及智能同步、推送和拉取。
- 坚果云备份：在设置中配置坚果云邮箱与第三方应用密码，测试 WebDAV 后可备份或恢复整份 JSON 快照；凭据由服务端 AES-256-GCM 加密保存，不随账本快照同步，前端不回显密码。
- 设置：系统/亮暗主题、背景图、支付渠道、云同步策略、演示数据。

基于 iOS 原版能力做 Web 等价实现：Apple 登录替换为 OIDC；CloudKit 替换为 IndexedDB + SmartLedger API 云快照；Vision OCR 替换为浏览器 Tesseract。首次简体中文 OCR 需要联网下载 Tesseract 中文语言数据。OCR 解析结果需要人工核对。

坚果云连接使用官方 WebDAV 服务 `https://dav.jianguoyun.com/dav/`。需要先在坚果云“安全选项 → 第三方应用管理”生成应用密码，不能使用坚果云登录密码。当前坚果云操作为手动备份/恢复，与 SmartLedger API 的自动同步并行；恢复会替换本机快照。邮箱和应用密码加密保存在服务端 `ledger_provider_credentials` 表，密钥通过外部文件或平台 Secret 注入；旧浏览器凭证在成功迁移后删除。JSON 备份内容本身尚未加密。详见[统一账号与凭证加密](../docs/统一账号与凭证加密.md)。

## 本机运行

本仓库根目录 `scripts/start-local.ps1` 可启动已安装在 `D:\Application` 的本地服务。SmartLedger 页面为 `http://localhost:5174`，API 健康检查为 `http://localhost:8090/actuator/health`，OIDC 为 `http://localhost:8091/realms/local`。本机默认使用 Keycloak 统一账号，先运行 `scripts/install-identity.ps1`；通过 `scripts/show-initial-account.ps1` 查看初始密码。模拟登录默认关闭。生产必须配置同一个 HTTPS realm、各自客户端和服务端凭证加密密钥。

## 独立部署

```powershell
Copy-Item .env.example .env
# 设置 PostgreSQL 密码、可信 OIDC issuer / audience 与 CORS allowlist
Copy-Item frontend/.env.example frontend/.env.local
# 设置 Web API 地址、OIDC authority 和 client ID
cd frontend
npm ci
npm run build
cd ..
docker compose up --build
```

API 使用 Java 8 编译目标。生产部署还需要 HTTPS、OIDC 回调地址登记、数据库备份与访问控制。SmartLedger 数据库与 WhereToGo 数据库互不共享。

## 规格与验证

原版规格和能力对照见 [`../docs/SmartLedger原版完整规格书.md`](../docs/SmartLedger原版完整规格书.md) 与 [`../docs/SmartLedger功能迁移方案.md`](../docs/SmartLedger功能迁移方案.md)。自动化验证：在 `smartledger` 目录运行 `cd frontend; npm run test; npm run build`，然后回到仓库根目录运行 `pwsh -File smartledger/scripts/smoke.ps1`。OCR 核心解析覆盖样例测试，真实摄像头/图片 OCR 与不同来源 PDF/XLSX 文件还需在目标浏览器人工验收。

## 抵扣与报销规则（2026-10-25）

已支持已有抵扣逐笔编辑与追加、默认日期跟随原支出、关闭前列出全部抵扣确认、移出账本联动及超过 100% 时仅调整新增抵扣。详见 [抵扣规则与验收](../docs/SmartLedger抵扣规则与验收.md)。
