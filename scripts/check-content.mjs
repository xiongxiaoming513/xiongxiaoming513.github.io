#!/usr/bin/env node
// 内容门禁：把 AGENTS.md 里的规则变成会失败的检查。
//
//   node scripts/check-content.mjs                 # 检查（CI / make gate 用）
//   node scripts/check-content.mjs --update-lock   # 登记新文章 / 确认有意的变更
//
// 检查项：
//   1. frontmatter 必填字段、日期格式、标签格式
//   2. 正文至少有一个二级标题（否则文章页目录不显示）
//   3. 已发布文章的 slug 与 pubDate 被 content-lock.json 锁定，改了直接失败
//   4. 标题长度、摘要长度、未标注语言的代码块、外链图片（警告）
//
// 零依赖。

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const POSTS_DIR = path.resolve('src/content/blog');
const LOCK_PATH = path.resolve('content-lock.json');
const UPDATE_LOCK = process.argv.includes('--update-lock');

const errors = [];
const warnings = [];
const C = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	bold: '\x1b[1m',
};

const fail = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

// ── 极简 frontmatter 解析（只支持本项目用到的 YAML 子集）─────────
function parseFrontmatter(raw) {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { data: {}, body: raw };

	const data = {};
	for (const line of match[1].split(/\r?\n/)) {
		const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
		if (!m) continue;
		const [, key, rawValue] = m;
		let value = rawValue.trim();

		if (value === '') {
			data[key] = '';
		} else if (value.startsWith('[')) {
			try {
				data[key] = JSON.parse(value);
			} catch {
				data[key] = value;
			}
		} else if (value === 'true' || value === 'false') {
			data[key] = value === 'true';
		} else {
			value = value.replace(/^["']|["']$/g, '');
			data[key] = value;
		}
	}

	return { data, body: raw.slice(match[0].length) };
}

function isValidDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00+08:00`);
	return !Number.isNaN(date.getTime());
}

async function loadPosts() {
	const files = (await readdir(POSTS_DIR)).filter((f) => f.endsWith('.md')).sort();
	const posts = [];

	for (const file of files) {
		const raw = await readFile(path.join(POSTS_DIR, file), 'utf8');
		const { data, body } = parseFrontmatter(raw);
		posts.push({ file, slug: file.replace(/\.md$/, ''), data, body });
	}

	return posts;
}

function validatePost(post) {
	const { file, data, body } = post;

	if (!data.title || typeof data.title !== 'string') {
		fail(file, '缺少 frontmatter 字段 title');
	} else if (data.title.length > 30) {
		warn(file, `标题 ${data.title.length} 字，超过 30 字（列表页会挤）`);
	}

	if (!data.description || typeof data.description !== 'string') {
		fail(file, '缺少 frontmatter 字段 description（会出现在列表页和 RSS）');
	} else if (data.description.length > 80) {
		warn(file, `摘要 ${data.description.length} 字，超过 80 字`);
	}

	if (!data.pubDate) {
		fail(file, '缺少 frontmatter 字段 pubDate');
	} else if (!isValidDate(data.pubDate)) {
		fail(file, `pubDate 格式应为 YYYY-MM-DD，当前是「${data.pubDate}」`);
	}

	if (data.tags !== undefined && !Array.isArray(data.tags)) {
		fail(file, 'tags 必须是数组，例如 tags: ["AI", "工程"]');
	}

	if (data.draft !== undefined && typeof data.draft !== 'boolean') {
		warn(file, 'draft 应为 true / false');
	}

	if (!/^##\s+\S/m.test(body)) {
		fail(file, '正文缺少二级标题（##），文章页目录会不显示');
	}

	// 用状态机数「未标注语言的代码块」，避免把结束围栏也算进去
	let inFence = false;
	let unlabeled = 0;
	for (const line of body.split(/\r?\n/)) {
		const fence = line.match(/^```(\S*)\s*$/);
		if (!fence) continue;
		if (inFence) {
			inFence = false;
		} else {
			inFence = true;
			if (fence[1] === '') unlabeled += 1;
		}
	}
	if (unlabeled > 0) {
		warn(file, `有 ${unlabeled} 个代码块未标注语言`);
	}

	if (/!\[[^\]]*\]\(https?:\/\//.test(body)) {
		warn(file, '文章中使用了外链图片，建议放 src/assets/ 本地引用');
	}
}

async function readLock() {
	if (!existsSync(LOCK_PATH)) return null;
	try {
		return JSON.parse(await readFile(LOCK_PATH, 'utf8'));
	} catch {
		fail('content-lock.json', '不是合法的 JSON');
		return null;
	}
}

function checkLock(posts, lock) {
	const published = posts.filter((post) => post.data.draft !== true);
	const current = new Map(published.map((post) => [post.slug, post.data]));

	if (UPDATE_LOCK) {
		const next = {
			version: 1,
			generatedAt: new Date().toISOString(),
			posts: Object.fromEntries(
				[...current.entries()]
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([slug, data]) => [slug, { title: data.title, pubDate: data.pubDate }]),
			),
		};
		return { next, added: 0 };
	}

	if (!lock) {
		warn('content-lock.json', '尚未生成，运行 `make lock` 登记已发布文章');
		return { next: null, added: 0 };
	}

	const locked = lock.posts ?? {};

	for (const [slug, meta] of Object.entries(locked)) {
		const post = current.get(slug);
		if (!post) {
			fail(
				`${slug}.md`,
				'已发布文章被删除或改了文件名（slug 即 URL）。确需如此，改完运行 make lock 并说明原因',
			);
			continue;
		}
		if (post.pubDate !== meta.pubDate) {
			fail(
				`${slug}.md`,
				`pubDate 从 ${meta.pubDate} 改成了 ${post.pubDate}，这会改变文章时间与 RSS 顺序（P0）`,
			);
		}
		if (post.title !== meta.title) {
			warn(`${slug}.md`, '标题被修改，RSS 里已发出去的文章对不上；确认无误后运行 make lock');
		}
	}

	const added = [...current.keys()].filter((slug) => !(slug in locked));
	for (const slug of added) {
		warn(`${slug}.md`, '新文章，尚未登记到 content-lock.json；确认无误后运行 make lock');
	}

	return { next: null, added: added.length };
}

async function main() {
	const posts = await loadPosts();
	if (posts.length === 0) {
		fail('src/content/blog', '没有找到任何文章');
	}

	for (const post of posts) validatePost(post);

	const titles = new Map();
	for (const post of posts) {
		const title = post.data.title;
		if (!title) continue;
		if (titles.has(title)) warn(post.file, `标题与 ${titles.get(title)} 重复`);
		else titles.set(title, post.file);
	}

	const lock = await readLock();
	const { next } = checkLock(posts, lock);

	const publishedCount = posts.filter((post) => post.data.draft !== true).length;
	console.log(`[gate] 检查 ${posts.length} 篇文章（已发布 ${publishedCount} 篇）`);

	if (UPDATE_LOCK && errors.length === 0 && next) {
		await writeFile(LOCK_PATH, `${JSON.stringify(next, null, '\t')}\n`, 'utf8');
		console.log(`[gate] ✅ 已更新 content-lock.json（${Object.keys(next.posts).length} 篇）`);
	}

	for (const message of warnings) console.log(`  ${C.yellow}⚠${C.reset}  ${message}`);
	for (const message of errors) console.log(`  ${C.red}✗${C.reset}  ${message}`);

	if (errors.length > 0) {
		console.log(`\n[gate] ❌ 失败：${errors.length} 个错误，${warnings.length} 个警告`);
		process.exit(1);
	}

	console.log(
		`\n[gate] ${C.green}✅ 通过${C.reset}（${warnings.length} 个警告）`,
	);
}

main().catch((error) => {
	console.error('[gate] 运行出错：', error);
	process.exit(1);
});
