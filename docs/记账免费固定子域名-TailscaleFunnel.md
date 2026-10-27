# 记账免费固定子域名：Tailscale Funnel

## 选择结果

在没有自有域名的情况下，使用 Tailscale 的 Personal 免费计划与 Funnel。地址形式为 `https://smartledger.<分配的网络名>.ts.net/ledger/`，实际主机名由自己的 Tailscale 账号和设备分配，不是可以任意占用的域名。

Funnel 的 DNS 名称稳定，重启后可继续使用；保留同一个网络和设备记录、不要随意改名或删除设备。Personal 免费计划和 Funnel 功能以官网为准。Funnel 当前为 beta，存在带宽限制，因此不能承诺永久可用或服务等级。

来源：[Personal 套餐](https://tailscale.com/pricing)、[Funnel 功能和限制](https://tailscale.com/docs/features/tailscale-funnel)、[固定主机名示例](https://tailscale.com/docs/reference/examples/funnel)。

朋友无需安装 Tailscale，也无需加入你的私有网络，直接用浏览器访问公开 HTTPS 地址，之后用 SmartLedger 自身账号登录。无需购买域名或先注册 Cloudflare。电脑仍须保持开机、联网，Funnel 不提供云主机。

## 当前准备状态

- 记账服务已从原分享入口独立开放，保留体验账号和数据。
- 安装目录：`D:\Application\Tailscale`。
- 安装包：`tailscale-setup-1.104.2-amd64.msi`，来自官方 stable 包站。
- 安装脚本会检查官方 SHA-256 与 Tailscale Authenticode 签名。
- 自动管理员安装被本环境的审批策略阻止，须由电脑主人在管理员 PowerShell 中执行安装。
- 尚未完成 Tailscale 登录，尚未分配、启用和验证固定记账地址。现有临时链接仍按原到期时间提供服务。

## 第一步：安装到 D 盘

在 Windows 开始菜单找到 PowerShell，右键选择“以管理员身份运行”，执行：

```powershell
Set-Location 'E:\c\AI-app\WhereToGo'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-tailscale.ps1
```

安装脚本明确传入 MSI 的 `INSTALLDIR=D:\Application\Tailscale`，不使用默认 C 盘应用目录。Windows 驱动、服务登记和系统级数据仍由 Windows Installer 管理。安装日志在 `D:\Application\Tailscale\install.log`。

## 第二步：本人登录 Tailscale

在项目目录执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\connect-ledger-funnel.ps1
```

打开命令显示的官方登录地址，使用你自己已有的受支持账号登录或创建个人网络，完成设备授权。是否能直接用 QQ 邮箱取决于登录页提供的身份提供商；不需要把邮箱密码、第三方账号密码或验证码发到聊天里。

脚本不会启用出口节点、导入子网路由或替换本机 DNS。它只登录并显示分配的主机名，不会在登录后直接公开记账服务。如 30 秒内没有完成授权，可完成浏览器登录后重新执行脚本确认状态。

## 第三步：登录后继续完成部署

提供脚本输出的 `Assigned hostname` 即可继续后续配置，该主机名不是密码。后续工作需要实际主机名才能运行、验证：

1. 在 Tailscale 中启用该设备的 Funnel、HTTPS 和所需授权；首次启用可能要求在官方页面确认。
2. 只反向代理到本机网关 `127.0.0.1:18180`，不转发数据库、Keycloak 管理后台或旅行服务。
3. 用固定域名重新构建记账前端，更新 Keycloak hostname、回调地址、退出地址和 API issuer/JWKS 地址。
4. 备份当前会话。检查浏览器本地数据、服务端快照和坚果云凭据，安排旧 issuer 到新 issuer 的迁移。
5. 完成外网 HTTPS、真实登录和账号隔离检查后，再移除八小时体验限制、关闭旧 Quick Tunnel。
6. 配置服务恢复和当前用户登录后自动启动，检查重启恢复。若要求 Windows 未登录时也运行，还需管理员配置服务或计划任务。

第三步尚未执行。不能仅把网关的到期时间删掉就声称已经获得永久链接。

## 数据迁移注意

浏览器的 IndexedDB 按网站来源隔离，旧域名的本地账本不会自动出现在新域名。切换前应在旧入口导出备份或确认云同步完成；不要先清理旧站点数据。

服务端用户按 `(issuer, subject)` 隔离；坚果云凭据的 AES-GCM 附加认证数据也包含 issuer。只改公开域名而忽略这些绑定，会导致旧数据不可见或凭据无法解密。需要备份后迁移身份绑定和重新加密相应凭据，或者由账号本人重新保存同步配置，不能直接复制密文并宣称已迁移。

停止原体验环境的命令仍为 `scripts/stop-share.ps1`。在正式启用 Funnel 后，还需按实际配置加入 Funnel 停止及自动启动取消逻辑，避免自动恢复意外重新开放服务。
