# v0.1.0 — 悬停文件引用，直接在资源管理器中定位

首个版本。一个纯 Client 的 DSH bundle：在聊天里悬停蓝色文件引用，浮层弹出「📂 在资源管理器中显示」，点一下就交给宿主的 `remote.session.openWorkspacePath({ action: 'reveal' })`，在 Explorer / Finder / Linux 文件管理器中选中该文件。

默认点击行为完全不变（仍然在右侧栏预览）。

## 安装

```sh
dsh plugin --profile <profile> add github:Ghdhdhhake/dsh-reveal-in-explorer
```

安装后刷新页面即可，Client 改动热加载，无需重启。

## 亮点

- **只加悬停，不改点击** —— 不劫持任何原生交互。
- **相对路径补全** —— `docs/a.md` 会用当前会话的 `cwd` 补成绝对路径。
- **失败可见** —— 宿主拒绝（路径不存在、无权限、无桌面文件管理器）时浮层保持打开，把宿主给的原因显示在第二行，并 `console.warn` 一条带路径和原因的日志，方便直接贴进 Issue。
- **跨平台** —— Windows `explorer.exe /select,`、macOS `open -R`、Linux 打开所在目录，全部由宿主决定。
- **中英双语**，跟随宿主主题 token，键盘可达（`focusin` 触发、`Esc` 关闭）。

## 质量

- **45 个单元测试**（Node 内置 runner，零依赖、不联网）：
  - 跨平台路径拼接：Windows 盘符/UNC、macOS/Linux 斜杠、绝对路径优先、CJK 与空格文件名；
  - **选择器契约**：每个选择器都要在 `test/fixtures/chat-transcript.html` 这个结构快照上命中，DSH 升级改 DOM 时 CI 立刻失败而不是页面静默失效；
  - 浮层行为与各状态渲染（含失败原因第二行）。
- **GitHub Actions CI**：Node 20 / 22 / 24 × Ubuntu / Windows，跑构建、`lib/` 与 `src/` 同步检查、清单检查、全部单测。
- `scripts/check.mjs` 还会校验「每个测试文件都被 `npm test` 登记」，防止新增测试静默不跑。

## 兼容性

- `engines.dsh`: **`>=0.2.0-rc.1 <0.3.0`** —— 写在 `package.json`，DSH 安装前会据此拦截不兼容版本，而不是装上再崩。
- **实测版本**：`0.2.1-rc.2`（Windows / DeepSeek Harness Desktop），悬停出浮层与点击跳转资源管理器均正常。

## 已知限制

- 引用识别依赖宿主当前渲染的 DOM；选择器集中在 `SELECTORS` 一处，宿主改结构时只需改那里并同步 fixture。
- Linux 没有通用的「选中文件」协议，宿主会打开所在目录。
- 浮层按引用包围盒定位，引用滚出视口时浮层关闭而不是跟随。

## 完整改动

https://github.com/Ghdhdhhake/dsh-reveal-in-explorer/commits/v0.1.0
