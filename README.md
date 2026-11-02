# 52Poké Mark · 攻略标记

面向 Windows 11、Firefox 140 及以上版本的个人扩展，专门用于 `https://wiki.52poke.com/`。运行时不依赖服务器或第三方脚本；本地标记不需要 Node.js。

0.2.0 更新：标记入口改为 Firefox 原生右键菜单；整行标记统一变灰，修复跨单元格空白被包裹而导致表格布局异常的问题。兼容原有标记、周目与备份。

## 安装试用

1. 在 Firefox 地址栏输入 `about:debugging#/runtime/this-firefox`。
2. 点击 **临时载入附加组件**，选择 `extension/manifest.json`，或 `dist/52poke-mark-0.2.0-unsigned.zip`。
3. 允许扩展访问神奇宝贝百科，刷新已经打开的百科页面。
4. 右下角出现 **52Poké** 面板；扩展工具栏按钮可以打开“周目与设置”。

**当前交付的是未签名测试版。** 临时安装在退出 Firefox 后会被移除，不能作为长期安装方式。正式版 Firefox 需要 Mozilla 签名才能长期安装；将 ZIP 提交到 [Mozilla 开发者中心](https://addons.mozilla.org/developers/)并选择自行分发，取得签名 XPI 后安装。无需公开上架。请勿在正式使用期间反复卸载扩展；卸载可能删除扩展存储，先导出备份。

扩展已经实现 `browser.storage.local` 持久保存：关闭网页、重新打开、扩展后台重新启动后可恢复。**浏览器重启后持续可用的前提是安装签名版本**。官方临时安装说明：[Firefox Extension Workshop](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)。

更新后在 `about:debugging` 中重新载入本扩展，再刷新百科页面；不需要卸载或清空标记。若之前载入的是 ZIP，使用新的 0.2.0 包替换载入。

## 标记方式

- **默认删除线、单格优先**：右键单元格，在 Firefox 原生菜单的“52Poké Mark”中选择“标记单格”。鼠标经过和选中文字不再自动弹出工具条。
- **文字选区**：拖选文字后右键，选择“标记选中文字”；可跨链接、跨文字节点标记。
- **流程步骤**：右键列表项、段落或定义列表项，选择“标记步骤”。用表格编写的流程可标记单格或整行。
- **整行变灰**：右键表格中的一格，选择“整行变灰”。整行背景、文字及图片呈灰色，不再对整行插入删除线或高亮包裹；再次右键选择“取消整行变灰”即可恢复。旧版整行标记自动使用新外观。合并单元格保留原来的跨行、跨列结构。
- **三种样式、五种颜色**：删除线、下划线、高亮。在右键菜单选择“调整样式与颜色…”后打开工具条。颜色含义可在设置中重命名；删除线与整行变灰计入“已完成”，高亮不计入。
- **取消 / 撤销**：对同一范围再次应用相同样式和颜色，会取消标记；也可在面板中取消。撤销按当前周目和当前页查找，最多保留最近 50 次本机标记操作，包括跨页面操作。
- **原网页交互**：保留链接节点及事件，不拦截链接跳转。游戏版本切换、折叠和文字选择继续使用原网页功能。
- **多个周目**：在设置里新建“晶灿钻石 · 一周目”“明亮珍珠 · 二周目”等，各套标记互不影响。当前周目在本机所有百科标签页之间统一切换。
- **网页变化**：根据原文、前后文、章节与表格上下文恢复。匹配有歧义或原文消失时保留记录，面板显示“待定位”。点击“重新定位”，在新的文字或单元格上右键，选择对应的“重新定位到…”菜单项。
- **备份**：导出所有周目；导入前显示记录数量，确认后按版本合并。旧备份不会覆盖更新的标记或取消记录。备份不包含 Google 凭据。

支持 `/wiki/`、`/zh-hans/`、`/zh-hant/` 等网站路径，并优先采用百科的 canonical 地址作为页面身份。**简繁转换不是文本翻译器**：不同文字版本导致原文改变时，可能需要重新定位。完全相同且无法区分的重复条目也会列为待定位，避免误标另一项。

首次打开的完整网页仍需要网络；扩展保存的是标记，不是百科的离线镜像。断网不会删除已有标记，已载入页面可以继续记录。

## Google Drive（可选，自用配置）

本地功能可立即使用。Google 同步需要你自己创建 OAuth 客户端，并在扩展设置中授权；源码和安装包没有内置 Google 凭据。

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，新建个人项目，启用 **Google Drive API**。
2. 配置 **Google Auth Platform** 的应用信息、受众与同意屏幕。若处于测试状态，将自己的 Google 账号加入测试用户。
3. 创建 **Web 应用** 类型 OAuth 客户端。在扩展设置里展开“首次连接”，复制显示的重定向地址，完整填入客户端的“已获授权的重定向 URI”。
4. 在扩展中输入该客户端的 **Client ID** 和 **Client Secret**，点击“连接 Google Drive”。允许 Firefox 的可选 Google API 和数据传输权限，在 Google 页面授权。
5. 其他设备使用**相同的 Cloud 项目、OAuth 客户端和 Google 账号**。连接后即可合并全部周目和标记。

使用授权码、PKCE S256 和随机 state 验证；通过 refresh token 续期。Client Secret 和令牌只保存在扩展自己的本机存储，**浏览器扩展不能保密一个公开分发的共享 Secret**。此配置仅适用于用户自己持有凭据的自用部署；不要把凭据写入源码或安装包。面向公众提供免配置登录时，需要额外部署服务端 OAuth 代理。

只申请 `https://www.googleapis.com/auth/drive.appdata`。同步内容保存在 Drive 的本应用隐藏目录，不读取其他文件。每台安装实例写自己的快照，读取所有设备快照并合并，避免两个设备同时写同一文件而丢标记。取消标记也会同步；并发修改同一标记按逻辑版本及设备 ID 确定胜者，下一次同步收敛。由于保留取消记录，数据不会自动压缩清理。

每次操作先落盘，约 30 秒后同步；浏览器运行时每 5 分钟检查远端。不同设备不是实时推送。界面分别显示本地“已保存”和云端“待同步 / 已同步 / 同步失败”。网络失败时保留本地记录，之后继续重试。测试模式授权可能过期，需要重新连接。

断开连接会移除本机客户端凭据与令牌，保留标记及云端文件。若还需撤销 Google 端授权，可在 Google 账号的第三方连接管理中操作。切换 Google 账号会把本机现有周目合并到新账号；请先导出备份并确认要迁移这些数据。

官方参考：[Mozilla identity API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/launchWebAuthFlow)、[Google 授权码流程](https://developers.google.com/identity/protocols/oauth2/web-server)、[Drive 应用数据目录](https://developers.google.com/workspace/drive/api/guides/appdata)。

## 开发与检查

```powershell
npm.cmd install --cache .local\npm-cache
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:firefox
```

打包只收录 `extension/`；`dist/` 内同时输出 ZIP 与未签名 XPI。源代码没有构建转换步骤，便于签名审核。`test:firefox` 通过 Selenium 在独立的无界面 Firefox 配置中测试，不修改日常浏览器配置；默认 Firefox 路径为 `C:\Program Files\Mozilla Firefox\firefox.exe`。首次测试会下载 geckodriver 到 `.local/selenium`。

核心测试覆盖离线合并、取消记录、撤销、并发落盘、权限撤回、OAuth state/PKCE、跨链接选区、歧义恢复、嵌套表格和跨行单格。真实页面 DOM 测试通过 `tools/fetch-fixtures.cjs` 获取页面后启用，不把百科全文打入扩展或提交源码。Google 真实账号端到端授权需要个人凭据，不在无凭据测试中宣称通过。

目录：`extension/lib/model.js` 数据模型；`anchors.js` 定位和渲染；`drive.js` Google API；`background.js` 持久化、撤销和同步调度；`content.js` 网页交互；`options.html` / `popup.html` 设置与工具栏弹窗。
