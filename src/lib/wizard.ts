/**
 * 上传向导的状态层 —— 跨 6 个独立页面共享数据。
 *
 * 设计:
 *   - 文本类(姓名/slug/contact/作品集名/voice_id):localStorage,沿用既有的 key
 *   - 图片(Blob + 元数据/AI 建议/对话历史):IndexedDB,File 对象塞不进 localStorage
 *   - 实际网络写入(uploadPhoto / setNarration)推迟到第 ⑥ 步「发布」时统一做
 *
 * IndexedDB:
 *   DB: pf-wizard (version 1)
 *   ObjectStore: photos (keyPath: id)
 */

/* ============================================================
 *  文本状态 (localStorage)
 * ============================================================ */

const IDENTITY_KEY = 'pf:identity:v1';
const COLL_KEY = 'pf:lastColl:v1';
const VOICES_KEY = 'pf:voices:v1';

export interface Identity {
	artistName: string;
	artistSlug: string;
	artistContact: string;
}

export function getIdentity(): Identity {
	try {
		const raw = localStorage.getItem(IDENTITY_KEY);
		if (!raw) return { artistName: '', artistSlug: '', artistContact: '' };
		const o = JSON.parse(raw);
		return {
			artistName: o.artistName || '',
			artistSlug: o.artistSlug || '',
			artistContact: o.artistContact || '',
		};
	} catch {
		return { artistName: '', artistSlug: '', artistContact: '' };
	}
}

export function setIdentity(patch: Partial<Identity>): void {
	const cur = getIdentity();
	const next = { ...cur, ...patch };
	localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
}

export interface Collection {
	name: string;
	slug: string;
}

export function getCollection(): Collection {
	try {
		const raw = localStorage.getItem(COLL_KEY);
		if (!raw) return { name: '', slug: '' };
		const o = JSON.parse(raw);
		return { name: o.name || '', slug: o.slug || '' };
	} catch {
		return { name: '', slug: '' };
	}
}

export function setCollection(c: Collection): void {
	localStorage.setItem(COLL_KEY, JSON.stringify(c));
}

export interface VoiceRecord {
	voiceId: string;
	voiceSamplePath: string;
	consentAt: string;
}

export function getVoiceForSlug(slug: string): VoiceRecord | null {
	if (!slug) return null;
	try {
		const all = JSON.parse(localStorage.getItem(VOICES_KEY) || '{}');
		const rec = all[slug];
		if (rec && rec.voiceId) return rec as VoiceRecord;
		return null;
	} catch {
		return null;
	}
}

export function saveVoiceForSlug(slug: string, rec: VoiceRecord): void {
	try {
		const all = JSON.parse(localStorage.getItem(VOICES_KEY) || '{}');
		all[slug] = rec;
		localStorage.setItem(VOICES_KEY, JSON.stringify(all));
	} catch {
		/* 配额满放弃 */
	}
}

/* ============================================================
 *  图片向导仓库 (IndexedDB)
 * ============================================================ */

const DB_NAME = 'pf-wizard';
const DB_VERSION = 1;
const PHOTOS_STORE = 'photos';

/** ChatMessage 形态对齐 ai.ts 内部约定:role 三选一,content 任意(首轮可能是数组) */
export interface WizardChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: unknown;
}

export interface WizardPhoto {
	id: string;
	/** 原文件 blob,渲染预览和最终上传都用它 */
	blob: Blob;
	filename: string;
	mimeType: string;
	size: number;
	width: number;
	height: number;
	addedAt: number;
	/** 艺术家可编辑字段 */
	title: string;
	titleEn: string;
	description: string;
	descriptionEn: string;
	/** AI 返回 */
	tags: { theme: string; style: string; medium: string; palette: string; mood: string };
	curatorNote: string;
	moderation: { safe: boolean; reason: string; categories: string[] } | null;
	aiHistory: WizardChatMessage[];
	aiReasoning: string;
	aiStatus: 'idle' | 'analyzing' | 'done' | 'error';
	aiError: string;
	/** 用户是否手动改过(避免被后续 AI 调用覆盖) */
	titleEdited: boolean;
	descEdited: boolean;
}

let _dbPromise: Promise<IDBDatabase> | null = null;
function openDB(): Promise<IDBDatabase> {
	if (_dbPromise) return _dbPromise;
	_dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
				db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error || new Error('IDB open failed'));
	});
	return _dbPromise;
}

function tx<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest<T> | IDBRequest<unknown>,
): Promise<T> {
	return openDB().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const t = db.transaction(PHOTOS_STORE, mode);
				const store = t.objectStore(PHOTOS_STORE);
				const req = fn(store);
				req.onsuccess = () => resolve(req.result as T);
				req.onerror = () => reject(req.error);
			}),
	);
}

function genId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 读图片尺寸(送 IDB 一并存,避免每次预览时重新解码) */
async function readDimensions(file: Blob): Promise<{ width: number; height: number }> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve({ width: img.naturalWidth, height: img.naturalHeight });
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			resolve({ width: 0, height: 0 });
		};
		img.src = url;
	});
}

export async function addPhoto(file: File): Promise<WizardPhoto> {
	const { width, height } = await readDimensions(file);
	const rec: WizardPhoto = {
		id: genId(),
		blob: file,
		filename: file.name,
		mimeType: file.type,
		size: file.size,
		width,
		height,
		addedAt: Date.now(),
		title: stripExt(file.name),
		titleEn: '',
		description: '',
		descriptionEn: '',
		tags: { theme: '', style: '', medium: '', palette: '', mood: '' },
		curatorNote: '',
		moderation: null,
		aiHistory: [],
		aiReasoning: '',
		aiStatus: 'idle',
		aiError: '',
		titleEdited: false,
		descEdited: false,
	};
	await tx('readwrite', (store) => store.put(rec));
	return rec;
}

export async function listPhotos(): Promise<WizardPhoto[]> {
	const list = await tx<WizardPhoto[]>('readonly', (store) => store.getAll());
	return list.sort((a, b) => a.addedAt - b.addedAt);
}

export async function getPhoto(id: string): Promise<WizardPhoto | null> {
	const r = await tx<WizardPhoto | undefined>('readonly', (store) => store.get(id));
	return r ?? null;
}

export async function updatePhoto(id: string, patch: Partial<WizardPhoto>): Promise<void> {
	const cur = await getPhoto(id);
	if (!cur) throw new Error(`photo ${id} not in IDB`);
	const next = { ...cur, ...patch };
	await tx('readwrite', (store) => store.put(next));
}

export async function removePhoto(id: string): Promise<void> {
	await tx('readwrite', (store) => store.delete(id));
}

export async function clearAllPhotos(): Promise<void> {
	await tx('readwrite', (store) => store.clear());
}

function stripExt(name: string): string {
	return name.replace(/\.[^.]+$/, '').slice(0, 50) || 'untitled';
}

/* ============================================================
 *  步骤校验
 * ============================================================ */

import { hasAiKey } from './ai';

export type StepName = 'setup' | 'identity' | 'voice' | 'collection' | 'photos' | 'publish';

export const STEP_ORDER: StepName[] = [
	'setup',
	'identity',
	'voice',
	'collection',
	'photos',
	'publish',
];

export const STEP_LABEL: Record<StepName, string> = {
	setup: 'AI 助手设置',
	identity: '你是谁',
	voice: '你的声音',
	collection: '作品集',
	photos: '选图',
	publish: '发布',
};

/** 给定当前在哪一步,返回前一步、后一步的路径(已含 base) */
export function stepHref(base: string, step: StepName): string {
	const b = base.replace(/\/+$/, '');
	return `${b}/upload/${step}/`;
}

/** 前置步骤是否已完成。photosCount 由调用方读 IDB 给。 */
export async function isStepReady(step: StepName): Promise<boolean> {
	switch (step) {
		case 'setup':
			return true; // 第一步总是可进
		case 'identity':
			return hasAiKey();
		case 'voice': {
			if (!hasAiKey()) return false;
			const id = getIdentity();
			return !!(id.artistName.trim() && id.artistSlug);
		}
		case 'collection': {
			if (!hasAiKey()) return false;
			const id = getIdentity();
			if (!id.artistName.trim() || !id.artistSlug) return false;
			const voice = getVoiceForSlug(id.artistSlug);
			return !!voice;
		}
		case 'photos': {
			if (!(await isStepReady('collection'))) return false;
			const c = getCollection();
			return !!(c.name.trim() && c.slug);
		}
		case 'publish': {
			if (!(await isStepReady('photos'))) return false;
			const photos = await listPhotos();
			return photos.length > 0;
		}
	}
}

/** 找第一个「自己可进入但下一步尚不可进入」的步骤 = 当前应该在的步骤 */
export async function firstIncompleteStep(): Promise<StepName> {
	for (let i = 0; i < STEP_ORDER.length - 1; i++) {
		const next = STEP_ORDER[i + 1];
		if (!(await isStepReady(next))) return STEP_ORDER[i];
	}
	return STEP_ORDER[STEP_ORDER.length - 1];
}

/** 进入一步前先调本函数:如果前置没完成,返回应该跳去的步骤;都齐了返回 null。 */
export async function gateForStep(step: StepName): Promise<StepName | null> {
	if (await isStepReady(step)) return null;
	return firstIncompleteStep();
}
