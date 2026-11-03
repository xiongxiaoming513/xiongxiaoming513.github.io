# 回滚手册（静态站）

> 原则：**先止血，再定位。** 回滚不需要先搞清楚原因。
> 实测数据：一次回滚从推送 revert 到线上恢复约 **42 秒**（2026-11-03 演练）。

## 什么时候回滚

- 首页或文章页白屏、样式明显崩坏、导航失效
- 文章内容出现事实错误、错误链接（错别字不算）
- 发布后 5 分钟内发现任何"用户能直接看到"的异常

## 方式一：revert 单个提交（推荐，约 40 秒）

```bash
git log --oneline -5              # 1. 找到坏提交
git revert --no-edit <坏提交>      # 2. 生成反向提交
git push origin main              # 3. 触发自动部署
```

回滚本身就是一次正常发布，历史清晰、可追溯。

## 方式二：连续多个坏提交

```bash
git revert --no-edit <最早的坏提交>^..HEAD
git push origin main
```

## 方式三：找回上一个好版本（最后手段）

```bash
git checkout <好版本的 sha> -- .
git commit -m "rollback: 恢复到 <sha>"
git push origin main
```

不推荐：历史里看不出"回滚到了哪个版本"，只在 revert 冲突严重时用。

## 操作后验证清单

```bash
# 1. 等 30–45 秒，确认部署成功
gh run list --limit 1

# 2. 关键页面可访问
curl -s -o /dev/null -w "%{http_code}\n" https://xiongxiaoming513.github.io/
curl -s -o /dev/null -w "%{http_code}\n" https://xiongxiaoming513.github.io/archive/
curl -s -o /dev/null -w "%{http_code}\n" https://xiongxiaoming513.github.io/rss.xml

# 3. 跑一遍冒烟（7 项关键检查）
node scripts/smoke.mjs

# 4. 坏内容确实消失（把关键词换掉）
curl -s https://xiongxiaoming513.github.io/ | grep -c "<坏内容关键词>"
```

- [ ] 首页 200，关键文案正确
- [ ] 归档页 / RSS 200
- [ ] `node scripts/smoke.mjs` 7/7 通过
- [ ] 坏内容在线上搜不到
- [ ] `git log` 里有 revert 记录

## 复盘（24 小时内）

回答三个问题，写进 `docs/`：

1. 这个错误**本可以在哪一步被发现**？（`make verify` / 内容门禁 / 部署后自检 / 人工）
2. 为什么没发现？
3. 补什么规则能防住下一次？→ 写进 `AGENTS.md` 反模式或 `scripts/check-content.mjs`

## 已知限制

| 限制 | 说明 | 缓解 |
| --- | --- | --- |
| 无真实用户监控 | 只能确认"发布后是好的"，无法知道"半夜是否挂了" | CI 部署后自动跑 smoke；后续可加外部 uptime 监控 |
| 部署窗口 | Actions 约 30–45 秒，期间可能新旧混合 | 避免频繁连续发布 |
| 无灰度 | 静态站没有流量切分，回滚是全量切换 | 大改动前先在本地 `make verify` |
| 无版本回放 | 不能直接重发历史构建产物 | 用 revert 重新走一次发布 |
| 冒烟覆盖有限 | 只查 7 条关键路径，不查样式与交互 | 大改动时配合人工预览 |
