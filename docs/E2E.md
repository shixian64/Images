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
npm run e2e:smoke -- --screenshot-dir .\tmp\e2e-shots --screenshot-manifest .\tmp\e2e-shots\manifest.json
npm run e2e:smoke -- --screenshot-dir .\tmp\e2e-shots --screenshot-baseline .\tmp\e2e-baseline\manifest.json
npm run e2e:smoke -- --username alice --password "test-password"
```

环境变量等价项：

- `E2E_BASE_URL`：目标服务地址，默认 `http://127.0.0.1:8787`。
- `E2E_BROWSER`：浏览器可执行文件路径或 PATH 中的命令。
- `E2E_HEADED=1`：使用有头模式。
- `E2E_SCREENSHOT=path.png`：保存登录页截图。
- `E2E_SCREENSHOT_DIR=dir`：保存登录页截图；设置测试账号后，还会保存每个主导航 tab 的截图。
- `E2E_SCREENSHOT_MANIFEST=path.json`：写出截图 manifest，包含每张 PNG 的 label、路径、字节数和 SHA-256。
- `E2E_SCREENSHOT_BASELINE=path.json`：读取既有 manifest，并按截图 label 对 SHA-256 做严格 baseline 比对。
- `E2E_USERNAME` / `E2E_PASSWORD`：可选测试账号；设置后会额外验证登录态主应用 shell。
- `E2E_SKIP_IF_BROWSER_MISSING=1`：没有找到浏览器时跳过而不是失败。

## 当前覆盖范围

- 真实浏览器打开 `/login.html`。
- 校验页面标题和登录 heading。
- 校验 `#loginForm` 存在。
- 校验 `#registerForm` 默认隐藏。
- 校验入口 HTML 没有 inline `<script>`，与当前 CSP 约束一致。
- 如果提供 `E2E_USERNAME` / `E2E_PASSWORD` 或 `--username` / `--password`，会提交真实登录表单，进入 `/` 后校验 `#studioPanel.active`、`#prompt`、主导航 tab、主应用无 inline `<script>`，并逐个切换 `studioPanel`、`comicPanel`、`promptPanel`、`galleryPanel`、`configPanel`、`logsPanel`。
- 如果提供 `E2E_SCREENSHOT_DIR` 或 `--screenshot-dir`，会为登录页和已验证的主应用 tab 生成 PNG；配合 `--screenshot-manifest` 可沉淀 SHA-256 baseline，配合 `--screenshot-baseline` 可在后续运行中检测截图是否发生严格字节级变化。

这仍不是完整感知型视觉 diff；当前 baseline 是严格 PNG 哈希比对，适合固定浏览器 / 固定环境下的冒烟级视觉漂移检测。后续可在同一 CDP 基础上扩展像素级差异阈值。
