# 原 App 快照恢复与统一登录

## 原 App JSON 兼容

仅重命名文件不能转换格式。原 App `schema_version: 2` 与网页版 `schemaVersion: 4` 的字段命名、分类结构和关联存储不同。

`SnapshotCompatibility` 在坚果云上传、下载以及只读预览转换时处理已知的原 App v2 格式：

- 保留流水 ID、金额、含时区的日期、标题、来源与分期信息；数字 ID 转为字符串，不重新生成流水。
- 将分类树展开为父子 ID 结构。
- 转换账本、预算周期、支付渠道与参与者。
- 将 `transaction_ledger_links` 放入各流水的 `ledgerSplitSettings`，保留原参与者 ID、付款人与分摊设置。
- 明确的空 `book_ids` 保持未归属；不使用已删除账本的旧 `book_id` 自动重新关联。
- 保留来源中的抵扣关联，不把抵扣当作新的独立收入重建。
- 导入后默认关闭服务器自动同步，避免刚恢复的外部快照未经确认就替换服务器同步版本。
- 拒绝未知版本、无效日期、负金额、重复 ID、断裂引用、超限内容及登录凭证。

`POST /api/v1/sync/nutstore/convert` 接收 `{snapshot: ...}`，需要有效记账身份令牌，返回转换后的快照；不访问坚果云、不修改数据库或云文件。

坚果云主文件仍是 `SmartLedger/snapshot-<账号哈希>.json`。账号哈希绑定身份服务 issuer 与 subject；凭据状态接口通过 `backupPath` 返回当前账号的实际相对路径。界面显示此路径。

覆盖前会先将旧文件原始字节写入 `SmartLedger/history/`；归档失败就停止覆盖。有 ETag 时使用 `If-Match` 防止覆盖其他设备刚更新的版本。首次创建使用 `If-None-Match: *`。

应用密码由服务器 AES-256-GCM 加密保存，JSON 账本备份本身未加密。用户财务文件、真实快照及凭证不得放入 Git；本地检查产物必须放在忽略目录。

## 统一登录入口

- 受门户管理的应用直接链接在无法静默恢复时只交给门户登录入口一次；无需先点击子应用自己的登录按钮。
- 门户入口即使 iframe 无法恢复会话，也可使用一次顶层授权，让身份服务 Cookie 提供 SSO。
- 子应用保持独立 PKCE 客户端、独立 audience 和 sessionStorage，不在 URL 或 localStorage 传递令牌。
- `__sso` 标记消费一次；回调失败显示可操作的错误，不无限自动跳转。
- 显式 `signedOut=1` 保持已退出状态，不立即自动登录。
- 记账和旅游共用 `AccountWelcome` 登录展示组件；独立部署模式保留自己的 OIDC 登录。

## 检查

```sh
mvn -f smartledger/backend/pom.xml test
npm test
node scripts/test-webkit-sso.mjs --mobile --responsive
```

后端使用 Java 8；云文件归档测试使用内存替身，不操作真实坚果云。真实用户文件的转换需在私有目录逐条核对金额、日期、ID 与关联后，再执行已授权的替换及读回验证。

WebKit 回归还检查不带 `__sso` 的新标签直接打开记账，以及 iframe 全部被阻止时从门户恢复登录。WebKit 模拟不等于 iPhone 真机测试。
