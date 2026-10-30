// TODO: 换成你的站点名、名字、域名与链接
// 注意：改了 url 后，请同步修改 astro.config.mjs 里的 site 字段

export const SITE = {
	title: '晓明 · 笔记',
	shortTitle: '晓明',
	description: '关于产品、工程与 AI 的长期笔记。写慢一点，写久一点。',
	author: '晓明',
	email: 'hello@example.com',
	url: 'https://example.com',
	lang: 'zh-CN',
	locale: 'zh_CN',
	tagline: '写代码，也写字。记录那些想清楚了的事。',
	social: [
		{ label: 'GitHub', href: 'https://github.com/' },
		{ label: 'X', href: 'https://x.com/' },
		{ label: 'RSS', href: '/rss.xml' },
	],
	nav: [
		{ label: '文章', href: '/blog/' },
		{ label: '标签', href: '/tags/' },
		{ label: '关于', href: '/about/' },
	],
} as const;

export const SITE_TITLE = SITE.title;
export const SITE_DESCRIPTION = SITE.description;
