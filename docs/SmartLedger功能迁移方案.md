# SmartLedger 独立应用方案与 WhereToGo 集成契约

## 1. 产品边界

SmartLedger 是单独的记账 Web App，拥有独立前端、后端、数据库、域名和部署周期。WhereToGo 保留旅行规划职责，不承载账本、流水、预算或 OCR 页面；旅行详情只提供“旅行费用”入口，调用 SmartLedger 集成 API，解析当前用户对应的旅行账本并打开它。

两应用可以共用 OIDC 身份提供方，但不能共用数据库或用 WhereToGo 的 `trips.id` 建跨服务外键。SmartLedger 保存 `external_app`、`external_trip_id` 和必要的旅行名称/日期快照。旅行 ID 是来源系统中的不透明标识；用户身份只能从已验签的访问令牌解析，不能由请求体指定。

## 2. 当前仓库结构与部署边界

```text
frontend/                 WhereToGo Vue 前端
backend/                  WhereToGo Spring Boot API + 自己的数据库
smartledger/frontend/   独立记账 Web 前端（按 SmartLedger 规格复现）
smartledger/backend/     独立 SmartLedger API + Flyway schema
```

当前已在 `smartledger/frontend` 实现独立 Vue 记账工作区、OIDC/本地模拟登录、IndexedDB 本地快照和 OCR/账单导入；`smartledger/backend` 提供独立 Spring Boot API、PostgreSQL 账务 schema、JWT 用户隔离、快照 CAS 和旅行账本解析/读取。WhereToGo 行程详情有独立旅行费用入口。SmartLedger 数据库初始迁移为 `smartledger/backend/src/main/resources/db/migration/V1__smartledger_core.sql`，原版规格见 `SmartLedger原版完整规格书.md`。

记账 UI 已覆盖分类、账本、预算、流水 CRUD、分期、基础多人分账、Dashboard/日历、图片 OCR 与 CSV/TXT/XLSX/PDF 候选导入、IndexedDB 和智能/手动快照同步。Web 将 Apple 登录替换为 OIDC，Vision OCR 替换为 Tesseract.js，CloudKit 替换为 SmartLedger 版本化 JSON 快照。候选仍须用户确认后才成为正式流水。未逐项等价复现的 iOS 原生能力和剩余验收项以原版规格清单为准；自动化验证范围参见 `smartledger/README.md`。

可选坚果云 WebDAV 备份已接入设置页，使用坚果云官方 WebDAV 地址。用户名与第三方应用密码仅在当前浏览器保存，并由带认证的 SmartLedger API 临时代理 WebDAV 请求；当前提供连接测试、手动备份和恢复。恢复覆盖本机快照，尚未作为多设备自动合并同步源。

## 3. 数据模型

SmartLedger 自有 `sl_users`，用 `(issuer, subject)` 映射身份提供方账号。所有账务记录都由 `user_id` 隔离，并且只引用本服务自己的用户、账本和流水。

| 实体 | 责任与关键字段 |
| --- | --- |
| `ledger_categories` | 收支多级分类、图标、颜色、排序、软删除 |
| `ledger_books` | 通用/自定义/旅行账本；预算和自动归集设置；旅行账本用 `external_app + external_trip_id` 关联来源行程并保存名称、目的地、日期快照 |
| `ledger_book_participants` | 账本参与人和当前用户标记 |
| `ledger_book_auto_collect_categories` | 自动归集的分类规则 |
| `ledger_transactions` | 收支、金额、币种、分类快照、时间、支付方式、商户、分期和优惠/原价字段 |
| `ledger_transaction_books` | 一笔流水进入多个账本的关系、付款人、统计开关及分摊方式 |
| `ledger_transaction_split_participants` | 每个账本内的分摊参与人 |
| `ledger_budgets` / `ledger_budget_categories` | 月度或日期范围预算、父预算和多分类范围 |
| `ledger_sync_snapshots` | 用户完整快照、schema 版本、revision、hash 和更新时间 |
| `ledger_user_settings` | 外观、支付渠道、同步策略及归集提示设置 |

金额使用 `NUMERIC(14,2)`，主键使用 UUID。统计值由流水和分摊实时计算，不把余额等派生值当作权威数据。OCR 图片、原始账单和原始 OCR 文本默认只留本机，用户确认后的结构化流水才进入云端。

## 4. WhereToGo 到 SmartLedger 的打开流程

1. 用户在 WhereToGo 登录；前后端分别获得同一 OIDC issuer 签发的访问令牌。
2. 用户在某个行程点“旅行费用”。WhereToGo 前端向 SmartLedger 调用 `POST /api/v1/integrations/wheretogo/trips/{tripId}/open`，携带 Bearer token 和行程名称、目的地、日期等展示快照。
3. SmartLedger 后端验证 JWT 的签名、issuer、有效期与 audience，从令牌的 `iss + sub` 映射自己的 `sl_users`；忽略请求中的任何用户标识。
4. SmartLedger 在当前用户范围内幂等查找或创建 `external_app=wheretogo`、`external_trip_id={tripId}` 的旅行账本，更新旅行快照并返回 `{bookId, url}`。
5. WhereToGo 导航到返回的 SmartLedger URL。SmartLedger Web 前端需以同一 OIDC 提供方建立自己的登录会话，再读取该账本。页面和 API 每次都重新校验用户对账本的访问权。

每个来源行程、每个 SmartLedger 用户只能映射一个活动旅行账本；不允许只凭 UUID 直接读取账本。删除/归档行程不级联删除 SmartLedger 账本和支出。用户可从 SmartLedger 继续查看和管理旅行账本。

## 5. 集成 API

### 打开或创建旅行账本

```http
POST /api/v1/integrations/wheretogo/trips/{tripId}/open
Authorization: Bearer <OIDC access token>
Content-Type: application/json
```

```json
{
  "tripName": "东京周末",
  "destination": "东京",
  "startsOn": "2026-11-01",
  "endsOn": "2026-11-03"
}
```

成功响应：`{"bookId":"<uuid>","url":"https://ledger.example.com/books/<uuid>"}`。同一用户与行程重复调用返回同一账本。未认证返回 401，令牌 issuer/audience 不符返回 401/403，日期或字段非法返回 400。

WhereToGo 前端调用代码在 `frontend/src/api/ledgerIntegration.ts`，API 地址由 `VITE_SMARTLEDGER_API_URL` 配置。接入到行程详情时，将当前已登录用户、受众为 `smartledger-api` 的 access token 与行程字段传入 `openTravelLedger`。SmartLedger API 只允许配置好的 WhereToGo 来源域名发起跨域请求。

### 账本 API 后续约定

账本、流水、预算、设置和快照 API 全部以令牌中的用户为作用域。客户端不能发送 `userId` 作为授权依据。快照推送采用 `expectedRevision` 比较并递增；并发版本不匹配返回 409 和云端版本摘要，由用户明确选择本地或云端整份数据。不能静默覆盖或自动合并整份快照。

已实现的账本流水 API：`GET /api/v1/books/{bookId}` 读取账本；`GET /api/v1/books/{bookId}/summary` 汇总有效流水；`GET/POST /api/v1/books/{bookId}/transactions` 查询最近 200 笔或新增手工流水。服务端会确认当前令牌用户拥有该账本，分类（如果提交）必须属于当前用户且收支类型一致。

已实现的快照传输 API：`GET /api/v1/sync/snapshot` 返回云端 `revision/schemaVersion/hash/snapshot`，无快照时 revision 为 0；`PUT` 请求示例：

```json
{
  "schemaVersion": 1,
  "expectedRevision": 0,
  "snapshot": { "books": [], "transactions": [] }
}
```

成功时 revision 加一，服务器计算内容 hash，单份快照上限 10 MB。revision 不符返回 409。浏览器端 IndexedDB 快照、智能比较、推拉按钮、设置和冲突选择界面已接入；需要确保 API 账号 issuer/subject 与 WhereToGo 登录映射一致。

## 6. OCR、文件导入与隐私

- 浏览器端识别截图及解析 CSV/TXT/XLSX/PDF，保留来源和置信度；按单笔或批次展示候选。
- 复现微信、支付宝、美团、银行卡账单字段时，无法识别的数据留空并标记待确认，不猜测金额、日期或分类。
- 用户可逐条编辑、去重和选择后确认；未确认候选不能写正式账本，也不能进入云快照。
- 服务端验证金额精度、类别/账本归属、日期和分摊关系；统计始终由服务端数据聚合。
- Web 端以 IndexedDB 做本地持久化，再由用户启用版本化云同步。快照不存令牌、密码、图片或原始 OCR 文本。

## 7. 复现阶段

1. **独立服务骨架与接入**：独立 Postgres/Flyway、JWT 验证、用户映射、旅行账本幂等解析、配置和部署。（骨架已完成）
2. **Web 基础与核心账务**：登录、账本/分类/成员、流水 CRUD、搜索筛选、多账本归属、分期和分摊。（登录、旅行账本打开、手工流水新增/列表已完成，其余未完成）
3. **统计与预算**：Dashboard、趋势、日历、分类统计、月度/区间预算。
4. **导入能力**：OCR 候选、CSV/TXT/XLSX/PDF 解析、去重、逐笔确认和隐私边界。
5. **本地优先和云同步**：IndexedDB、完整快照、开关/策略、推/拉、智能比较、409 冲突选择。（IndexedDB、快照 CAS、推拉与冲突选择界面已完成）
6. **接回旅行入口**：在 WhereToGo 行程详情加“旅行费用”按钮，配置共享身份提供方、audience、CORS 与两个应用的部署域名。

每阶段如实标出完成、未接入和外部配置要求。当前完成度和限制见 `smartledger/README.md`；已验证 18 项前端领域/导入/存储/同步用例、14 项本机 API 集成检查、SmartLedger 与 WhereToGo 前端生产构建及 Java 8 后端构建。
