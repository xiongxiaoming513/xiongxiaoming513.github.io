// 构建产物自检：内部链接、SEO 基础项、RSS
// 用法：pnpm build && node scripts/check.mjs

import { readdir, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const errors = [];
const warnings = [];

async function walk(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(full)));
		else files.push(full);
	}
	return files;
}

function resolveTarget(urlPath) {
	const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
	if (!clean || clean === '/') return path.join(DIST, 'index.html');

	const rel = clean.replace(/^\//, '');
	const candidates = [
		path.join(DIST, rel),
		path.join(DIST, rel, 'index.html'),
		path.join(DIST, `${rel}.html`),
	];

	return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

async function main() {
	if (!existsSync(DIST)) {
		console.error('[check] 找不到 dist/，请先运行 pnpm build');
		process.exit(1);
	}

	const files = await walk(DIST);
	const htmlFiles = files.filter((file) => file.endsWith('.html'));
	const internalLinks = new Set();
	let placeholderPages = 0;

	for (const file of htmlFiles) {
		const html = await readFile(file, 'utf8');
		const rel = path.relative(DIST, file);

		// 1. SEO 基础项
		if (!/<title>[^<]{1,}<\/title>/.test(html)) errors.push(`${rel}: 缺少 <title>`);
		if (!/<meta name="description" content="[^"]{1,}"/.test(html))
			errors.push(`${rel}: 缺少 meta description`);

		// 2. 收集内部链接
		for (const match of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
			const link = match[1];
			if (link.startsWith('//')) continue;
			internalLinks.add(link);
		}

		// 3. TODO 占位符提醒（只汇总一次，避免刷屏）
		if (html.includes('example.com')) placeholderPages += 1;
	}

	// 4. 校验内部链接
	for (const link of [...internalLinks].sort()) {
		if (link.startsWith('/_astro/')) continue;
		if (!resolveTarget(link)) errors.push(`断链：${link}`);
	}

	// 5. RSS
	const rssPath = path.join(DIST, 'rss.xml');
	if (!existsSync(rssPath)) {
		errors.push('缺少 rss.xml');
	} else {
		const rss = await readFile(rssPath, 'utf8');
		const items = (rss.match(/<item>/g) ?? []).length;
		if (items === 0) errors.push('rss.xml 没有任何文章');
		console.log(`[check] RSS: ${items} 篇`);
	}

	// 6. 报告
	console.log(`[check] 扫描 ${htmlFiles.length} 个页面，${internalLinks.size} 个内部链接`);
	if (placeholderPages > 0) {
		warnings.push(
			`${placeholderPages} 个页面仍使用占位域名 example.com —— 上线前请改 src/consts.ts 与 astro.config.mjs`,
		);
	}
	for (const warning of warnings) console.warn(`[warn] ${warning}`);
	for (const error of errors) console.error(`[error] ${error}`);

	if (errors.length > 0) {
		console.error(`\n[check] 失败：${errors.length} 个问题`);
		process.exit(1);
	}

	console.log('[check] 通过');
}

main();
