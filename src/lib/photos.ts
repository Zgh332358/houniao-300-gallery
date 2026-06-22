/**
 * 照片数据访问层。两种模式：
 *
 * - **live**：连接 Supabase，photos 表 + photos bucket。
 *   - listAll() 走 PostgREST `SELECT * FROM photos ORDER BY created_at DESC`
 *   - uploadPhoto() 用 XHR 直传 Storage（带进度），再 INSERT 一行元数据
 *   - deliveryUrl() 返回 Storage 的 public URL
 *
 * - **mock**：未配置 Supabase 时启用，照片来自本文件内置 23 张种子 +
 *   localStorage 中的 mock 上传，不走任何网络。
 *
 * 模式由 site.config.mts 中的 supabase.url / anonKey 是否还是占位值决定。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pinyin } from 'pinyin-pro';
import siteConfig from '../../site.config.mjs';

const cfg = siteConfig.supabase;

export type Mode = 'live' | 'mock';

export interface PhotoMeta {
	artistName: string;
	collectionName: string;
	title: string;
	/** 英文标题(里程碑 E 起由 AI 双语生成) */
	titleEn?: string;
	description: string;
	/** 英文描述(里程碑 E 起由 AI 双语生成) */
	descriptionEn?: string;
}

/** 五维标签(里程碑 E 起由 AI 一次性生成) */
export interface PhotoTags {
	theme?: string;
	style?: string;
	medium?: string;
	palette?: string;
	mood?: string;
}

/** 内容审核结果(里程碑 E 起由 AI 同步返回,门控发布) */
export interface PhotoModeration {
	safe?: boolean;
	reason?: string;
	categories?: string[];
}

export interface PhotoEntry {
	id: string;
	width: number;
	height: number;
	format: string;
	createdAt: string;
	artistSlug: string;
	collectionSlug: string;
	storagePath: string;
	meta: PhotoMeta;
	/** 五维标签(里程碑 E) */
	tags?: PhotoTags;
	/** 策展短评(里程碑 E) */
	curatorNote?: string;
	/** AI 解说词原文(里程碑 D) */
	narrationText?: string;
	/** 解说 mp3 在 audio bucket 的路径(里程碑 D) */
	narrationPath?: string;
	/** 内容审核结果(里程碑 E) */
	moderation?: PhotoModeration;
	/** mock-only：picsum seed 占位图 */
	mockSeed?: string;
	/** mock-only：用户上传的真实文件 base64（小文件） */
	dataUrl?: string;
}

export interface ArtistSummary {
	slug: string;
	name: string;
	coverPhoto: PhotoEntry;
	photoCount: number;
}

export interface CollectionSummary {
	slug: string;
	name: string;
	photos: PhotoEntry[];
}

/* ---------- 配置 / 模式 ---------- */

export function isSupabaseConfigured(): boolean {
	return (
		!!cfg.url &&
		!cfg.url.startsWith('YOUR_') &&
		!!cfg.anonKey &&
		!cfg.anonKey.startsWith('YOUR_')
	);
}

export function getMode(): Mode {
	return isSupabaseConfigured() ? 'live' : 'mock';
}

export function getSupabaseConfig() {
	return cfg;
}

/* ---------- Supabase 客户端 (lazy) ---------- */

let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
	if (!_client) {
		_client = createClient(cfg.url, cfg.anonKey, {
			auth: { persistSession: false },
		});
	}
	return _client;
}

/* ---------- slug 工具 ---------- */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,49}$/;

export function isValidSlug(s: string): boolean {
	return SLUG_RE.test(s);
}

export function toSlug(input: string): string {
	if (!input) return `user-${Date.now().toString(36).slice(-6)}`;

	// 中文先转拼音（不含声调），再做 slug 化
	const ascii = pinyin(input, {
		toneType: 'none',
		type: 'array',
		nonZh: 'consecutive', // 非中文字符保留为连续字符串而非按字符拆分
	}).join('-');

	const normalized = ascii
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	return normalized || `user-${Date.now().toString(36).slice(-6)}`;
}

/* ---------- mock 数据 ---------- */

function mockPhoto(opts: {
	seed: string;
	dim: { w: number; h: number };
	artistSlug: string;
	artistName: string;
	collSlug: string;
	collName: string;
	title: string;
	desc?: string;
	daysAgo: number;
}): PhotoEntry {
	return {
		id: `mock-${opts.seed}`,
		width: opts.dim.w,
		height: opts.dim.h,
		format: 'jpg',
		createdAt: new Date(Date.UTC(2026, 5, 11) - opts.daysAgo * 86400_000).toISOString(),
		artistSlug: opts.artistSlug,
		collectionSlug: opts.collSlug,
		storagePath: '',
		meta: {
			artistName: opts.artistName,
			collectionName: opts.collName,
			title: opts.title,
			description: opts.desc ?? '',
		},
		mockSeed: opts.seed,
	};
}

const D_LANDSCAPE = { w: 1500, h: 1000 };
const D_PORTRAIT = { w: 1000, h: 1500 };
const D_WIDE = { w: 1800, h: 1100 };
const D_SQUARE = { w: 1200, h: 1200 };
const D_TALL = { w: 900, h: 1350 };

const MOCK_SEED_PHOTOS: PhotoEntry[] = [
	// 候鸟驻地·艺术家 01 / artist-01
	mockPhoto({ seed: 'a01-1', dim: D_LANDSCAPE, artistSlug: 'artist-01', artistName: '艺术家 01', collSlug: 'night-street', collName: '夜色街拍', title: '雨夜霓虹', desc: '示例占位 · 候鸟驻地参展作品', daysAgo: 1 }),
	mockPhoto({ seed: 'a01-2', dim: D_PORTRAIT, artistSlug: 'artist-01', artistName: '艺术家 01', collSlug: 'night-street', collName: '夜色街拍', title: '便利店窗外', daysAgo: 2 }),
	mockPhoto({ seed: 'a01-3', dim: D_WIDE, artistSlug: 'artist-01', artistName: '艺术家 01', collSlug: 'night-street', collName: '夜色街拍', title: '弄堂深处', daysAgo: 3 }),
	mockPhoto({ seed: 'a01-4', dim: D_SQUARE, artistSlug: 'artist-01', artistName: '艺术家 01', collSlug: 'night-street', collName: '夜色街拍', title: '地铁口', daysAgo: 4 }),
	mockPhoto({ seed: 'a01-5', dim: D_LANDSCAPE, artistSlug: 'artist-01', artistName: '艺术家 01', collSlug: 'night-street', collName: '夜色街拍', title: '出租车', daysAgo: 5 }),
	mockPhoto({ seed: 'a01-6', dim: D_LANDSCAPE, artistSlug: 'artist-01', artistName: '艺术家 01', collSlug: 'mountain', collName: '山景', title: '高原', desc: '示例占位', daysAgo: 12 }),
	mockPhoto({ seed: 'a01-7', dim: D_WIDE, artistSlug: 'artist-01', artistName: '艺术家 01', collSlug: 'mountain', collName: '山景', title: '云海日出', daysAgo: 14 }),
	mockPhoto({ seed: 'a01-8', dim: D_PORTRAIT, artistSlug: 'artist-01', artistName: '艺术家 01', collSlug: 'mountain', collName: '山景', title: '雪线之上', daysAgo: 16 }),

	// 候鸟驻地·艺术家 02 / artist-02
	mockPhoto({ seed: 'a02-1', dim: D_PORTRAIT, artistSlug: 'artist-02', artistName: '艺术家 02', collSlug: 'portrait', collName: '人像', title: '阳台午后', daysAgo: 6 }),
	mockPhoto({ seed: 'a02-2', dim: D_TALL, artistSlug: 'artist-02', artistName: '艺术家 02', collSlug: 'portrait', collName: '人像', title: '镜中', daysAgo: 7 }),
	mockPhoto({ seed: 'a02-3', dim: D_PORTRAIT, artistSlug: 'artist-02', artistName: '艺术家 02', collSlug: 'portrait', collName: '人像', title: '咖啡馆', desc: '示例占位 · 35mm', daysAgo: 8 }),
	mockPhoto({ seed: 'a02-4', dim: D_SQUARE, artistSlug: 'artist-02', artistName: '艺术家 02', collSlug: 'portrait', collName: '人像', title: '初见', daysAgo: 9 }),
	mockPhoto({ seed: 'a02-5', dim: D_LANDSCAPE, artistSlug: 'artist-02', artistName: '艺术家 02', collSlug: 'travel', collName: '旅行', title: '清水寺', daysAgo: 18 }),
	mockPhoto({ seed: 'a02-6', dim: D_WIDE, artistSlug: 'artist-02', artistName: '艺术家 02', collSlug: 'travel', collName: '旅行', title: '电车', daysAgo: 20 }),
	mockPhoto({ seed: 'a02-7', dim: D_LANDSCAPE, artistSlug: 'artist-02', artistName: '艺术家 02', collSlug: 'travel', collName: '旅行', title: '黑沙滩', daysAgo: 22 }),
	mockPhoto({ seed: 'a02-8', dim: D_PORTRAIT, artistSlug: 'artist-02', artistName: '艺术家 02', collSlug: 'travel', collName: '旅行', title: '集市', daysAgo: 24 }),

	// 候鸟驻地·艺术家 03 / artist-03
	mockPhoto({ seed: 'a03-1', dim: D_SQUARE, artistSlug: 'artist-03', artistName: '艺术家 03', collSlug: 'abstract', collName: '抽象', title: '光的研究 #03', daysAgo: 10 }),
	mockPhoto({ seed: 'a03-2', dim: D_LANDSCAPE, artistSlug: 'artist-03', artistName: '艺术家 03', collSlug: 'abstract', collName: '抽象', title: '光的研究 #07', daysAgo: 11 }),
	mockPhoto({ seed: 'a03-3', dim: D_PORTRAIT, artistSlug: 'artist-03', artistName: '艺术家 03', collSlug: 'abstract', collName: '抽象', title: '反射 12', daysAgo: 13 }),
	mockPhoto({ seed: 'a03-4', dim: D_WIDE, artistSlug: 'artist-03', artistName: '艺术家 03', collSlug: 'abstract', collName: '抽象', title: '色场', daysAgo: 15 }),
	mockPhoto({ seed: 'a03-5', dim: D_LANDSCAPE, artistSlug: 'artist-03', artistName: '艺术家 03', collSlug: 'urban', collName: '都市', title: '地铁站台', daysAgo: 17 }),
	mockPhoto({ seed: 'a03-6', dim: D_PORTRAIT, artistSlug: 'artist-03', artistName: '艺术家 03', collSlug: 'urban', collName: '都市', title: '桥', daysAgo: 19 }),
	mockPhoto({ seed: 'a03-7', dim: D_TALL, artistSlug: 'artist-03', artistName: '艺术家 03', collSlug: 'urban', collName: '都市', title: '天际线', daysAgo: 21 }),
];

const MOCK_UPLOAD_KEY = 'pf:mock-uploads:v1';

function getMockUploads(): PhotoEntry[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(MOCK_UPLOAD_KEY);
		if (!raw) return [];
		const arr = JSON.parse(raw) as PhotoEntry[];
		return Array.isArray(arr) ? arr : [];
	} catch {
		return [];
	}
}

export function saveMockUpload(entry: PhotoEntry) {
	if (typeof localStorage === 'undefined') return;
	const existing = getMockUploads();
	existing.unshift(entry);
	try {
		localStorage.setItem(MOCK_UPLOAD_KEY, JSON.stringify(existing));
	} catch {
		const trimmed = existing.map((e, i) => (i < 3 ? e : { ...e, dataUrl: undefined }));
		try {
			localStorage.setItem(MOCK_UPLOAD_KEY, JSON.stringify(trimmed));
		} catch {
			try {
				localStorage.setItem(MOCK_UPLOAD_KEY, JSON.stringify([entry]));
			} catch {
				/* 放弃 */
			}
		}
	}
}

export function clearMockUploads() {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(MOCK_UPLOAD_KEY);
}

/* ---------- 行 → 实体 ---------- */

interface PhotoRow {
	id: string;
	artist_slug: string;
	artist_name: string;
	collection_slug: string;
	collection_name: string;
	title: string | null;
	description: string | null;
	storage_path: string;
	width: number;
	height: number;
	format: string;
	created_at: string;
}

function rowToEntry(row: PhotoRow): PhotoEntry {
	return {
		id: row.id,
		width: row.width,
		height: row.height,
		format: row.format,
		createdAt: row.created_at,
		artistSlug: row.artist_slug,
		collectionSlug: row.collection_slug,
		storagePath: row.storage_path,
		meta: {
			artistName: row.artist_name,
			collectionName: row.collection_name,
			title: row.title || '',
			description: row.description || '',
		},
	};
}

/* ---------- 查询 ---------- */

export async function listAll(): Promise<PhotoEntry[]> {
	if (getMode() === 'mock') {
		return [...getMockUploads(), ...MOCK_SEED_PHOTOS].sort((a, b) =>
			b.createdAt.localeCompare(a.createdAt),
		);
	}

	const sb = getClient();
	// 显式列举公开列,避免 SELECT * 把 artist_contact 这类敏感字段带回前端。
	const { data, error } = await sb
		.from('photos')
		.select(
			'id,artist_slug,artist_name,collection_slug,collection_name,title,description,storage_path,width,height,format,created_at',
		)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('[supabase] listAll failed:', error);
		return [];
	}
	return ((data || []) as PhotoRow[]).map(rowToEntry);
}

/** 兼容旧 API：原本的 listByTag 现在等同 listAll（Supabase 不需要 tag 概念） */
export function listByTag(_tag: string): Promise<PhotoEntry[]> {
	return listAll();
}

/* ---------- 上传 (live) ---------- */

/**
 * 用 XHR 直接 POST 到 Supabase Storage REST endpoint，可拿到上传进度。
 * 上传成功后再 INSERT 一行 photos 元数据。
 */
export async function uploadPhoto(
	file: File,
	opts: {
		artistSlug: string;
		collectionSlug: string;
		meta: PhotoMeta;
		/** 艺术家自报联系方式。写入数据库供运营私下回联,不进任何匿名读取路径。 */
		contact: string;
		width: number;
		height: number;
		onProgress?: (pct: number) => void;
	},
): Promise<PhotoEntry> {
	if (getMode() !== 'live') {
		throw new Error('uploadPhoto 仅在 live 模式可用');
	}

	const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
	const uuid =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2) + Date.now().toString(36);
	const storagePath = `${opts.artistSlug}/${opts.collectionSlug}/${uuid}.${ext}`;

	// Step 1: 上传文件到 Storage
	await xhrUpload(
		`${cfg.url}/storage/v1/object/${cfg.bucket}/${storagePath}`,
		file,
		{
			Authorization: `Bearer ${cfg.anonKey}`,
			apikey: cfg.anonKey,
			'Content-Type': file.type || 'application/octet-stream',
			'x-upsert': 'false',
		},
		opts.onProgress,
	);

	// Step 2: 写元数据行
	const sb = getClient();
	const { data, error } = await sb
		.from('photos')
		.insert({
			artist_slug: opts.artistSlug,
			artist_name: opts.meta.artistName,
			artist_contact: opts.contact,
			collection_slug: opts.collectionSlug,
			collection_name: opts.meta.collectionName,
			title: opts.meta.title,
			description: opts.meta.description,
			storage_path: storagePath,
			width: opts.width,
			height: opts.height,
			format: ext,
		})
		.select()
		.single();

	if (error || !data) {
		// 元数据写失败 → 尽量回滚 Storage 上传
		await sb.storage
			.from(cfg.bucket)
			.remove([storagePath])
			.catch(() => {});
		throw new Error(`元数据写入失败: ${error?.message ?? '未知错误'}`);
	}

	return rowToEntry(data as PhotoRow);
}

function xhrUpload(
	url: string,
	body: File,
	headers: Record<string, string>,
	onProgress?: (pct: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', url);
		Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
		xhr.upload.addEventListener('progress', (e) => {
			if (e.lengthComputable) {
				onProgress?.(Math.round((e.loaded / e.total) * 100));
			}
		});
		xhr.addEventListener('load', () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve();
			} else {
				let msg = `HTTP ${xhr.status}`;
				try {
					const j = JSON.parse(xhr.responseText);
					msg = j.error || j.message || msg;
				} catch {
					/* keep default */
				}
				reject(new Error(`存储上传失败: ${msg}`));
			}
		});
		xhr.addEventListener('error', () => reject(new Error('网络错误')));
		xhr.send(body);
	});
}

/* ---------- 视图聚合 ---------- */

export function groupByArtist(photos: PhotoEntry[]): ArtistSummary[] {
	const map = new Map<string, ArtistSummary>();
	for (const p of photos) {
		const existing = map.get(p.artistSlug);
		if (!existing) {
			map.set(p.artistSlug, {
				slug: p.artistSlug,
				name: p.meta.artistName || p.artistSlug,
				coverPhoto: p,
				photoCount: 1,
			});
		} else {
			existing.photoCount += 1;
			if (p.createdAt > existing.coverPhoto.createdAt) existing.coverPhoto = p;
		}
	}
	return Array.from(map.values()).sort((a, b) =>
		b.coverPhoto.createdAt.localeCompare(a.coverPhoto.createdAt),
	);
}

export function groupByCollection(photos: PhotoEntry[]): CollectionSummary[] {
	const map = new Map<string, CollectionSummary>();
	for (const p of photos) {
		const key = p.collectionSlug;
		const existing = map.get(key);
		if (!existing) {
			map.set(key, {
				slug: key,
				name: p.meta.collectionName || key,
				photos: [p],
			});
		} else {
			existing.photos.push(p);
		}
	}
	return Array.from(map.values());
}

/* ---------- 渲染 URL ---------- */

export function deliveryUrl(entry: PhotoEntry, opts: { width?: number } = {}): string {
	// mock：用户上传走 dataUrl，种子图走 picsum
	if (entry.dataUrl) return entry.dataUrl;
	if (entry.mockSeed) {
		const w = opts.width || entry.width;
		const h = Math.round(w * (entry.height / entry.width));
		return `https://picsum.photos/seed/${entry.mockSeed}/${w}/${h}`;
	}

	// live：Supabase Storage public URL
	// Free tier 不支持 transformations，返回原图（已在 bucket 中是用户上传的尺寸）
	return `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${entry.storagePath}`;
}

export function srcSet(_entry: PhotoEntry): string {
	// Supabase Free 不带 image transformations，无法生成多尺寸 srcset
	return '';
}
