# AGENTS.md — 这个博客项目给 AI 的说明书

> 这是一个**纯静态个人博客**：Astro 6 + Markdown，无后端、无数据库、无运行时依赖。
> 内容比代码重要。改样式可以大胆，改内容必须克制。

## 项目地图

| 路径 | 职责 | 备注 |
| --- | --- | --- |
| `src/consts.ts` | 站点信息：标题、作者、域名、导航、社交链接 | 改站点先改这里 |
| `astro.config.mjs` | 构建配置、`site` 域名、集成 | `site` 要与 `consts.ts` 的 `url` 一致 |
| `src/content/blog/` | 全部文章（Markdown） | 文件名即 URL slug |
| `src/content.config.ts` | 文章 frontmatter 的校验规则 | 新增字段先改这里 |
| `src/layouts/` | 页面骨架（BaseLayout / BlogPost） | |
| `src/components/` | 页头、页脚、列表项、目录、主题切换 | |
| `src/pages/` | 路由：首页 / blog / archive / tags / about / rss / 404 | |
| `src/styles/global.css` | 全部设计变量与排版 | 颜色、字体、间距都在这 |
| `scripts/check.mjs` | 构建产物自检：断链、SEO、RSS | |
| `dist/` | 构建产物，**不要手改** | 已被 gitignore |

## 常用命令

| 目的 | 命令 |
| --- | --- |
| 本地开发 | `pnpm dev`（http://localhost:4321） |
| 构建 | `pnpm build` |
| 内容门禁 | `make gate`（检查字段 / 结构 / 已发布文章是否被篡改） |
| 登记新文章 | `make lock`（更新 `content-lock.json`） |
| 构建 + 自检 | `make verify`（= 门禁 + 构建 + 产物自检） |
| 仅自检 | `node scripts/check.mjs` |
| 预览产物 | `pnpm preview` |

## 发布流程

1. 新文件放 `src/content/blog/<slug>.md`
2. 填好 frontmatter（见下）
3. `make verify` 通过后，运行 `make lock` 把新文章登记进 `content-lock.json`
4. 提交时把 `.md` 和 `content-lock.json` 一起提交

frontmatter 必须是：

```yaml
---
title: 标题
description: 一句话摘要，会出现在列表页、RSS 和搜索结果里
pubDate: 2026-10-30
tags: ["标签1", "标签2"]
draft: false        # 可选；true 则不会被构建和 RSS 收录
---
```

硬性要求：

1. **正文至少有一个 `##` 标题**，否则文章页目录不显示。
2. 标题不超过 30 个汉字，摘要不超过 80 个汉字。
3. 标签从已有标签里选，不要随意造新词（先看 `/tags/` 页面）。
4. 代码块必须标注语言。
5. 图片放 `src/assets/` 并用相对路径引用，不要外链。

## 修改站点的规则

- 改站点名 / 作者 / 域名：只改 `src/consts.ts` 和 `astro.config.mjs` 的 `site`。
- 改配色 / 字体：只改 `src/styles/global.css` 顶部的 CSS 变量，**不要**在组件里写死颜色。
- 新增页面：放 `src/pages/`，并在 `src/consts.ts` 的 `nav` 里登记（如果需要出现在导航）。
- 新增 frontmatter 字段：必须同时更新 `src/content.config.ts` 的 schema。

## 禁区（P0，不要动）

- `dist/`、`.astro/`、`node_modules/`：构建产物与依赖，改了会被覆盖。
- `src/content/blog/` 里已发布文章的 **slug 与 pubDate**：由 `content-lock.json` 锁定，改动会让 `make gate` 失败。确需改动时，改完运行 `make lock` 并在变更说明里写原因。
- `content-lock.json`：只能通过 `make lock` 更新，不要手改。
- `.github/workflows/`：部署链路。

## 验证要求

任何改动交付前必须：

```bash
make verify
```

通过标准：构建成功、断链 0、每页都有 title 和 description、RSS 有内容。

涉及视觉改动时，另外说明改了哪些页面、深色模式下是否检查过。

## 写作语气（改文案时遵守）

- 中文，短句，少用形容词堆叠。
- 不要「赋能」「闭环」「抓手」这类词。
- 第一人称，像跟朋友解释，不像对客户汇报。
- 结论先行，再给依据。

## 反模式

- 为了加一个功能引入新依赖（先问能不能不加）。
- 在文章里写「如上所述」这种依赖上下文的表达（RSS 读者看不到）。
- 把颜色写死在组件里。
- 修改已发布文章时，顺手改了它的 slug。
