# AstraThreshold · WoooLAB

面向 GitHub Pages 的中英双语个人主页。使用原生 HTML、CSS、JavaScript，无运行时依赖，也无需安装静态站点框架。

线上地址：[astrathreshold.github.io](https://astrathreshold.github.io/)

## 本地预览

安装 Node.js 22 或更新版本，然后运行：

```sh
npm run build
npm run preview
```

打开终端输出的本地地址（默认 `http://127.0.0.1:4173`）。修改源文件后重新构建并刷新页面。

## 内容维护

- `index.html`：页面结构、中文默认内容及 `data-en` 英文文案、元数据和外链。
- `script.js`：语言切换、粉丝数读取及交互。
- `styles.css`：紧凑版式、响应式和跟随系统的深浅配色；英文主要使用 Times New Roman。
- `assets/brand/`：由 WoooLAB 原始素材裁剪制作的网页标识与 favicon。
- `assets/projects/`：项目展示素材。
- `assets/profile/`：Bilibili 个人头像与来源记录。
- `assets/data/bilibili.json`：最近一次成功读取的粉丝数与读取时间。
- `scripts/build.mjs`：将公开网页与允许的媒体文件复制至 `dist/`。

项目资料、简历原件、品牌源文件和研究目录不进入发布产物，也不加入此仓库。联系方式、身份和项目状态变更时，请同时维护两种语言。

## GitHub Pages 发布

仓库：[AstraThreshold/AstraThreshold.github.io](https://github.com/AstraThreshold/AstraThreshold.github.io)

1. 将网站源文件推送到 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 检查 **Actions → Deploy GitHub Pages**。每次推送 `main`、手动运行或定时触发工作流，都会读取粉丝数、构建并发布 `dist/`。

工作流使用 GitHub 官方 Pages Actions，无需个人访问令牌。构建产物采用白名单，避免把原始简历或设计源文件当作网站文件发布。发布流程参考 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## Bilibili 粉丝数更新

无需服务器、登录凭据或第三方代理。GitHub Actions 在每小时第 7、22、37、52 分钟尝试读取公开粉丝数接口；页面打开时及可见期间每分钟检查同站 JSON，刷新按钮也会检查最新发布的数据。数据保留在 Pages 发布产物中，不会每 15 分钟制造一次 Git 提交。

`scripts/update-bilibili.mjs` 先取回最近发布的数据，再请求 Bilibili。接口失败时保留上次成功结果和原始时间；页面不会把失败当成零粉丝，超过两小时会显示“最近可用”。构建时还会把这份数据写入 HTML，保证禁用 JavaScript 时仍有数字和日期。

这是定时更新，受 GitHub 调度、Bilibili 接口可用性和 CDN 缓存影响，不保证严格每 15 分钟完成。GitHub 公开仓库连续 60 天无活动时可能自动停用定时工作流，可在 Actions 中重新启用，见 [GitHub schedule 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

本地手动更新：`npm run refresh:stats`，然后 `npm run build`。头像使用当前保存的 Bilibili 图片，不随粉丝数任务替换。

WoooLAB 标识和项目作品归原作者所有；各开源项目的许可以其独立仓库为准。
