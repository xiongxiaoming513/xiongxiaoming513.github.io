import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** 按发布时间倒序，过滤草稿 */
export async function getSortedPosts(): Promise<Post[]> {
	const posts = await getCollection('blog', ({ data }) => !data.draft);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** 粗略估算阅读时长：中文按 350 字/分钟，英文按 200 词/分钟 */
export function readingTime(body = ''): number {
	const text = body
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/[#>*_`|~-]/g, ' ');

	const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
	const latin = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;

	return Math.max(1, Math.round(cjk / 350 + latin / 200));
}

/** 收集全部标签及出现次数，按次数倒序 */
export async function getTags(): Promise<{ tag: string; count: number }[]> {
	const posts = await getSortedPosts();
	const counts = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.data.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
}
