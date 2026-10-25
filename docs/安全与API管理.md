# 安全与 API 管理

更新：2026-10-25。适用个人门户、WhereToGo 和独立 SmartLedger。部署拓扑沿用仓库中的静态前端 + Java API + PostgreSQL 方案；两个业务应用继续独立运行。

## 1. 本次代码调整

| 范围 | 实现 |
| --- | --- |
| 身份认证 | 两个 API 都校验 JWT 签名、issuer、audience、过期时间及非空 subject。业务接口需要 Bearer token。 |
| 个人访问权限 | 正式模式默认要求 `API_ALLOWED_SUBJECTS`；显式允许全部认证用户时使用 `API_ALLOW_ANY_AUTHENTICATED_USER=true`。账号白名单与每条数据的归属检查共同生效。 |
| 旅行数据 | 用户表新增 `(issuer, subject)`；地点、标签、行程、日程查询使用当前用户 ID；行程不能引用其他账号地点。 |
| 本地数据 | 旅行缓存按 issuer/subject 命名；记账继续按账号存储 IndexedDB 快照。原旅行缓存仅由显式本机模拟用户迁移。 |
| 统一账号 | 本机默认 Keycloak，门户、旅游、记账共用 realm 和 SSO；`local` profile 仍限制 API 回环访问。遗留模拟服务不再由启动脚本运行，生产禁止模拟登录。 |
| API 策略 | 请求总大小、JSON 深度/节点数量、每连接来源/账号/写入/WebDAV 频率限制，窗口内存有上限。 |
| 错误与日志 | 结构化错误、服务端生成的请求编号、匿名化的路由模板访问日志。错误响应隐藏 SQL、堆栈和第三方响应正文。 |
| 跨域 | 精确来源列表、允许 Authorization / Content-Type、暴露请求编号与 Retry-After；不用跨域 Cookie。 |
| 备份凭证 | 坚果云邮箱和应用密码由后端 AES-256-GCM 加密存库，密钥外置；前端仅接收脱敏状态，旧浏览器凭证迁移后删除。 |
| WebDAV | 目的地址固定、禁止重定向和自动重试、连接/读取超时、流式大小上限、快照结构检查。第三方账号错误返回 422，不会误触发业务账号退出。 |
| 发布 | 静态构建生成 CSP 等安全头、SPA 回退；生产地址须 HTTPS，禁止疑似服务端密钥进入 `VITE_*`。 |

本机已安装并启用 Keycloak 统一账号服务，默认关闭模拟登录。账号中心、统一退出、加密凭证与生产配置详见[统一账号与凭证加密](统一账号与凭证加密.md)。引用聊天方案正文仍无法读取，公网平台和域名尚未部署。

## 2. 登录服务

选择支持 **OIDC Authorization Code + PKCE** 的身份服务，创建两个公共 SPA 客户端：

| 客户端 | 示例 ID | 回调地址 | API audience |
| --- | --- | --- | --- |
| 门户、旅行、API 与账号管理 | `wheretogo-web` | `https://portal.example.com/auth/callback` | `wheretogo-api` |
| 记账 | `smartledger-web` | `https://ledger.example.com/auth/callback` | `smartledger-api` |

不要配置 SPA `client_secret`。允许的返回/退出地址使用确切地址；禁止通配符和任意返回地址。门户的 `/system/` 也通过旅行客户端登录，登录成功后回到原页面。

API 支持 RS256；配置明确 JWKS 地址时同时支持 ES256。若不提供 JWKS，则通过 issuer 发现签名键。HS256 共享密钥不是当前解码器的接入方式。数据库托管服务与登录服务分别配置，不能将数据库密码、数据库服务角色 Key 当作浏览器凭证。

把本人 JWT 的真实 `sub` 填到后端 `API_ALLOWED_SUBJECTS`。不要填写邮箱或客户端 ID，除非身份服务的 subject 本身恰好就是该值。白名单仅在服务端保存；其他有效登录用户会收到 403。需要多用户时填写多个 sub；也可清空白名单并显式开启全部认证用户访问。

浏览器登录信息保存在当前标签页 sessionStorage，PKCE 状态也使用 sessionStorage。浏览器扩展、同源脚本或 XSS 仍可能访问这些数据；静态 CSP 和依赖维护是必要补充。退出应用调用身份服务统一退出，并通过 front-channel、同源广播和会话监测同步其他页面；本地账本数据仍按账号保存。还需注册两个客户端各自的 `/auth/silent`、`/auth/signed-out` 和 `/auth/frontchannel` 端点，参见统一账号文档。

JWT 使用离线验签；退出浏览器不会即时撤销已签发的 token。正式身份服务应配置短期 access token、必要的 MFA 和账号准入；泄漏处置包括撤销身份服务会话、移除服务端账号白名单并重新部署，以及按实际事件轮换签名键。即时逐 token 撤销需要另行接入共享撤销状态或 introspection。

## 3. 环境变量

### WhereToGo API

```dotenv
APP_OIDC_ISSUER=https://identity.example.com/realms/personal
APP_OIDC_AUDIENCE=wheretogo-api
API_OIDC_JWK_SET_URI=https://identity.example.com/realms/personal/protocol/openid-connect/certs
APP_CORS_ALLOWED_ORIGINS=https://portal.example.com
API_ALLOWED_SUBJECTS=your-real-subject
API_ALLOW_ANY_AUTHENTICATED_USER=false
SPRING_DATASOURCE_URL=jdbc:postgresql://database-host:5432/database?sslmode=verify-full
SPRING_DATASOURCE_USERNAME=travel_runtime_login
SPRING_DATASOURCE_PASSWORD=provided-through-platform-secrets
DB_POOL_SIZE=4
```

### SmartLedger API

```dotenv
SMARTLEDGER_OIDC_ISSUER=https://identity.example.com/realms/personal
SMARTLEDGER_OIDC_AUDIENCE=smartledger-api
API_OIDC_JWK_SET_URI=https://identity.example.com/realms/personal/protocol/openid-connect/certs
SMARTLEDGER_ALLOWED_ORIGINS=https://ledger.example.com,https://portal.example.com
SMARTLEDGER_PUBLIC_URL=https://ledger.example.com
API_ALLOWED_SUBJECTS=your-real-subject
API_ALLOW_ANY_AUTHENTICATED_USER=false
SPRING_DATASOURCE_URL=jdbc:postgresql://database-host:5432/database?sslmode=verify-full
SPRING_DATASOURCE_USERNAME=ledger_runtime_login
SPRING_DATASOURCE_PASSWORD=provided-through-platform-secrets
DB_POOL_SIZE=4
```

`verify-full` 需要按数据库提供商要求配置受信 CA 和正确主机名。使用平台连接池时采用平台实际给出的主机、端口、用户名和 TLS 配置；把迁移连接与运行时连接分开，并避免用事务连接池执行不兼容的迁移操作。

### 两个前端

项目各自的 `.env.example` 包含正式地址模板，部署时替换为真实 HTTPS 地址。Cloudflare Pages 前端根目录分别是 `frontend` 和 `smartledger/frontend`，命令均为 `npm ci && npm run build`，输出目录 `dist`。

本机启动脚本写入的 `.env.local` 是开发专用配置。生产构建若读到 `VITE_LOCAL_MOCK_AUTH=true` 或 HTTP 服务地址会失败。请在 CI / Pages 环境中配置生产值，或使用优先级更高的 `.env.production.local`（不提交）。构建验证使用的 `example.com` 示例不是真实登录服务，不能直接用于上线。

生产不设置 `SPRING_PROFILES_ACTIVE=local`、`LOCAL_AUTH_ENABLED`，不部署 `smartledger/local-auth`。默认安全配置缺少可信 issuer / 个人白名单会拒绝启动，而不是开放接口。

## 4. API 管理入口与接口清单

- 门户页底部“API 管理”：`/system/`，登录后读取 WhereToGo 的实际认证与限额。
- SmartLedger：“更多 → 设置 → API 与安全”，使用记账自己的登录会话读取策略。
- 服务端策略修改通过部署环境变量完成。界面只展示公开策略，不提供在线修改密钥和权限的接口。

| 服务 | 方法与路径 | 授权 |
| --- | --- | --- |
| 旅行健康 | `GET /api/v1/health` | 无登录，不返回数据库详情 |
| 记账健康 | `GET /actuator/health` | 无登录，不开放其他 actuator 端点 |
| 两个服务的策略 | `GET /api/v1/system/info` | 当前服务 JWT + 账号准入策略 |
| 地点 | `GET/POST /api/v1/places`；`GET/PATCH/DELETE /api/v1/places/{id}` | 当前用户所有 |
| 地图地点 | `GET /api/v1/places/map` | 当前用户所有；经纬范围有限且有效 |
| 行程 | `GET/POST /api/v1/trips`；`GET/PUT/DELETE /api/v1/trips/{id}` | 当前用户所有 |
| 日程 | `PUT /api/v1/trips/{id}/stops` | 当前用户行程；地点同属当前用户；每次最多 300 条 |
| 账本 | `GET/POST /api/v1/books`；`GET /api/v1/books/{id}` 和 `/summary` | 当前用户所有 |
| 账本流水 | `GET/POST /api/v1/books/{bookId}/transactions` | 当前用户账本；分类归属与收支类型校验 |
| 旅行账本 | `POST /api/v1/integrations/wheretogo/trips/{tripId}/open` | 记账 JWT；关联键处于当前用户命名空间，不授予其他账号旅行或账本权限 |
| 云快照 | `GET/PUT /api/v1/sync/snapshot` | 当前用户；写入校验 revision，冲突返回 409 |
| 坚果云 | `POST /api/v1/sync/nutstore/{test,upload,download}`，`GET/PUT/DELETE /api/v1/sync/nutstore/credentials` | 当前用户；固定 WebDAV 地址；凭证加密保存且不回显 |

已有数组响应形式保留：旅行地点列表最多 500 条，地图最多 1000 条，行程最多 500 条。更大数据规模需要额外分页协议；当前限额避免免费实例被单次查询拖垮。

旅行 OpenAPI 文档默认关闭；显式 `API_DOCS_ENABLED=true` 后，文档仍要求当前服务认证。管理用途需通过携带 Bearer 的客户端请求 `/v3/api-docs`。不应把演示 Swagger 地址当作无权限保护的管理后台。

## 5. 默认请求策略

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `API_REQUESTS_PER_MINUTE` | 120 | 每个有效账号，每实例每分钟请求数 |
| `API_WRITES_PER_MINUTE` | 30 | 每账号每分钟非 GET/HEAD 请求 |
| `API_PEER_REQUESTS_PER_MINUTE` | 600 | 未解析 JWT 前按实际 TCP 来源限制；不信任用户传入的转发头 |
| `API_WEBDAV_REQUESTS_PER_MINUTE` | 10 | 每账号每分钟 WebDAV 请求 |
| `API_MAX_REQUEST_BYTES` | 旅行 1 MiB，记账 11 MiB | 声明长度与实际读取流都限制；记账内部快照 JSON 上限 10 MiB |
| JSON 复杂度 | 深度 64、结构标记 500000 | 在 Jackson 解析前按输入流限制；快照再做结构与层级检查 |
| `HTTP_MAX_THREADS` | 32 | Tomcat 工作线程上限 |
| `DB_POOL_SIZE` | 4 | 每实例数据库连接池，空闲最小连接数 0 |

限流窗口是内存中的每分钟窗口，缓存总量有上限，重启后重置。`429` 返回 `Retry-After`；前端不会自动重复执行写请求。生产代理之后，多个用户可能共享同一个实际 TCP 来源，因此来源限制是粗粒度保护。多实例全局配额需由受信网关或共享存储提供；免费边缘套餐的 WAF / rate limit 能力以实际账户权限为准。

统一错误示例（请求编号由服务端生成）：

```json
{"status":403,"code":"account_not_allowed","message":"当前账号未获准访问此服务","requestId":"server-generated-uuid","timestamp":"2026-10-24T00:00:00Z"}
```

日志只记录请求编号、方法、路由模板、状态和耗时，不记录完整 JWT、查询字符串、坚果云密码或请求正文。500 类响应隐藏内部异常详情。代理层拒绝、跨域拒绝、容器无法建立连接时可能由平台直接返回响应，页面会显示状态兜底。

## 6. 静态托管与可选网关

构建产物包含 Cloudflare Pages `_headers` 和 `_redirects`。CSP 的 `connect-src` 根据 API 与登录服务地址生成，允许本地资源、图片预览的 blob/data 和本地 OCR 所需 WASM；不允许任意外部脚本。`style-src` 保留内联样式以支持当前图表、地图和动态颜色。OIDC 静默续期场景允许同源回调框架嵌入，外站框架嵌入被限制。

Cloudflare Pages 的 `_headers` 作用于静态资源，不会自动保护 Pages Functions、独立 API 或其他代理。换托管平台时要在相应服务器上配置相同安全头。参考 [Cloudflare 官方说明](https://developers.cloudflare.com/pages/configuration/headers/)。

`deploy/nginx-api.conf` 是可选网关模板：

- `/travel-api/` 转发旅行 API，浏览器 API base 填 `https://api.example.com/travel-api`。
- `/ledger-api/` 转发记账 API，记账 API base 填 `https://api.example.com/ledger-api`。
- 修改模板中的内部上游名称，通过平台或受控 TLS listener 提供 HTTPS。
- 网关保留 Bearer 头，业务后端继续独立验证登录与数据归属。
- 网关日志不记录查询参数与 Authorization；客户端自带的转发头不会当作身份或本机标记。
- 默认没有把任意来源标记为可信代理。若需真实客户端 IP，先按实际平台维护受信代理地址。

Render 免费服务可以直接暴露两个受保护 API，不强制增加第三个网关服务。平台免费服务有休眠、临时文件与出站额度限制，不能依赖文件系统保存数据库或凭证，也不使用定时请求绕过休眠。参考 [Render 官方限制](https://render.com/docs/free)。

## 7. 数据库和凭证

旅行 V5 迁移新增 OIDC 身份字段，已有数据不批量转给新用户。只有本机 `local` 模式的 `local-demo-user` 可以绑定旧演示账号；正式账号第一次登录使用独立用户行。

数据库仅让服务端连接，使用 TLS。将两套应用放在不同数据库或独立权限角色中。`deploy/database-runtime-grants.sql` 提供最小运行时授权示例，需要先由迁移账号完成 Flyway，角色名和数据库名由部署者确认。

若免费平台只提供一个数据库，可共用该数据库并保留独立角色。**新部署**为旅行设置 `FLYWAY_HISTORY_TABLE=wheretogo_schema_history`，记账设置 `FLYWAY_HISTORY_TABLE=smartledger_schema_history`，避免两个独立 V1 迁移争用同一张历史表。已有环境保持原来的表名，不能直接修改该变量后重放初始建表迁移；需要先备份并迁移已有历史元数据。本机默认仍为 `flyway_schema_history`，两个独立数据库的原迁移记录不变。

两个 Docker 运行镜像使用非 root 的 UID/GID 10001，Java 堆上限按容器内存的 65% 配置；构建上下文排除本地配置和已有打包目录。Docker 镜像本轮未实际构建。

迁移账号通过 `SPRING_FLYWAY_URL` / `SPRING_FLYWAY_USER` / `SPRING_FLYWAY_PASSWORD` 配置；日常 `SPRING_DATASOURCE_*` 使用没有建表/管理权限的运行时账号。代码按每条业务数据归属过滤；托管数据库控制台、SQL 管理员和备份仍属于独立的高权限边界。

供应商密钥保存在部署平台后端 Secret 环境变量中。前端只放公开地址、公开客户端 ID 和面向浏览器的受域名约束公开 Key。`VITE_*` 全部会进入浏览器资源，不是密钥仓库。

IndexedDB、本地缓存、下载的报告/JSON 备份和 sessionStorage 都不是加密保险箱。电脑或浏览器账号被他人控制时，应按个人数据处理；坚果云应用密码可单独撤销。数据库备份、恢复与跨设备真实云同步需要部署完成后单独验收。

## 8. 构建与维护边界

本轮完成两套前端生产构建、两个 Java 8 后端打包（`-DskipTests`）、本机服务重启和 V5 数据库迁移。npm audit 在本轮执行时两套前端均为 0 已知漏洞；这不代表 Maven、基础镜像、托管环境或手工复制的第三方资源已完成全部漏洞审计。

未运行功能回归、跨账号渗透测试、真实公网 OIDC / Cloudflare / Render 联调。构建中使用的示例域名仅验证产物结构；上线必须换成真实配置。

`.github/workflows/build.yml` 编译两个前端和两个 Java 8 API，并审计 npm 已知高危依赖；没有自动发布步骤。Dependabot 为 npm、Maven、Docker 和 GitHub Actions 提供依赖更新 PR。

按既有要求保留 Java 8 和 Spring Boot 2.7.18。Spring 官方已宣布 2.7.18 为 Boot 2.x 的最后开源支持版本；应用层认证、限流和安全头不能替代框架漏洞补丁。长期公网运行需迁移到受支持的 Java / Spring 组合，或采用相应商业安全支持，参见 [Spring 官方公告](https://spring.io/blog/2023/11/23/spring-boot-2-7-18-available-now/)。本轮没有改动 Java 版本。
