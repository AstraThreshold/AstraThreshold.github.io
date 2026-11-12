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
- `script.js`：语言切换、粉丝数和 GitHub stars 读取。
- `rolling-counter.js`：两个统计数字共用的逐位纵向滚轮动画，进入页面和手动刷新时从零开始；支持减少动态效果与后台中止。
- `gallery.js`：照片墙的循环滚动、悬停暂停、浮起放大与归位动画，以及点击查看大图和键盘浏览。
- `styles.css`：紧凑版式、响应式和跟随系统的深浅配色；中文苹方、英文 Times New Roman / Consolas / Arial、链接箭头等符号均随网站打包。项目标题使用内嵌的 Cascadia 花体斜体；个人简介、履历、荣誉与证书正文稍作放大，粉丝数与 GitHub stars 的滚轮数字维持原尺寸。
- `assets/fonts/`：本人提供的苹方字体生成的 WOFF2 子集与 CJK 专用样式，未安装字体的设备也会从同站加载。`coverage.json` 仅供构建时检查缺字，不发布。修改中文文案后，若构建提示缺字，使用 `fonttools[woff]` 运行 `python scripts/prepare-pingfang.py 字体源目录` 重新生成；源目录包含本人提供的 `msyhl.ttc`、`msyh.ttc`、`msyhbd.ttc`，原始字体文件不进入仓库。
- 项目标题的 Cascadia 子集覆盖 ASCII，并保留花体字形；`scripts/prepare-cascadia.py` 可从本人的斜体源文件重新生成，生成后同步 `styles.css` 中带哈希的字体路径。原字体采用 SIL Open Font License，许可文本随网页打包。
- `scripts/prepare-latin-fonts.py`：将本机提供的 Times New Roman、Consolas、Arial 各四个字重/字形，以及 Segoe UI Symbol 的所需符号转换为 WOFF2。浏览器按实际使用加载，`latin-coverage.json` 只在构建时检查缺字，不发布；网页不使用 `local()` 字体来源。
- `assets/brand/`：由 WoooLAB 原始素材裁剪制作的网页标识与 favicon；分享卡片 SVG 的文字已转为轮廓，不调用设备字体。
- `assets/projects/`：项目展示素材。
- `assets/gallery/`：banner PSD 照片与本人提供的照片，共 23 张；`SOURCES.md` 记录来源。每张包含网页大图和缩略图。
- `assets/profile/`：Bilibili 个人头像与来源记录。
- `assets/data/bilibili.json`：最近一次成功读取的粉丝数与读取时间。
- `assets/data/github.json`：所有公开仓库的 stars 合计、各仓库数据及读取时间。
- `assets/affiliations/`：官方素材制作的黑白透明机构标志；CSS 随系统配色切换深浅。网站品牌和 favicon 保持 WoooLAB。
- `github-stats.js`：浏览器与定时任务共用的 GitHub 分页统计逻辑。
- `scripts/build.mjs`：将公开网页与允许的媒体文件复制至 `dist/`。

项目资料、简历原件、品牌源文件和研究目录不进入发布产物，也不加入此仓库。联系方式、身份和项目状态变更时，请同时维护两种语言。

照片墙位于桌面个人资料右侧，与资料上下对齐；窄屏置于资料下方。小图按容器宽度自动分列，相邻列反向缓慢滚动，上下边缘使用渐隐遮罩。鼠标进入照片墙时暂停，指向的照片在遮罩外浮起放大；移开后归位，再从暂停位置继续。图片不显示描述。点击仍可查看完整构图的大图，支持前后切换、左右方向键及 Esc 关闭；键盘可通过“查看全部照片”入口访问。系统开启“减少动态效果”时改为手动滚动。禁用 JavaScript 时，照片链接仍可直接打开。WebP 副本不放大原图、不带 EXIF 等原始元数据。新增照片时，维护 `index.html` 中连续的 `data-photo-index`、实际尺寸、缩略图路径与缩略图比例。

## GitHub Pages 发布

仓库：[AstraThreshold/AstraThreshold.github.io](https://github.com/AstraThreshold/AstraThreshold.github.io)

1. 将网站源文件推送到 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 检查 **Actions → Deploy GitHub Pages**。每次推送 `main`、手动运行或定时触发工作流，都会读取粉丝数和 GitHub stars、构建并发布 `dist/`。

工作流使用 GitHub 官方 Pages Actions，无需个人访问令牌。构建产物采用白名单，避免把原始简历或设计源文件当作网站文件发布。发布流程参考 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## Bilibili 粉丝数更新

无需服务器、登录凭据或第三方代理。GitHub Actions 在每小时第 7、22、37、52 分钟尝试读取公开粉丝数接口；页面打开时及可见期间每分钟检查同站 JSON，刷新按钮也会检查最新发布的数据。数据保留在 Pages 发布产物中，不会每 15 分钟制造一次 Git 提交。

`scripts/update-bilibili.mjs` 先取回最近发布的数据，再请求 Bilibili。接口失败时保留上次成功结果和原始时间；页面不会把失败当成零粉丝，超过两小时会显示“最近可用”。构建时还会把这份数据写入 HTML，保证禁用 JavaScript 时仍有数字和日期。

这是定时更新，受 GitHub 调度、Bilibili 接口可用性和 CDN 缓存影响，不保证严格每 15 分钟完成。GitHub 公开仓库连续 60 天无活动时可能自动停用定时工作流，可在 Actions 中重新启用，见 [GitHub schedule 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

本地手动更新：`npm run refresh:stats`，然后 `npm run build`。头像使用当前保存的 Bilibili 图片，不随粉丝数任务替换。

## GitHub stars 更新

总数是 AstraThreshold 名下所有公开仓库收到的 stars 之和，包含 Fork 仓库；不是用户收藏过的仓库数。分页完整读取成功后才替换总数，任何一页失败都不会显示部分合计。

页面打开和点击“刷新”时优先请求 GitHub 公开 API，可见期间约每 5 分钟尝试直接更新。匿名访问遇到限流或网络错误时，使用同站 JSON 和最近一次有效缓存，并将自动重试间隔延长至 15 分钟。同站 JSON 随现有 GitHub Actions 任务约每 15 分钟更新，不需要服务器或个人令牌。任务只在运行时使用 GitHub 自动提供的短期令牌，提高 API 配额；凭据不进入公开文件。

顶部总数和项目列表的 stars 使用同一份数据，展示真实读取时间。Bilibili 粉丝数与 GitHub 总 stars 在进入页面及手动刷新时，均以老虎机式滚轮从零开始逐位滚动、依次停稳；后台检查不重复播放。动画期间收到新数据时会衔接到最新数值，系统开启“减少动态效果”或页面进入后台时直接显示最终值。

WoooLAB 标识和项目作品归原作者所有；各开源项目的许可以其独立仓库为准。
