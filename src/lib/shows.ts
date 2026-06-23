/**
 * 「动态展示 (Show)」数据访问层 —— 配套 migration 0006 的 shows 表。
 *
 * 一个 show = owner 从自己已发布的 photos 里选 N 张 + 一种 layout
 * (coverflow/cards/snap),拿到一个独立可分享的 URL。
 *
 * 强度边界:荣誉系统,客户端调用时不验 ownership;ownership 在 UI 层
 * 通过 session.phone 算完整 hash → 比对 show.ownerHash 完整 64 字符。
 */

import siteConfig from '../../site.config.mjs';

const cfg = siteConfig.supabase;

export type ShowLayout = 'coverflow' | 'cards' | 'snap';

export interface Show {
	id: string;
	ownerHash: string;
	artistSlug: string;
	title: string;
	layout: ShowLayout;
	photoIds: string[];
	createdAt: string;
}

interface ShowRow {
	id: string;
	owner_hash: string;
	artist_slug: string;
	title: string;
	layout: ShowLayout;
	photo_ids: string[];
	created_at: string;
}

function rowToShow(r: ShowRow): Show {
	return {
		id: r.id,
		ownerHash: r.owner_hash,
		artistSlug: r.artist_slug,
		title: r.title || '',
		layout: r.layout,
		photoIds: r.photo_ids || [],
		createdAt: r.created_at,
	};
}

const SB_HEADERS = {
	apikey: cfg.anonKey,
	Authorization: `Bearer ${cfg.anonKey}`,
};

/**
 * 拉某位艺术家的所有 shows(按创建倒序),给画廊页头部 chip 列表用。
 * 访客也能查 —— shows 表 SELECT policy 给了 anon。
 */
export async function listShows(opts: {
	ownerHash: string;
	artistSlug: string;
}): Promise<Show[]> {
	if (!opts.ownerHash || !opts.artistSlug) return [];
	const url = new URL(`${cfg.url}/rest/v1/shows`);
	url.searchParams.set('owner_hash', `eq.${opts.ownerHash}`);
	url.searchParams.set('artist_slug', `eq.${opts.artistSlug}`);
	url.searchParams.set('order', 'created_at.desc');
	url.searchParams.set('select', 'id,owner_hash,artist_slug,title,layout,photo_ids,created_at');
	const res = await fetch(url, { headers: SB_HEADERS });
	if (!res.ok) {
		console.warn('[supabase] listShows failed:', res.status);
		return [];
	}
	const rows = (await res.json()) as ShowRow[];
	return Array.isArray(rows) ? rows.map(rowToShow) : [];
}

/** 拉单个 show,给 show 页用 */
export async function getShow(showId: string): Promise<Show | null> {
	if (!showId) return null;
	const url = new URL(`${cfg.url}/rest/v1/shows`);
	url.searchParams.set('id', `eq.${showId}`);
	url.searchParams.set('select', 'id,owner_hash,artist_slug,title,layout,photo_ids,created_at');
	url.searchParams.set('limit', '1');
	const res = await fetch(url, { headers: SB_HEADERS });
	if (!res.ok) return null;
	const rows = (await res.json()) as ShowRow[];
	if (!Array.isArray(rows) || rows.length === 0) return null;
	return rowToShow(rows[0]);
}

/**
 * 创建一个 show。photoIds 数组顺序决定展示先后。
 * 返回新 show 的 id,调用方拼 URL 跳转。
 */
export async function createShow(input: {
	ownerHash: string;
	artistSlug: string;
	title: string;
	layout: ShowLayout;
	photoIds: string[];
}): Promise<string> {
	if (!input.ownerHash) throw new Error('ownerHash 必填');
	if (!input.artistSlug) throw new Error('artistSlug 必填');
	if (!input.layout) throw new Error('layout 必填');
	if (!input.photoIds.length) throw new Error('至少选一张图');

	const res = await fetch(`${cfg.url}/rest/v1/shows`, {
		method: 'POST',
		headers: {
			...SB_HEADERS,
			'Content-Type': 'application/json',
			Prefer: 'return=representation',
		},
		body: JSON.stringify({
			owner_hash: input.ownerHash,
			artist_slug: input.artistSlug,
			title: input.title || '',
			layout: input.layout,
			photo_ids: input.photoIds,
		}),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`createShow 失败 HTTP ${res.status}: ${body.slice(0, 200)}`);
	}
	const rows = (await res.json()) as ShowRow[];
	if (!Array.isArray(rows) || rows.length === 0) {
		throw new Error('createShow: 服务端没返回新行(RLS?)');
	}
	return rows[0].id;
}

/**
 * 删除一个 show。RLS 不验 ownership,**调用方必须在 UI 层确认是 owner**
 * 才调本函数。.select() 拿回行用来检测 DELETE 是否真生效。
 */
export async function deleteShow(showId: string): Promise<void> {
	if (!showId) throw new Error('showId 必填');
	const res = await fetch(
		`${cfg.url}/rest/v1/shows?id=eq.${encodeURIComponent(showId)}&select=id`,
		{
			method: 'DELETE',
			headers: { ...SB_HEADERS, Prefer: 'return=representation' },
		},
	);
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`deleteShow 失败 HTTP ${res.status}: ${body.slice(0, 200)}`);
	}
	const rows = await res.json().catch(() => []);
	if (!Array.isArray(rows) || rows.length === 0) {
		throw new Error('deleteShow: 0 行受影响(RLS 未放行?跑 migration 0006)');
	}
}
