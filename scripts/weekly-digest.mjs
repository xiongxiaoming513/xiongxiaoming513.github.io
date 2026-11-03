#!/usr/bin/env node
// 每周摘要：把这一周的动静汇总成一段 Markdown。
//
//   node scripts/weekly-digest.mjs          # 打印到终端
//   node scripts/weekly-digest.mjs --write  # 写入 docs/weekly-log.md（最新在上）
//
// GitHub Actions 每周日 20:00（北京时间）自动执行。

import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const WRITE = process.argv.includes('--write');
const LOG_PATH = 'docs/weekly-log.md';
const SITE = 'https://xiongxiaoming513.github.io';
const DAY = 24 * 60 * 60 * 1000;

const git = (args) =>
	execFileSync('git', args, { encoding: 'utf8' }).trim();

// ── 时间范围：最近 7 天 ────────────────────────────────────────
const now = new Date();
const since = new Date(now.getTime() - 7 * DAY);
const fmt = (date) =>
	new Intl.DateTimeFormat('zh-CN', {
		month: '2-digit',
		day: '2-digit',
		timeZone: 'Asia/Shanghai',
	})
		.format(date)
		.replaceAll('/', '-');

function isoWeek(date) {
	const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNumber = target.getUTCDay() || 7;
	target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
	const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
	const week = Math.ceil(((target - yearStart) / DAY + 1) / 7);
	return { year: target.getUTCFullYear(), week: String(week).padStart(2, '0') };
}

const { year, week } = isoWeek(now);
const weekLabel = `${year}-W${week}`;
const sinceArg = `--since=${since.toISOString()}`;

// ── git 数据 ───────────────────────────────────────────────────
const commits = git(['log', sinceArg, '--pretty=format:%h\t%ad\t%s', '--date=format:%m-%d'])
	.split('\n')
	.filter(Boolean);

const filesInRange = (filter) =>
	[
		...new Set(
			git(['log', sinceArg, `--diff-filter=${filter}`, '--name-only', '--pretty=format:', '--', 'src/content/blog'])
				.split('\n')
				.filter((file) => file.endsWith('.md')),
		),
	];

const addedPosts = filesInRange('A');
const editedPosts = filesInRange('M');

// ── 内容统计 ───────────────────────────────────────────────────
const lock = JSON.parse(await readFile('content-lock.json', 'utf8'));
const published = Object.entries(lock.posts ?? {});
const latestPubDate = published.sort((a, b) => (a[1].pubDate < b[1].pubDate ? 1 : -1))[0]?.[1]?.pubDate;
const daysSinceLastPost = latestPubDate
	? Math.floor((now.getTime() - new Date(`${latestPubDate}T00:00:00+08:00`).getTime()) / DAY)
	: null;

const blogFiles = (await readdir('src/content/blog')).filter((file) => file.endsWith('.md'));
const drafts = [];
for (const file of blogFiles) {
	const raw = await readFile(`src/content/blog/${file}`, 'utf8');
	if (/^draft:\s*true\s*$/m.test(raw)) drafts.push(file.replace(/\.md$/, ''));
}

// ── 线上状态 ───────────────────────────────────────────────────
async function checkLive() {
	const startedAt = Date.now();
	try {
		const response = await fetch(`${SITE}/`, { signal: AbortSignal.timeout(10_000) });
		const html = await response.text();
		const ms = Date.now() - startedAt;
		const rss = await fetch(`${SITE}/rss.xml`, { signal: AbortSignal.timeout(10_000) });
		const rssText = await rss.text();
		const items = (rssText.match(/<item>/g) ?? []).length;
		return { ok: response.status === 200, status: response.status, ms, items, hasTitle: html.includes('晓明') };
	} catch (error) {
		return { ok: false, error: error?.message ?? String(error) };
	}
}

const live = await checkLive();

// ── 生成 Markdown ──────────────────────────────────────────────
const lines = [];
lines.push(`## ${weekLabel}（${fmt(since)} → ${fmt(now)}）`);
lines.push('');
lines.push('| 指标 | 本周 |');
lines.push('| --- | --- |');
lines.push(`| 提交 | ${commits.length} 次 |`);
lines.push(`| 新增文章 | ${addedPosts.length} 篇 |`);
lines.push(`| 更新文章 | ${editedPosts.length} 篇 |`);
lines.push(`| 累计文章 | ${published.length} 篇 |`);
lines.push(
	`| 线上状态 | ${live.ok ? `✅ ${live.status}（${live.ms}ms） · RSS ${live.items} 篇` : `❌ ${live.error ?? live.status}`} |`,
);
lines.push('');

if (commits.length > 0) {
	lines.push('**本周提交**');
	lines.push('');
	for (const line of commits.slice(0, 12)) {
		const [hash, date, ...rest] = line.split('\t');
		lines.push(`- \`${hash}\` ${date} ${rest.join(' ')}`);
	}
	if (commits.length > 12) lines.push(`- …另有 ${commits.length - 12} 次提交`);
	lines.push('');
}

if (addedPosts.length > 0) {
	lines.push('**新增文章**');
	lines.push('');
	for (const file of addedPosts) lines.push(`- [${file.replace(/^.*\//, '').replace(/\.md$/, '')}](${SITE}/blog/${file.replace(/^.*\//, '').replace(/\.md$/, '')}/)`);
	lines.push('');
}

if (editedPosts.length > 0) {
	lines.push('**更新文章**');
	lines.push('');
	for (const file of editedPosts) lines.push(`- ${file.replace(/^.*\//, '').replace(/\.md$/, '')}`);
	lines.push('');
}

lines.push('**提示**');
lines.push('');
lines.push(`- 距上一篇发布：${daysSinceLastPost === null ? '未知' : `${daysSinceLastPost} 天`}`);
lines.push(`- 草稿箱：${drafts.length > 0 ? drafts.join('、') : '空'}`);
if (commits.length === 0) lines.push('- 本周没有提交：要么在休息，要么该动笔了');

const digest = lines.join('\n');

// ── 输出 ──────────────────────────────────────────────────────
if (!WRITE) {
	console.log(digest);
	process.exit(0);
}

const HEADER = `# 每周摘要

> 由 GitHub Actions 每周日 20:00（北京时间）自动生成，最新在最上面。
> 手动生成：\`node scripts/weekly-digest.mjs --write\`

<!-- digest:start -->

<!-- digest:end -->
`;

const existing = existsSync(LOG_PATH) ? await readFile(LOG_PATH, 'utf8') : HEADER;

if (existing.includes(`## ${weekLabel}（`)) {
	console.log(`本周（${weekLabel}）摘要已存在，跳过写入`);
	process.exit(0);
}
const marker = '<!-- digest:start -->';
const insertAt = existing.indexOf(marker) + marker.length;
const next = `${existing.slice(0, insertAt)}\n\n${digest}\n${existing.slice(insertAt)}`;

await writeFile(LOG_PATH, next, 'utf8');
console.log(`已写入 ${LOG_PATH}`);
console.log('');
console.log(digest);
