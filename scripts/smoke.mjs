#!/usr/bin/env node
// 部署后冒烟检查：确认线上真的能打开、关键内容真的在。
//
//   node scripts/smoke.mjs                        # 检查线上站点
//   node scripts/smoke.mjs --base=http://127.0.0.1:4321   # 检查本地预览
//   SMOKE_BASE_URL=... node scripts/smoke.mjs
//
// 零依赖，只用 Node 内置 fetch。CI 在 deploy 之后自动跑（见 deploy.yml）。

import { readFile } from 'node:fs/promises';

const BASE = (
	process.argv.find((arg) => arg.startsWith('--base='))?.split('=')[1] ??
	process.env.SMOKE_BASE_URL ??
	'https://xiongxiaoming513.github.io'
).replace(/\/$/, '');

const TIMEOUT_MS = 15_000;
const RETRIES = 2;
const C = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	bold: '\x1b[1m',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(path) {
	let lastError;
	for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
		try {
			const response = await fetch(`${BASE}${path}`, {
				signal: AbortSignal.timeout(TIMEOUT_MS),
				redirect: 'follow',
				headers: { 'user-agent': 'blog-smoke/1.0' },
			});
			return { status: response.status, text: await response.text() };
		} catch (error) {
			lastError = error;
			if (attempt < RETRIES) await sleep(1500);
		}
	}
	throw lastError;
}

// 从源码里取标题与 tagline，避免检查逻辑和内容脱节
const consts = await readFile('src/consts.ts', 'utf8');
const pick = (key) => consts.match(new RegExp(`${key}:\\s*'([^']+)'`))?.[1];
const siteTitle = pick('title');
const tagline = pick('tagline');

const lock = JSON.parse(await readFile('content-lock.json', 'utf8'));
const posts = Object.entries(lock.posts ?? {});
const expectedItems = posts.length;
const [latestSlug, latestMeta] = posts.sort((a, b) => (a[1].pubDate < b[1].pubDate ? 1 : -1))[0];

const checks = [
	{
		name: '首页',
		path: '/',
		status: 200,
		contains: [siteTitle, tagline, `rel="canonical" href="${BASE}/"`],
	},
	{ name: '文章列表', path: '/blog/', status: 200, contains: ['文章'] },
	{ name: '归档页', path: '/archive/', status: 200, contains: ['归档', '2026'] },
	{
		name: `最新文章（${latestSlug}）`,
		path: `/blog/${latestSlug}/`,
		status: 200,
		contains: [latestMeta.title],
	},
	{
		name: `RSS（${expectedItems} 篇）`,
		path: '/rss.xml',
		status: 200,
		validate: (text) => {
			const items = (text.match(/<item>/g) ?? []).length;
			return items === expectedItems ? null : `RSS 条目数 ${items}，预期 ${expectedItems}`;
		},
	},
	{ name: 'Sitemap', path: '/sitemap-index.xml', status: 200, contains: ['sitemapindex'] },
	{ name: '404 页面', path: '/__smoke_should_not_exist__/', status: 404 },
];

async function runCheck(check) {
	const startedAt = Date.now();
	try {
		const { status, text } = await fetchText(check.path);
		const elapsed = Date.now() - startedAt;
		const problems = [];

		if (check.status && status !== check.status) {
			problems.push(`状态码 ${status}，预期 ${check.status}`);
		}
		for (const needle of check.contains ?? []) {
			if (!text.includes(needle)) problems.push(`缺少内容「${needle}」`);
		}
		if (check.validate) {
			const problem = check.validate(text);
			if (problem) problems.push(problem);
		}

		return { ...check, elapsed, problems };
	} catch (error) {
		return {
			...check,
			elapsed: Date.now() - startedAt,
			problems: [`请求失败：${error?.message ?? error}`],
		};
	}
}

console.log(`${C.dim}[smoke]${C.reset} 目标 ${C.bold}${BASE}${C.reset}`);
const startedAt = Date.now();
const results = await Promise.all(checks.map(runCheck));
const total = Date.now() - startedAt;

let failed = 0;
for (const result of results) {
	if (result.problems.length === 0) {
		console.log(`  ${C.green}✓${C.reset} ${result.name.padEnd(22)} ${C.dim}${result.elapsed}ms${C.reset}`);
	} else {
		failed += 1;
		console.log(`  ${C.red}✗${C.reset} ${result.name}`);
		for (const problem of result.problems) console.log(`      ${problem}`);
	}
}

if (failed > 0) {
	console.log(`\n[smoke] ${C.red}失败：${failed}/${results.length} 项未通过${C.reset}（总耗时 ${total}ms）`);
	process.exit(1);
}

console.log(`\n[smoke] ${C.green}通过 ${results.length}/${results.length}${C.reset}（总耗时 ${total}ms）`);
