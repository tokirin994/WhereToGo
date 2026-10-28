# 门户及子应用统一登录（2026-10-28）

## 本次修复

旧代码把认证库的 `UserSessionChanged` 当成退出登录；该事件也会在**账号没有变化、只是会话状态更新**时触发。打开另一个客户端就可能清空已有状态，再次进入自动登录。此外，子应用没有先尝试静默获取自己的登录状态，遇到已过期令牌也缺少统一续期入口。

现在门户、旅行和记账共用 `shared/identitySession.ts`：

- 打开页面先通过 OIDC `prompt=none` 静默授权。已有统一账号会话时直接进入，不再输入密码。
- 同一账号的会话变化不再等同于退出。网络中断、iframe 超时不清除仍有效的令牌。
- SDK 自动续期关闭，由共享模块统一处理到期前续期、到期事件、主动 API 请求。并发续期合并为一个请求。
- 每次打开页面从 IdP 获取本页独立的客户端令牌，避免复制标签页后复用已经轮换的 refresh token。收到 `invalid_grant` 时尝试一次静默 SSO 恢复。
- 记账不再在每次未登录初始化时自动重定向；确实没有 SSO 会话时显示登录入口，避免回调循环。浏览器禁止静默 iframe 时可点击登录，通过正常跳转复用 IdP 会话。
- 页面重新获得焦点及每分钟确认 IdP 会话，两次检查间隔至少 30 秒。真正退出后停止使用该用户令牌；不同账号切换会卸载旧账号界面并重新加载。
- 同站点不同子应用及标签页通过 `localStorage` 广播退出事件，只包含事件类型、账号 ID 和随机事件 ID，不广播密码、JWT 或 refresh token。服务器主动撤销会话由下一次静默检查确认。
- 登录回调、静默回调、前通道退出及统一退出回调均有独立处理，回调页不会再启动新的登录跳转。

## 登录边界

统一账号服务仍是 Keycloak `personal` realm。门户和旅行使用 `wheretogo-web` 客户端；记账使用 `smartledger-web`。两个客户端分别获得 `wheretogo-api`、`smartledger-api` 的 audience，API 不接受另一个应用的令牌。

访问令牌和刷新令牌继续存于各页面的 `sessionStorage`，不把所有应用改成共享一个高权限令牌。密码只提交到统一账号服务。账号中心管理坚果云凭证时也通过相同模块取得记账专用令牌。

同一浏览器的同一用户资料、同一 IdP 会话可共享登录。隐私窗口、另一浏览器或已经失效的 SSO 会话需要重新认证。敏感操作（换邮箱、修改密码）仍会要求重新确认身份。

## 以后接入新应用

1. 在同一个 `personal` realm 建立独立的 public OIDC client，开启授权码和 PKCE S256，关闭密码直连及 implicit flow。不要建立另一套账号数据库。
2. 精确登记新应用的 HTTPS 回调，例如 `/new-app/auth/callback`、`/new-app/auth/silent`，以及退出回调 `/new-app/auth/signed-out`。设置前通道退出地址 `/new-app/auth/frontchannel`。不使用任意通配回调地址。
3. 为新后端建立独立 audience mapper；后端验证签名、issuer、audience，并始终按当前用户 subject 隔离数据。
4. 参考两个前端的 `src/identitySession.ts`，注入 `oidc-client-ts` 的 `UserManager` 和 `WebStorageStateStore`，使用共享生命周期。按应用填写 `authority`、`clientId`、`audience`、`basePath`、允许的站内返回路径及 `changed` 回调。
5. 挂载界面前等待 `initialize()`，API 请求前使用 `accessToken()`；确实需要强制更新时用 `accessToken(true)`。不要另行安装自动刷新器、会话变化清除器或无上限的自动登录重定向。
6. `changed(null)` 时卸载个人数据界面；切换 subject 必须清理旧账号状态。退出调用 `signOut()`，组件卸载时调用 `dispose()`。
7. 网关必须为回调提供 SPA 页面，允许 IdP 与回调之间必需的 iframe 和网络连接。生产环境统一 HTTPS。当前同源路径部署能减少浏览器对第三方 Cookie 的限制；不同站点部署时需单独验证浏览器策略。

`callbackBaseUrl` 仅用于账号中心通过**部署配置**指定另一个客户端的回调地址（兼容本机 5173/5174 两个开发端口），不能从用户输入或 URL 查询参数取值。

## 自动验收

```powershell
cd frontend
npm test
npm run build
cd ../smartledger/frontend
npm test
npm run build
```

生产构建需使用部署文档中的 HTTPS 环境变量及 `/ledger/` 基础路径。

真实协议验收脚本：`scripts/test-sso.mjs`。从本机受保护凭据设置进程环境变量 `WTG_USERNAME`、`WTG_PASSWORD`；可设置 `WTG_PUBLIC_ORIGIN` 及 `WTG_SSO_REPORT`。不要把密码写到脚本或提交到 Git。执行：

```powershell
node scripts/test-sso.mjs
```

该脚本使用独立 Cookie 会话，检查匿名静默授权、首次门户密码登录、进入记账、反复静默切换、两客户端刷新令牌轮换、API audience 隔离以及统一退出。测试最后仅退出脚本创建的 SSO 会话，不创建业务数据。

浏览器手工检查：门户登录一次 → 旅行 → 门户 → 记账 → 刷新记账 → 新标签页打开记账 → 等待令牌续期 → 从任一应用退出 → 检查其他标签页退出。账号切换时检查不会看到或写入前一个账号的数据。

## 本次验证结果

门户 64 项、记账 127 项自动测试通过，其中包含真实 Vue 挂载生命周期的记账入口测试；前端类型检查及生产构建均通过。真实公网 HTTPS/PKCE/静默授权/续期/统一退出共 8 组协议检查通过。

浏览器自动化连接不可用，本次不能把协议和单元测试当成浏览器逐项点击验证；需要在浏览器刷新页面后使用新版本。
