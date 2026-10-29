# Safari 兼容与统一登录回归

更新：2026-10-29。

## 修复内容

### 账号页

- 门户、旅游、记账统一以 Safari 15.4 为 JavaScript 与 CSS 编译目标。这是本轮兼容目标，不代表已在所有该版本设备上实测。
- 保留账号页独立的异步 CSS 依赖；每个页面使用自己的动态导入工厂，避免生产构建遗漏账号页样式。
- 构建时给普通 CSS 声明补充 `color-mix()` 与 `dvh` 的回退声明。主题变量继续参与计算，旧浏览器也能显示浅色和夜间底色。
- 账号表单的混色变量使用 `@supports` 切换，避免不支持的函数通过 CSS 自定义属性传播。
- 统一请求超时改用 `AbortController`，不再要求浏览器提供 `AbortSignal.timeout()`；保留调用方取消信号，完成请求后清理计时器。
- URL 参数判空使用 `toString()`，不依赖 `URLSearchParams.size`。
- 对登录存储采用延迟访问：浏览器拒绝存储时显示可操作的登录提示，避免入口模块直接崩溃；不使用无法跨跳转保存 PKCE 状态的内存替代方案。

`color-mix()` 自 Safari 16.2 才开始支持，参见 [WebKit 官方说明](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)。回退颜色优先选择已有主题底色；不支持混色的浏览器会减少渐变层次和阴影。

### 登录会话

1. 有刷新令牌时，初始化、重新聚焦和定时检查优先使用各应用自己的刷新授权；不再强制走隐藏 iframe。
2. 隐藏 iframe 失败不等同于有效刷新会话已经退出。刷新授权确认失效且静默恢复失败时，清理凭据，绝不重新装载已拒绝的缓存。
3. 应用入口统一使用注册表 `launchUrl()`，附带非敏感的 `__sso=1` 标记。子应用先消费并移除标记；确有需要时只尝试一次顶层 `prompt=none` 授权，不会自动反复跳转。
4. Safari 从返回缓存恢复页面时，保留身份监听器，通过 `pageshow.persisted` 重新检查会话。
5. 初始化、返回恢复及跨标签页切换均检查最近的登录主体与退出通知。账号发生变化时先隐藏旧工作区，再重载，避免把新账号令牌交给旧账号界面。

仍使用独立 OIDC Client、PKCE、授权状态校验、各自 audience 和按用户隔离的数据。令牌保存在 `sessionStorage`，跨应用通知不包含令牌。服务器没有放宽认证、跨域或 Cookie 策略。

官方库的 `signinSilent()` 支持刷新授权或 iframe，参见 [oidc-client-ts 文档](https://authts.github.io/oidc-client-ts/classes/UserManager.html)。本轮发现的是强制 iframe 与缓存恢复的实现问题；未把线上故障未经验证地归因于 Safari 的第三方 Cookie 策略。

## 验证方法

### 自动回归

```powershell
npm test
npm run check:boundaries
node scripts/build-web.mjs --origin $env:WTG_PUBLIC_ORIGIN --out-dir .local/safari-release/dist
node scripts/test-portal-bundle.mjs --bundle-dir .local/safari-release/dist/portal
node scripts/test-sso.mjs
```

- 单元测试覆盖刷新优先、iframe 失败、拒绝的刷新授权、过期令牌、退出竞态、账号隔离、返回恢复、存储拒绝、请求取消和样式回退。
- 生产包测试检查真实 JS/CSS 文件的加载与布局规则，而非只检查文件是否存在。
- 协议测试使用独立测试账号验证三个客户端、令牌续期、API 的 audience 隔离及统一退出。

### WebKit 实际渲染与交互

测试工具可以独立安装，不加入生产应用依赖：

```powershell
npm install --prefix D:\Application\BrowserTesting playwright --no-audit --no-fund
$env:PLAYWRIGHT_BROWSERS_PATH='D:\Application\BrowserTesting\browsers'
node D:\Application\BrowserTesting\node_modules\playwright\cli.js install webkit
$env:WTG_PLAYWRIGHT_MODULE='D:\Application\BrowserTesting\node_modules\playwright\index.mjs'
```

在当前进程安全设置 `WTG_PUBLIC_ORIGIN`、`WTG_USERNAME`、`WTG_PASSWORD`，使用专用测试账号，不把值写入提交文件或命令历史。可将 `WTG_BROWSER_REPORT_DIR` 指向 `.local/` 下的报告目录。

```powershell
# 候选包：静态资源使用本轮构建，认证和只读 API 使用选定服务器。
node scripts/test-webkit-sso.mjs --bundle-dir .local/safari-release/dist
node scripts/test-webkit-sso.mjs --bundle-dir .local/safari-release/dist --mobile --legacy

# 部署后：所有页面和资源都来自服务器。
node scripts/test-webkit-sso.mjs
node scripts/test-webkit-sso.mjs --mobile
```

脚本执行一次真实门户登录，依次检查账号页样式、各设置区、手机宽度、浅色/夜间模式、记账打开与刷新、新标签页和返回导航、退出。禁止所有 iframe 导航后，新标签页仍必须通过一次顶层静默授权进入记账。

`--legacy` 会禁用两个新 API，并在候选 CSS 响应中移除混色与动态视口声明，验证构建产生的回退。它不是完整模拟某一个旧 Safari 版本。

报告和截图只保存在忽略目录，不提交账号、密钥、浏览器存储、Cookie 或原始认证网络记录。脚本不改资料、不配置 Key、不创建业务流水。

## 验证边界

本机为 Windows，使用 Playwright 的 WebKit 引擎进行渲染与交互测试；**不是 macOS Safari 或 iPhone 真机验收**。WebKit 官方自动化与 Apple 系统内的 Safari 仍有差异，参见 [Playwright 浏览器说明](https://playwright.dev/docs/browsers#webkit)。

首次打开一个尚无本地令牌的应用，隐私限制下可能有一次免输入密码的页面跳转。浏览器彻底禁止本站存储时，无法安全维持跨页面 PKCE 登录，页面会提示允许本站存储后重试。无需关闭整台设备的隐私保护。
