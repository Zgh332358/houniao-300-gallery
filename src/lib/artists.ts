/**
 * 艺术家数据访问层 — 配套迁移 0001 的 artists 表 + artists_public 视图。
 *
 * 设计要点(对齐 Spec §3 / §4):
 *  - artists 表的 contact 列只通过写入路径出现(upsertArtist),不进任何匿名读路径
 *  - 匿名读取走 artists_public 视图(剥离 contact)
 *  - 匿名写入路径(INSERT/UPDATE)允许填 contact —— Supabase RLS 不限列写,
 *    所以这一层在客户端是可信的:艺术家自己提交自己的信息,我们存,但读出来的
 *    匿名 SELECT 都看不到 contact。
 *
 * mock 模式: localStorage 'pf:mock-artists:v1',结构与 live 一致;contact 字段
 * 仅在本机存,跨设备不同步。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import siteConfig from '../../site.config.mjs';

const cfg = siteConfig.supabase;

/** 公开视图返回 — 不含 contact */
export interface Artist {
	slug: string;
	name: string;
	bio: string;
	createdAt: string;
}

/** 写入路径载荷 — 含 contact(本地或后端持久化,不公开) */
export interface ArtistUpsertInput {
	slug: string;
	name: string;
	contact: string;
	bio?: string;
	/** 客户端 hash 后的手机号(SHA-256),用于绑定登录身份。
	 *  纯 INSERT 时写入;表上 unique 索引 (where phone_hash is not null) 防撞 */
	phoneHash?: string;
}

/* ---------- 配置 / 模式 ---------- */

function isLive(): boolean {
	return (
		!!cfg.url &&
		!cfg.url.startsWith('YOUR_') &&
		!!cfg.anonKey &&
		!cfg.anonKey.startsWith('YOUR_')
	);
}

let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
	if (!_client) {
		_client = createClient(cfg.url, cfg.anonKey, {
			auth: { persistSession: false },
		});
	}
	return _client;
}

/* ---------- 行 → 实体 ---------- */

interface ArtistRow {
	slug: string;
	name: string;
	bio: string | null;
	created_at: string;
}

function rowToArtist(row: ArtistRow): Artist {
	return {
		slug: row.slug,
		name: row.name,
		bio: row.bio || '',
		createdAt: row.created_at,
	};
}

/* ---------- mock store ---------- */

const MOCK_KEY = 'pf:mock-artists:v1';

interface MockArtistRecord extends Artist {
	/** mock-only: 包含 contact;live 模式下 contact 永远在浏览器外 */
	contact: string;
}

function getMockStore(): Record<string, MockArtistRecord> {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(MOCK_KEY);
		if (!raw) return {};
		const obj = JSON.parse(raw);
		return obj && typeof obj === 'object' ? obj : {};
	} catch {
		return {};
	}
}

function saveMockStore(store: Record<string, MockArtistRecord>) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(MOCK_KEY, JSON.stringify(store));
	} catch {
		/* 配额满了就放弃 */
	}
}

/* ---------- 读 ---------- */

export async function getArtist(slug: string): Promise<Artist | null> {
	if (!slug) return null;
	if (!isLive()) {
		const store = getMockStore();
		const rec = store[slug];
		if (!rec) return null;
		const { contact: _omit, ...publicFields } = rec;
		return publicFields;
	}
	const sb = getClient();
	const { data, error } = await sb
		.from('artists_public')
		.select('slug,name,bio,created_at')
		.eq('slug', slug)
		.maybeSingle();
	if (error) {
		console.error('[supabase] getArtist failed:', error);
		return null;
	}
	return data ? rowToArtist(data as ArtistRow) : null;
}

export async function listArtists(): Promise<Artist[]> {
	if (!isLive()) {
		return Object.values(getMockStore()).map((r) => {
			const { contact: _omit, ...rest } = r;
			return rest;
		});
	}
	const sb = getClient();
	const { data, error } = await sb
		.from('artists_public')
		.select('slug,name,bio,created_at')
		.order('created_at', { ascending: false });
	if (error) {
		console.error('[supabase] listArtists failed:', error);
		return [];
	}
	return ((data || []) as ArtistRow[]).map(rowToArtist);
}

/* ---------- 写 ---------- */

/**
 * 创建艺术家档案 —— 纯 INSERT。anon UPDATE artists 实际被 RLS 静默拒(0001
 * 写过 update policy 但实际没生效,见早先诊断),所以这里不做 upsert 语义。
 *
 * - slug 是 PK:已存在 → 抛 'slug 已被占用'(供登录页 / identity 步提示用户换 slug)
 * - phone_hash 是部分 unique 索引:已被其它 slug 用过 → 抛 'phone 已绑定别的 slug'
 *   (理论上登录流程已经在前面查过 phone_hash,正常注册不该撞这条 —— 撞了多半
 *    是用户同时开了两个 tab 注册两个不同 slug)
 *
 * contact 写入但永远不会从匿名读取路径返回。
 */
export async function createArtist(input: ArtistUpsertInput): Promise<void> {
	if (!input.slug || !input.name) throw new Error('slug 与 name 必填');
	if (!isLive()) {
		const store = getMockStore();
		if (store[input.slug]) throw new Error('slug 已被占用');
		store[input.slug] = {
			slug: input.slug,
			name: input.name,
			bio: input.bio || '',
			contact: input.contact,
			createdAt: new Date().toISOString(),
		};
		saveMockStore(store);
		return;
	}
	const row: Record<string, unknown> = {
		slug: input.slug,
		name: input.name,
		bio: input.bio ?? '',
		contact: input.contact,
	};
	if (input.phoneHash) row.phone_hash = input.phoneHash;

	// 用裸 fetch 而非 supabase-js,这样能拿到 HTTP 状态码 + Postgres 错误码,
	// 区分 23505(slug 已存在/phone 已绑) vs 别的 RLS / 网络错误。
	const res = await fetch(`${cfg.url}/rest/v1/artists`, {
		method: 'POST',
		headers: {
			apikey: cfg.anonKey,
			Authorization: `Bearer ${cfg.anonKey}`,
			'Content-Type': 'application/json',
			Prefer: 'return=minimal',
		},
		body: JSON.stringify(row),
	});
	if (res.ok) return;

	let code = '';
	let message = `HTTP ${res.status}`;
	try {
		const j = await res.json();
		code = j?.code || '';
		message = j?.message || message;
	} catch {
		/* keep */
	}
	if (code === '23505') {
		// unique 冲突;靠错误 details 文案分辨是哪个唯一键
		if (message.includes('phone_hash')) {
			throw new Error('这个手机号已经绑过别的 slug 了 —— 回登录页重新走');
		}
		throw new Error('这个 slug 已经被别人用了 —— 换一个');
	}
	throw new Error(`createArtist 失败: ${message}`);
}

/**
 * 登录用:根据客户端 hash 查 artists_login_lookup 视图。
 * 命中返回 {slug, name},未命中返回 null(对应"首次注册"流程)。
 *
 * 视图只暴露 (slug, name, phone_hash) —— 拿不到 contact / bio 这些。
 */
export async function findArtistByPhoneHash(
	hash: string,
): Promise<{ slug: string; name: string } | null> {
	if (!hash) return null;
	if (!isLive()) {
		// mock: 我们没存 phone_hash,登录流程在 mock 模式下不工作。
		// 返回 null 让上层进"首次注册"流程,但 createArtist 也只写 mock store,
		// 下次再来还是命中不到。仅用于本地无 Supabase 时跑通 UI,不模拟真登录。
		return null;
	}
	const sb = getClient();
	const { data, error } = await sb
		.from('artists_login_lookup')
		.select('slug,name')
		.eq('phone_hash', hash)
		.maybeSingle();
	if (error) {
		console.error('[supabase] findArtistByPhoneHash failed:', error);
		return null;
	}
	return data ? { slug: data.slug, name: data.name } : null;
}
