/**
 * 艺术家数据访问层 — 配套迁移 0001 的 artists 表 + artists_public 视图。
 *
 * 设计要点(对齐 Spec §3 / §4):
 *  - artists 表的 contact 列只通过写入路径出现(upsertArtist),不进任何匿名读路径
 *  - 匿名读取走 artists_public 视图(剥离 contact)
 *  - 匿名写入路径(INSERT/UPDATE)允许填 contact —— Supabase RLS 不限列写,
 *    所以这一层在客户端是可信的:艺术家自己提交自己的信息,我们存,但读出来的
 *    匿名 SELECT 都看不到 contact。
 *  - 声音克隆相关字段(voice_id, voice_sample_path, consent_at)通过 setArtistVoice
 *    单独写。consent_at 必须由调用方传入,不允许默认 now() —— 强制调用方在 UI
 *    上勾选授权后再调本函数。
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
	voiceId: string | null;
	voiceSamplePath: string | null;
	consentAt: string | null;
	createdAt: string;
}

/** 写入路径载荷 — 含 contact(本地或后端持久化,不公开) */
export interface ArtistUpsertInput {
	slug: string;
	name: string;
	contact: string;
	bio?: string;
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
	voice_id: string | null;
	voice_sample_path: string | null;
	consent_at: string | null;
	created_at: string;
}

function rowToArtist(row: ArtistRow): Artist {
	return {
		slug: row.slug,
		name: row.name,
		bio: row.bio || '',
		voiceId: row.voice_id,
		voiceSamplePath: row.voice_sample_path,
		consentAt: row.consent_at,
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
		.select('slug,name,bio,voice_id,voice_sample_path,consent_at,created_at')
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
		.select('slug,name,bio,voice_id,voice_sample_path,consent_at,created_at')
		.order('created_at', { ascending: false });
	if (error) {
		console.error('[supabase] listArtists failed:', error);
		return [];
	}
	return ((data || []) as ArtistRow[]).map(rowToArtist);
}

/* ---------- 写 ---------- */

/**
 * 创建或更新艺术家档案。Supabase 端依赖 artists.slug 是 PK 做 UPSERT。
 * contact 写入但永远不会从匿名读取路径返回。
 */
export async function upsertArtist(input: ArtistUpsertInput): Promise<void> {
	if (!input.slug || !input.name) throw new Error('slug 与 name 必填');
	if (!isLive()) {
		const store = getMockStore();
		const existing = store[input.slug];
		store[input.slug] = {
			slug: input.slug,
			name: input.name,
			bio: input.bio || existing?.bio || '',
			contact: input.contact,
			voiceId: existing?.voiceId ?? null,
			voiceSamplePath: existing?.voiceSamplePath ?? null,
			consentAt: existing?.consentAt ?? null,
			createdAt: existing?.createdAt ?? new Date().toISOString(),
		};
		saveMockStore(store);
		return;
	}
	const sb = getClient();
	const { error } = await sb
		.from('artists')
		.upsert(
			{
				slug: input.slug,
				name: input.name,
				bio: input.bio ?? '',
				contact: input.contact,
			},
			{ onConflict: 'slug' },
		);
	if (error) throw new Error(`upsertArtist 失败: ${error.message}`);
}

/**
 * 设置艺术家的克隆音色。**调用方必须先在 UI 勾选「我授权克隆我的声音」**,
 * 才传入 `consentedAt`。本函数不会自己生成时间戳,避免 UI 漏掉勾选时静默通过。
 */
export async function setArtistVoice(input: {
	slug: string;
	voiceId: string;
	voiceSamplePath: string;
	consentedAt: string;
}): Promise<void> {
	if (!input.slug || !input.voiceId || !input.consentedAt) {
		throw new Error('slug/voiceId/consentedAt 必填');
	}
	if (!isLive()) {
		const store = getMockStore();
		const existing = store[input.slug];
		if (!existing) throw new Error(`mock: artist ${input.slug} 不存在,先 upsertArtist`);
		existing.voiceId = input.voiceId;
		existing.voiceSamplePath = input.voiceSamplePath;
		existing.consentAt = input.consentedAt;
		saveMockStore(store);
		return;
	}
	const sb = getClient();
	const { error } = await sb
		.from('artists')
		.update({
			voice_id: input.voiceId,
			voice_sample_path: input.voiceSamplePath,
			consent_at: input.consentedAt,
		})
		.eq('slug', input.slug);
	if (error) throw new Error(`setArtistVoice 失败: ${error.message}`);
}
