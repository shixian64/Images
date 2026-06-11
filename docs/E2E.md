# 浏览器 E2E Smoke

项目提供一个无第三方依赖的真实浏览器冒烟脚本，用 Chrome / Edge / Chromium 的 DevTools Protocol 打开已运行的 Image Studio 页面，验证登录页真实渲染、表单存在、注册表单默认隐藏，以及入口页没有内联脚本。配置测试账号后，脚本还会执行真实登录并验证主应用 shell。

## 使用方式

先启动服务：

```powershell
npm start
```

另开终端运行：

```powershell
npm run e2e:smoke
```

可选参数：

```powershell
npm run e2e:smoke -- --base-url http://127.0.0.1:8787
npm run e2e:smoke -- --browser "C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run e2e:smoke -- --headed
npm run e2e:smoke -- --screenshot .\tmp\e2e-login.png
npm run e2e:smoke -- --username alice --password "test-password"
```

环境变量等价项：

- `E2E_BASE_URL`：目标服务地址，默认 `http://127.0.0.1:8787`。
- `E2E_BROWSER`：浏览器可执行文件路径或 PATH 中的命令。
- `E2E_HEADED=1`：使用有头模式。
- `E2E_SCREENSHOT=path.png`：保存登录页截图。
- `E2E_USERNAME` / `E2E_PASSWORD`：可选测试账号；设置后会额外验证登录态主应用 shell。
- `E2E_SKIP_IF_BROWSER_MISSING=1`：没有找到浏览器时跳过而不是失败。

## 当前覆盖范围

- 真实浏览器打开 `/login.html`。
- 校验页面标题和登录 heading。
- 校验 `#loginForm` 存在。
- 校验 `#registerForm` 默认隐藏。
- 校验入口 HTML 没有 inline `<script>`，与当前 CSP 约束一致。
- 如果提供 `E2E_USERNAME` / `E2E_PASSWORD` 或 `--username` / `--password`，会提交真实登录表单，进入 `/` 后校验 `#studioPanel.active`、`#prompt`、主导航 tab 和主应用无 inline `<script>`。

这不是完整视觉回归；后续可在同一 CDP 基础上扩展主要 tab 切换、截图基线和差异阈值。
