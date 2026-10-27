# 完整服务：本机运行 + 免费固定子域名

## 当前范围

部署整套个人服务：个人门户、WhereToGo 旅游、SmartLedger 记账、两个 Java 8 API、Keycloak 统一账号，以及 PostgreSQL/PostGIS。

继续采用无需购买域名的 Tailscale Personal + Funnel。免费计划及服务限制见 [定价](https://tailscale.com/pricing)、[Funnel 文档](https://tailscale.com/docs/features/tailscale-funnel)。固定主机名与账号和设备关联；保留同一个设备记录与名称。该方案不提供云主机或永久在线承诺，电脑须保持开机联网。

此前只开放记账的决定已改为完整服务。已有的 Oracle、免 Oracle 和记账单独部署文档保留作其他选项；本文件说明当前部署目标。

## 单一地址下的入口

以实际分配的 `https://personal-space.<网络名>.ts.net` 为基础地址：

| 路径 | 内容 |
| --- | --- |
| `/` | 公开门户 |
| `/travel/` | 旅游应用 |
| `/ledger/` | 记账应用 |
| `/identity/realms/share/` | 统一账号登录与用户账号中心 |
| `/travel-api/api/v1/` | 旅游 API，需要对应令牌 |
| `/ledger-api/api/v1/` | 记账 API，需要对应令牌 |

统一账号提供单点登录，两个应用分别申请自己的 audience 令牌。数据库、Keycloak 管理后台与 master realm 不通过公网网关开放。当前体验账号维持邀请制，不开放自助注册。

## 当前已完成和待完成

本机完整体验环境使用原有独立分享数据库；可用以下命令从只开放记账恢复到完整服务，保留本次账号、数据、网址和原到期时间：

```powershell
Set-Location 'E:\c\AI-app\WhereToGo'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\use-full-share.ps1
```

脚本重新构建记账前端、恢复门户与旅游入口，并在需要时启动本次旅行 API。服务健康后再切换访问范围，不重新生成账号或数据库。只开放记账时没有构建过旅游服务的会话无法直接恢复，脚本会说明原因。

新建完整临时体验环境使用 `scripts/start-share.ps1`，不传 `-LedgerOnly`。不要在当前会话运行时新建另一套。

**固定域名尚未分配和启用**。Tailscale 安装包已经下载并校验，但自动管理员安装被本环境审批策略阻止，必须先由电脑主人完成下列两步。

## 1. 安装到 D 盘

在 Windows 开始菜单右键 PowerShell，选择“以管理员身份运行”：

```powershell
Set-Location 'E:\c\AI-app\WhereToGo'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-tailscale.ps1
```

安装路径为 `D:\Application\Tailscale`。脚本核验官方 SHA-256 和 Authenticode 签名，日志位于该目录的 `install.log`。Windows 网络驱动、服务登记和系统数据由 Windows 管理。

## 2. 登录并分配主机名

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\connect-funnel.ps1
```

打开命令显示的官方登录地址，用自己的受支持账号完成注册或登录、设备授权。首次连接使用设备名称 `personal-space`；如果设备已经登录，脚本沿用已有名称，不会擅自改名。

该步骤不启用出口节点、不导入子网路由、不替换本机 DNS，也不会立即把服务公开。30 秒内未完成登录时，可在浏览器完成后重新执行。把输出的 `Assigned hostname` 提供给继续部署的操作者，不需要提供账号密码或验证码。

此前如果已经通过 `connect-ledger-funnel.ps1` 登录，现有 `smartledger.<网络名>.ts.net` 名称也能用于整套服务，不必为了名字重新注册设备。

## 3. 主机名就绪后继续配置

以下事项需要实际主机名、Tailscale 授权及运行检查，目前未执行：

1. 启用该设备的 Funnel 与 HTTPS，仅映射本机网关 `127.0.0.1:18180`。
2. 备份当前分享数据库、密钥、配置，以及旧域名浏览器中尚未同步的数据。
3. 重新构建门户和记账两套前端，统一更新公开地址、API 地址与 OIDC issuer。
4. 更新两套应用的 Keycloak 登录回调、静默回调、退出回调，以及 Keycloak 自身的 hostname。
5. 迁移旅行和记账用户的 issuer 绑定；按需重新加密与 issuer 绑定的坚果云凭据。
6. 完成外网真实登录、旅游与记账访问、账号隔离、管理路径限制等运行检查后，停止旧 Quick Tunnel，再移除临时八小时限制。
7. 配置启动恢复、日志保留、备份，以及重启后的检查。未登录 Windows 时持续运行需要额外的管理员服务或任务配置。

固定地址与持续运行是两个条件；只设置域名不能保证电脑关机后仍可访问。

## 数据与安全

- 当前分享实例与原本地实例数据隔离。恢复整套体验服务不会把原本地私有数据公开。
- 更换域名后 IndexedDB 不会自动迁移；保留旧站点数据并先导出或云同步。
- 两个后端均按 `(issuer, subject)` 管理用户。记账同步凭据使用 AES-GCM，附加认证数据含 issuer；改域名时必须处理这些绑定。
- 所有体验账号的密码仍可通过 `scripts/show-share-accounts.ps1` 查看，不要把管理员密码或密钥放进前端构建。
- 关闭当前体验环境并恢复本地开发服务：`powershell.exe -ExecutionPolicy Bypass -File .\scripts\stop-share.ps1 -RestoreLocal`。正式启用 Funnel 后，还需配置相应的停止与取消自动启动逻辑。
