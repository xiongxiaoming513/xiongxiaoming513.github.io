SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help dev build preview gate lock verify smoke check clean

help: ## 显示可用命令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

dev: ## 本地开发（http://localhost:4321）
	pnpm dev

build: ## 构建到 dist/
	pnpm build

preview: ## 本地预览构建产物
	pnpm preview

check: ## 检查构建产物：断链 / SEO / RSS
	node scripts/check.mjs

smoke: ## 线上冒烟：关键路由与内容（~0.5 秒）
	pnpm smoke

gate: ## 内容门禁：字段 / 结构 / 已发布文章锁定
	pnpm gate

lock: ## 登记新文章到 content-lock.json
	pnpm lock

verify: ## 完整验证：门禁 + 构建 + 产物自检
	pnpm verify

clean: ## 清理构建产物
	rm -rf dist .astro
