/**
 * 「声音克隆 + AI 解说语音合成」前端客户端 —— BYOK 直连 Step。
 *
 * 复用 ai.ts 的 localStorage Key 凭证(同一个 StepFun 账号同时支持
 * chat 与 audio 端点)。CORS 已在 D 启动前验证为开放,见 commit message。
 *
 *   浏览器 ──(用户自己的 key)──▶ https://api.stepfun.com/step_plan/v1/{files,audio/voices,audio/speech}
 *
 * 三段式流程(对齐 Spec §5 P0):
 *   A. 音色登记: uploadVoiceSample → cloneVoice → 拿 voice_id 与试听音频
 *   B. 解说生成 + 合成: generateNarrationText (在 ai.ts) → synthesizeSpeech → mp3
 *   C. 展示播放: 仅消费预生成 mp3,本模块不参与
 *
 * 合规(Spec §9):
 *   - cloneVoice 必须只用艺术家本人录的样本;调用方必须先在 UI 勾选授权,
 *     否则不得调用本模块的克隆函数。
 *   - 所有合成语音播放处的 UI 必须标注「AI 合成」(由 D5 任务在 /[artist] 实现)。
 */

import { getAiConfig } from './ai';

const STEP_BASE_URL = 'https://api.stepfun.com/step_plan/v1';

/** 复刻与合成都用 stepaudio-2.5-tts */
export const VOICE_MODEL = 'stepaudio-2.5-tts';

/* ---------- 类型 ---------- */

export interface CloneVoiceOk {
	ok: true;
	voiceId: string;
	/** 试听音频(WAV,base64),用于 UI 立即播放给艺术家确认。
	 *  注:旧 step-tts-2 一定有;新 stepaudio-2.5-tts 不一定返回 ——
	 *  这是 optional,缺失时 UI 直接给确认按钮(没试听可点)。 */
	sampleAudioB64?: string;
	sampleAudioMime?: string;
	ms: number;
}

export interface SynthOk {
	ok: true;
	audio: Blob;
	mimeType: string;
	ms: number;
}

export type ApiResult<T> = T | { ok: false; error: string };

/* ---------- 内部工具 ---------- */

function requireKey(): { apiKey: string } {
	const cfg = getAiConfig();
	if (!cfg.apiKey) {
		throw new Error('未配置 StepFun API Key,请先在「AI 助手」处填入');
	}
	return { apiKey: cfg.apiKey };
}

async function readErrorMessage(res: Response): Promise<string> {
	let bodyText = '';
	try {
		bodyText = await res.text();
	} catch {
		/* ignore */
	}
	try {
		const j = JSON.parse(bodyText);
		return j?.error?.message || j?.message || bodyText.slice(0, 200) || `HTTP ${res.status}`;
	} catch {
		return bodyText.slice(0, 200) || `HTTP ${res.status}`;
	}
}

/* ---------- A. 上传音频文件 ---------- */

/**
 * POST /v1/files (purpose=storage) — 把音色样本 mp3/wav 推到 StepFun 私有存储,
 * 返回 file_id 供后续 cloneVoice 引用。本身不消耗 voice 额度。
 *
 * Spec 要求 5~10s 参考音频,调用方在 UI 限定时长。
 */
export async function uploadVoiceSample(
	file: Blob,
	filename?: string,
): Promise<ApiResult<{ ok: true; fileId: string }>> {
	let apiKey: string;
	try {
		({ apiKey } = requireKey());
	} catch (e: any) {
		return { ok: false, error: e.message };
	}

	const fd = new FormData();
	fd.append('purpose', 'storage');
	const inferredName = filename || `voice-sample.${(file.type.split('/')[1] || 'wav').replace(/\W/g, '')}`;
	// 必须用一个有名字的 File,FormData 才会带文件名给后端
	const namedFile = file instanceof File ? file : new File([file], inferredName, { type: file.type });
	fd.append('file', namedFile, inferredName);

	try {
		const res = await fetch(`${STEP_BASE_URL}/files`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}` },
			body: fd,
		});
		if (!res.ok) return { ok: false, error: await readErrorMessage(res) };
		const j = await res.json();
		const fileId = j?.id;
		if (!fileId) return { ok: false, error: '响应里没有 file id' };
		return { ok: true, fileId };
	} catch (e: any) {
		return { ok: false, error: e?.message || String(e) };
	}
}

/* ---------- B. 音色复刻 ---------- */

/**
 * POST /v1/audio/voices — 用上一步拿到的 file_id 训练专属音色,
 * 返回 voice_id(后续 TTS 用)与 sample_audio(立即试听用)。
 *
 * @param fileId      uploadVoiceSample 返回的 file_id
 * @param text        训练文本,留空则用 sample_text 默认值;通常和 sample_text 相同
 * @param sampleText  返回试听音频时朗读的文本(中文一句即可,默认「你好,我是回声」)
 */
export async function cloneVoice(opts: {
	fileId: string;
	text?: string;
	sampleText?: string;
}): Promise<ApiResult<CloneVoiceOk>> {
	let apiKey: string;
	try {
		({ apiKey } = requireKey());
	} catch (e: any) {
		return { ok: false, error: e.message };
	}

	const sampleText = opts.sampleText || '你好,我是这位艺术家的克隆声音。';
	const trainText = opts.text || sampleText;
	const start = performance.now();
	try {
		const res = await fetch(`${STEP_BASE_URL}/audio/voices`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				file_id: opts.fileId,
				model: VOICE_MODEL,
				text: trainText,
				sample_text: sampleText,
			}),
		});
		if (!res.ok) return { ok: false, error: await readErrorMessage(res) };
		const j = await res.json();
		const voiceId: string | undefined = j?.id;
		// 不同模型字段名不一样: step-tts-2 给 sample_audio,新模型可能给
		// audio / preview_audio / 干脆不返回。voiceId 拿到就算复刻成功,
		// 试听音频只是给 UI 让用户确认,缺了不阻断。
		const sampleB64: string | undefined =
			j?.sample_audio || j?.audio || j?.preview_audio || j?.b64_audio;
		if (!voiceId) {
			console.error('[cloneVoice] 响应缺 voice id, 原始 body:', j);
			return { ok: false, error: '响应里没有 voice id' };
		}
		if (!sampleB64) {
			console.warn('[cloneVoice] 此模型未返回试听音频, voice_id 仍然可用:', j);
		}
		return {
			ok: true,
			voiceId,
			sampleAudioB64: sampleB64 || undefined,
			sampleAudioMime: sampleB64 ? 'audio/wav' : undefined,
			ms: Math.round(performance.now() - start),
		};
	} catch (e: any) {
		return { ok: false, error: e?.message || String(e) };
	}
}

/* ---------- C. 语音合成 ---------- */

export interface SynthOptions {
	voiceId: string;
	text: string;
	/** 0.5 ~ 2.0;默认 1.0 */
	speed?: number;
	/** 见 stepaudio-2.5-tts 文档,如 'happy' / 'sad' / 'calm' */
	emotion?: string;
	/** 风格,如 'narration' / 'reading' */
	style?: string;
}

/**
 * POST /v1/audio/speech — OpenAI 兼容,把解说词渲染成艺术家专属音色的 mp3。
 * 返回的 Blob 直接喂 <audio> 或上传到 Supabase audio bucket。
 */
export async function synthesizeSpeech(opts: SynthOptions): Promise<ApiResult<SynthOk>> {
	let apiKey: string;
	try {
		({ apiKey } = requireKey());
	} catch (e: any) {
		return { ok: false, error: e.message };
	}
	if (!opts.voiceId) return { ok: false, error: 'voiceId 必填' };
	if (!opts.text) return { ok: false, error: '解说词不能为空' };

	const start = performance.now();
	try {
		// 不同 TTS 模型对参数支持不一样:
		//   step-tts-2 接受 voice_label.style/emotion,response_format 可省
		//   stepaudio-2.5-tts(新)不接受 voice_label,带上就 400
		// 默认只发最小必需的 4 个字段;只有调用方明确传 speed/emotion/style 时才加,
		// 失败时把 body 打到 console 方便排查
		const body: Record<string, unknown> = {
			model: VOICE_MODEL,
			voice: opts.voiceId,
			input: opts.text,
			response_format: 'mp3',
		};
		if (typeof opts.speed === 'number') body.speed = opts.speed;
		if (opts.emotion || opts.style) {
			body.voice_label = {
				...(opts.emotion ? { emotion: opts.emotion } : {}),
				...(opts.style ? { style: opts.style } : {}),
			};
		}
		const res = await fetch(`${STEP_BASE_URL}/audio/speech`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const errMsg = await readErrorMessage(res);
			console.error('[synthesizeSpeech] 失败 body:', body, '错误:', errMsg);
			return { ok: false, error: errMsg };
		}
		const audio = await res.blob();
		return {
			ok: true,
			audio,
			mimeType: audio.type || 'audio/mpeg',
			ms: Math.round(performance.now() - start),
		};
	} catch (e: any) {
		return { ok: false, error: e?.message || String(e) };
	}
}

/* ---------- 工具:base64 → Blob,给 cloneVoice 试听 ---------- */

export function base64ToBlob(b64: string, mime = 'audio/wav'): Blob {
	const bin = atob(b64);
	const len = bin.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
	return new Blob([bytes], { type: mime });
}
