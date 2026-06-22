/**
 * 「AI 作品助手」前端客户端 —— BYOK（Bring Your Own Key）直连 Step。
 *
 * 每位艺术家在上传页填入自己领取的 StepFun API Key（默认模型 step-3.7-flash）。
 * StepFun 接口对浏览器开放 CORS，故前端直接调用，无需任何后端 / 代理：
 *   浏览器 ──(用户自己的 key)──▶ https://api.stepfun.com/step_plan/v1/chat/completions
 * key 只存在该用户自己的浏览器 localStorage 里，不经过我们任何服务器。
 *
 * 能力：
 *  1. analyzePhoto —— 读图，返回「内容审核 + 标题/描述/标签/策展评语」+ 对话上下文
 *  2. chatRevise   —— 基于上下文多轮对话，按艺术家意见调整文案
 *  审核结果用于在上传页门控「发布」按钮。
 */

const STEP_BASE_URL = 'https://api.stepfun.com/step_plan/v1';
export const DEFAULT_MODEL = 'step-3.7-flash';

/* ---------- BYOK 配置（localStorage） ---------- */

const KEY_LS = 'pf:step-key:v1';
const MODEL_LS = 'pf:step-model:v1';

export interface AiConfig {
	apiKey: string;
	model: string;
}

export function getAiConfig(): AiConfig {
	let apiKey = '';
	let model = DEFAULT_MODEL;
	if (typeof localStorage !== 'undefined') {
		apiKey = localStorage.getItem(KEY_LS) || '';
		model = localStorage.getItem(MODEL_LS) || DEFAULT_MODEL;
	}
	return { apiKey, model };
}

export function setAiConfig(c: Partial<AiConfig>): void {
	if (typeof localStorage === 'undefined') return;
	if (c.apiKey !== undefined) localStorage.setItem(KEY_LS, c.apiKey.trim());
	if (c.model !== undefined) localStorage.setItem(MODEL_LS, (c.model.trim() || DEFAULT_MODEL));
}

export function hasAiKey(): boolean {
	return getAiConfig().apiKey.trim().length > 0;
}

/* ---------- 类型 ---------- */

export interface AiTags {
	theme: string;
	style: string;
	medium: string;
	palette: string;
	mood: string;
}

export interface Moderation {
	safe: boolean;
	reason: string;
	categories: string[];
}

export interface AiSuggestion {
	title: string;
	/** 英文标题(M2 双语) */
	titleEn: string;
	description: string;
	/** 英文描述(M2 双语) */
	descriptionEn: string;
	tags: AiTags;
	curatorNote: string;
}

/** OpenAI 兼容的消息（user 首轮含图片，后续纯文本） */
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: any };

export interface AnalyzeOk {
	ok: true;
	suggestion: AiSuggestion;
	moderation: Moderation;
	reply: string;
	reasoning: string;
	usage: { total_tokens?: number } | null;
	ms: number;
	/** 多轮对话上下文，传给 chatRevise 继续聊 */
	history: ChatMessage[];
}
export type AnalyzeResult = AnalyzeOk | { ok: false; error: string };

export interface ReviseOk {
	ok: true;
	reply: string;
	suggestion: AiSuggestion;
	moderation: Moderation;
	reasoning: string;
	history: ChatMessage[];
}
export type ReviseResult = ReviseOk | { ok: false; error: string };

/* ---------- prompt ---------- */

const SYSTEM_PROMPT = `你是「候鸟 300」艺术家驻地的策展助理，同时负责作品发布前的内容安全审核。
你将在多轮对话中，帮一位艺术家打磨 TA 上传的这张作品的展陈文案。

每一轮都必须、且只能输出一个 JSON 对象（不要 Markdown 代码块、不要任何多余文字），结构：
{
  "reply": "给艺术家看的一句话对话回复。首轮为简短开场；当 TA 要求修改时，说明你改了什么",
  "moderation": {
    "safe": true 或 false,
    "reason": "若 safe=false，用一句话说明判定原因；safe=true 时留空",
    "categories": ["命中的违规类别，安全则空数组"]
  },
  "title": "有意境、不超过 10 字的中文作品标题",
  "title_en": "对应的英文标题(精炼,不要逐字翻译,符合英语展陈语境;最长 8 个英文单词)",
  "description": "40 字以内、画册图注式的中文作品描述",
  "description_en": "对应的英文描述(同样画册图注式,不超过 30 个英文单词)",
  "tags": { "theme": "主题", "style": "风格", "medium": "媒介", "palette": "主色调", "mood": "情绪" },
  "curatorNote": "30 字以内、有审美判断的中文策展短评"
}

英文字段写作要求:title_en / description_en 不是中文逐字直译,要像英文展览图录的措辞 ——
简洁、画面优先、避免 "this work shows..." 之类废话起手。
tags 用中文(theme/style 等键值都用中文短语),curatorNote 仅中文。

审核标准（categories 用中文，可多选）：色情/露骨成人内容(成人)、赌博(赌博)、毒品/管制药物(毒品)、
严重暴力血腥(暴力)、其它违法内容(违法)、主体为广告推广/二维码/导流引流(广告)。
凡命中以上、属于不适合公开展览传播的内容，moderation.safe=false 并写明类别与原因；否则 safe=true。
无论安全与否，所有字段都照常生成。
后续轮次艺术家会给出「当前文案」与修改要求，请据此更新相应字段、保持中英两版一致，并在 reply 说明改动。`;

/* ---------- 图片下采样（仅用于送模型，不影响真实存图） ---------- */

export function fileToAiDataUrl(file: File, maxEdge = 1024, quality = 0.85): Promise<string> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
			const w = Math.max(1, Math.round(img.naturalWidth * scale));
			const h = Math.max(1, Math.round(img.naturalHeight * scale));
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) return reject(new Error('canvas 不可用'));
			ctx.drawImage(img, 0, 0, w, h);
			resolve(canvas.toDataURL('image/jpeg', quality));
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('无法解析图片'));
		};
		img.src = url;
	});
}

/* ---------- 底层调用 ---------- */

async function stepChat(
	messages: ChatMessage[],
): Promise<{ content: string; reasoning: string; usage: any }> {
	const { apiKey, model } = getAiConfig();
	if (!apiKey) throw new Error('未填写 API Key');

	const resp = await fetch(`${STEP_BASE_URL}/chat/completions`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: model || DEFAULT_MODEL, messages, temperature: 0.7 }),
	});

	if (!resp.ok) {
		let msg = `HTTP ${resp.status}`;
		try {
			const j = await resp.json();
			msg = j?.error?.message || j?.message || msg;
		} catch {
			/* keep */
		}
		if (resp.status === 401) msg = 'API Key 无效或已过期';
		throw new Error(msg);
	}

	const data = await resp.json();
	const m = data.choices?.[0]?.message ?? {};
	return {
		content: str(m.content),
		reasoning: str(m.reasoning_content || m.reasoning),
		usage: data.usage ?? null,
	};
}

/* ---------- 解析 ---------- */

function str(v: unknown): string {
	return typeof v === 'string' ? v.trim() : '';
}

interface Parsed {
	reply: string;
	moderation: Moderation;
	suggestion: AiSuggestion;
}

function parseTurn(content: string): Parsed {
	let raw = (content || '').trim();
	const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) raw = fence[1].trim();
	if (!raw.startsWith('{')) {
		const s = raw.indexOf('{');
		const e = raw.lastIndexOf('}');
		if (s !== -1 && e !== -1) raw = raw.slice(s, e + 1);
	}
	let o: Record<string, any> = {};
	try {
		o = JSON.parse(raw);
	} catch {
		o = {};
	}

	const t = o.tags && typeof o.tags === 'object' ? o.tags : {};
	const m = o.moderation && typeof o.moderation === 'object' ? o.moderation : {};
	return {
		reply: str(o.reply),
		moderation: {
			safe: m.safe !== false, // 缺省视为安全；仅明确 false 才拦截
			reason: str(m.reason),
			categories: Array.isArray(m.categories) ? m.categories.map(str).filter(Boolean) : [],
		},
		suggestion: {
			title: str(o.title),
			titleEn: str(o.title_en),
			description: str(o.description),
			descriptionEn: str(o.description_en),
			tags: {
				theme: str(t.theme),
				style: str(t.style),
				medium: str(t.medium),
				palette: str(t.palette),
				mood: str(t.mood),
			},
			curatorNote: str(o.curatorNote),
		},
	};
}

/* ---------- 首轮：读图分析 + 审核 ---------- */

export async function analyzePhoto(file: File): Promise<AnalyzeResult> {
	const t0 = performance.now();
	let imageDataUrl: string;
	try {
		imageDataUrl = await fileToAiDataUrl(file);
	} catch (e) {
		return { ok: false, error: (e as Error).message };
	}

	const history: ChatMessage[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{
			role: 'user',
			content: [
				{ type: 'text', text: '这是我的作品，请先做内容审核，再生成第一版文案。' },
				{ type: 'image_url', image_url: { url: imageDataUrl } },
			],
		},
	];

	try {
		const { content, reasoning, usage } = await stepChat(history);
		const parsed = parseTurn(content);
		history.push({ role: 'assistant', content });
		return {
			ok: true,
			suggestion: parsed.suggestion,
			moderation: parsed.moderation,
			reply: parsed.reply,
			reasoning,
			usage,
			ms: Math.round(performance.now() - t0),
			history,
		};
	} catch (e) {
		return { ok: false, error: (e as Error).message };
	}
}

/* ---------- 后续轮：对话调整 ---------- */

export async function chatRevise(
	history: ChatMessage[],
	userText: string,
	current: AiSuggestion,
): Promise<ReviseResult> {
	// 把「当前实际文案」一并带上，使模型基于艺术家手改后的最新版本来调整
	const composed =
		`当前文案 —— 中文标题:《${current.title}》｜英文标题:${current.titleEn || '(空)'}｜` +
		`中文描述:${current.description}｜英文描述:${current.descriptionEn || '(空)'}｜` +
		`评语:${current.curatorNote}｜标签:${Object.values(current.tags).filter(Boolean).join('、')}\n` +
		`我的修改要求:${userText}`;

	const next: ChatMessage[] = [...history, { role: 'user', content: composed }];

	try {
		const { content, reasoning } = await stepChat(next);
		const parsed = parseTurn(content);
		next.push({ role: 'assistant', content });
		return {
			ok: true,
			reply: parsed.reply || '已为你更新文案。',
			suggestion: parsed.suggestion,
			moderation: parsed.moderation,
			reasoning,
			history: next,
		};
	} catch (e) {
		return { ok: false, error: (e as Error).message };
	}
}

/* ---------- 解说词生成（M3 灵魂功能用） ---------- */

const NARRATION_SYSTEM_PROMPT = `你正在为一位艺术家的画作配语音导览解说词。
要求：
- 1~3 句话，加起来不超过 80 字
- 像策展人在艺术家身边轻声讲解，亲切但不啰嗦
- 描述画面里的关键观察 + 一点点情绪/解读，避免堆砌形容词
- 不要"这幅画"、"在这件作品中"这类废话开头
- 不要 Markdown、不要列表、不要引号、不要署名
- 输出纯文本即可，不要 JSON、不要前后缀`;

export interface NarrationContext {
	title?: string;
	description?: string;
	tags?: Partial<AiTags>;
	curatorNote?: string;
}

export interface NarrationOk {
	ok: true;
	text: string;
	ms: number;
}
export type NarrationResult = NarrationOk | { ok: false; error: string };

/**
 * 给一张作品生成 1~3 句口语化解说词，用于 stepaudio-2.5-tts 合成。
 * 复用 chat completions（含 vision），让模型同时看到图片与已生成的元数据上下文。
 */
export async function generateNarrationText(
	file: File,
	ctx: NarrationContext = {},
): Promise<NarrationResult> {
	const t0 = performance.now();
	try {
		const dataUrl = await fileToAiDataUrl(file);
		const ctxLines: string[] = [];
		if (ctx.title) ctxLines.push(`标题：${ctx.title}`);
		if (ctx.description) ctxLines.push(`描述：${ctx.description}`);
		if (ctx.curatorNote) ctxLines.push(`策展短评：${ctx.curatorNote}`);
		if (ctx.tags) {
			const t = ctx.tags;
			const parts = [t.theme, t.style, t.medium, t.palette, t.mood].filter(Boolean);
			if (parts.length) ctxLines.push(`标签：${parts.join(' / ')}`);
		}
		const userText = ctxLines.length
			? `请基于这张作品和以下已有元数据，生成解说词：\n${ctxLines.join('\n')}`
			: '请基于这张作品生成解说词。';

		const messages: ChatMessage[] = [
			{ role: 'system', content: NARRATION_SYSTEM_PROMPT },
			{
				role: 'user',
				content: [
					{ type: 'image_url', image_url: { url: dataUrl } },
					{ type: 'text', text: userText },
				],
			},
		];
		const { content } = await stepChat(messages);
		const text = (content || '').trim().replace(/^["「『]+|["」』]+$/g, '');
		if (!text) return { ok: false, error: '模型没有返回解说词' };
		return { ok: true, text, ms: Math.round(performance.now() - t0) };
	} catch (e) {
		return { ok: false, error: (e as Error).message };
	}
}

/* ---------- 自然语言检索 (M4) ---------- */

const SEARCH_SYSTEM_PROMPT = `你是一个艺术作品检索引擎。
我会给你:
  - 一段访客的查询(自然语言,中英都可能)
  - 一个作品清单(JSON 数组,每个元素含 id / title / titleEn / description /
    descriptionEn / curatorNote / tags 五维)

你的任务:从清单里挑出最相关的作品(最多 9 件),按相关度从高到低排。
输出**仅一行 JSON**,结构: {"ids": ["id1","id2",...]}
- 不要 Markdown 代码块、不要任何解释、不要其它字段
- 没有相关结果就返回 {"ids": []}
- 不允许编造不在清单里的 id`;

export interface SearchOk {
	ok: true;
	ids: string[];
	ms: number;
}
export type SearchResult = SearchOk | { ok: false; error: string };

export interface SearchableArtwork {
	id: string;
	title?: string;
	titleEn?: string;
	description?: string;
	descriptionEn?: string;
	curatorNote?: string;
	tags?: { theme?: string; style?: string; medium?: string; palette?: string; mood?: string };
}

/**
 * 把全量作品清单 + 用户 query 一起喂给 step-3.7-flash,只取它返回的 id 列表。
 * 失败由调用方降级到关键词过滤兜底,保证不白屏。
 */
export async function searchByQuery(
	query: string,
	items: SearchableArtwork[],
): Promise<SearchResult> {
	const t0 = performance.now();
	if (!query.trim()) return { ok: true, ids: [], ms: 0 };
	if (items.length === 0) return { ok: true, ids: [], ms: 0 };
	try {
		const messages: ChatMessage[] = [
			{ role: 'system', content: SEARCH_SYSTEM_PROMPT },
			{
				role: 'user',
				content:
					`查询: ${query.trim()}\n\n作品清单(共 ${items.length} 件):\n` +
					JSON.stringify(items),
			},
		];
		const { content } = await stepChat(messages);
		// 解析:剥代码栅栏 / 取首个 {...}
		let raw = (content || '').trim();
		const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
		if (fence) raw = fence[1].trim();
		if (!raw.startsWith('{')) {
			const s = raw.indexOf('{');
			const e = raw.lastIndexOf('}');
			if (s !== -1 && e !== -1) raw = raw.slice(s, e + 1);
		}
		let parsed: { ids?: unknown } = {};
		try {
			parsed = JSON.parse(raw);
		} catch {
			return { ok: false, error: '模型返回不是合法 JSON' };
		}
		const ids = Array.isArray(parsed.ids)
			? parsed.ids.filter((x): x is string => typeof x === 'string').slice(0, 9)
			: [];
		// 不允许返回不存在的 id
		const known = new Set(items.map((it) => it.id));
		const filtered = ids.filter((id) => known.has(id));
		return { ok: true, ids: filtered, ms: Math.round(performance.now() - t0) };
	} catch (e) {
		return { ok: false, error: (e as Error).message };
	}
}

/**
 * 模型不可用时的关键词兜底:简单 substring 命中打分。
 * 调用方在 searchByQuery 返回 ok=false 时切到这里,保证用户体验不黑屏。
 */
export function keywordFallbackSearch(
	query: string,
	items: SearchableArtwork[],
	limit = 9,
): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	// 把 query 拆成 token,>=2 字符的全要
	const tokens = q
		.split(/[\s,，、；;]+/)
		.map((t) => t.trim())
		.filter((t) => t.length >= 1);
	if (!tokens.length) return [];

	const scored = items.map((it) => {
		const hay = [
			it.title,
			it.titleEn,
			it.description,
			it.descriptionEn,
			it.curatorNote,
			it.tags?.theme,
			it.tags?.style,
			it.tags?.medium,
			it.tags?.palette,
			it.tags?.mood,
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();
		let score = 0;
		for (const t of tokens) if (hay.includes(t)) score += 1;
		return { id: it.id, score };
	});
	return scored
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((s) => s.id);
}
