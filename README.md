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

- `index.html`：页面结构、中文默认内容、元数据及外链。
- `script.js`：中英文文案、语言切换及交互。
- `styles.css`：版式、响应式和配色。
- `assets/brand/`：由 WoooLAB 原始素材裁剪制作的网页标识与 favicon。
- `assets/projects/`：项目展示素材。
- `scripts/build.mjs`：将公开网页与允许的媒体文件复制至 `dist/`。

项目资料、简历原件、品牌源文件和研究目录不进入发布产物，也不加入此仓库。联系方式、身份和项目状态变更时，请同时维护两种语言。

## GitHub Pages 发布

仓库：[AstraThreshold/AstraThreshold.github.io](https://github.com/AstraThreshold/AstraThreshold.github.io)

1. 将网站源文件推送到 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 检查 **Actions → Deploy GitHub Pages**。每次推送 `main` 或手动运行工作流都会构建并发布 `dist/`。

工作流使用 GitHub 官方 Pages Actions，无需个人访问令牌。构建产物采用白名单，避免把原始简历或设计源文件当作网站文件发布。发布流程参考 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

WoooLAB 标识和项目作品归原作者所有；各开源项目的许可以其独立仓库为准。
