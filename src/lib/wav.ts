/**
 * 浏览器内录音转 WAV — 给「你的声音」就地录音用。
 *
 * 浏览器 MediaRecorder 默认产物:
 *   - Chrome / Edge / Firefox: audio/webm;codecs=opus
 *   - Safari: audio/mp4;codecs=mp4a.40.2
 *
 * StepFun /v1/files 文档要求 mp3/wav,所以录完前端就地转 WAV:
 *   1. AudioContext.decodeAudioData 解出 PCM
 *   2. 单声道下混 + 16bit 量化
 *   3. 手写 44 字节 RIFF/WAVE header
 *   4. 一个 Blob 出门
 *
 * 设计取舍:不重采样到 16kHz —— 保留浏览器原生采样率(多为 48kHz),
 * 一个 10s 的录音 ≈ 940KB,完全在 StepFun /v1/files 可接受范围内,
 * 也避免重采样引入额外失真。
 */

export async function blobToWav(input: Blob): Promise<Blob> {
	const arrayBuffer = await input.arrayBuffer();
	const AudioContextCtor: typeof AudioContext | undefined =
		(window as any).AudioContext || (window as any).webkitAudioContext;
	if (!AudioContextCtor) {
		throw new Error('浏览器不支持 Web Audio API,换 Chrome / Safari 试试');
	}
	const ctx = new AudioContextCtor();
	try {
		const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
		const wavBuffer = encodeWav(audioBuffer);
		return new Blob([wavBuffer], { type: 'audio/wav' });
	} finally {
		try {
			await ctx.close();
		} catch {
			/* ignore */
		}
	}
}

function encodeWav(audio: AudioBuffer): ArrayBuffer {
	const numChannels = 1; // 声音克隆单声道足够
	const sampleRate = audio.sampleRate;
	const bitDepth = 16;

	// 多声道下混到 mono
	let channel: Float32Array;
	if (audio.numberOfChannels === 1) {
		channel = audio.getChannelData(0);
	} else {
		const left = audio.getChannelData(0);
		const right = audio.getChannelData(1);
		channel = new Float32Array(left.length);
		for (let i = 0; i < left.length; i++) {
			channel[i] = (left[i] + right[i]) / 2;
		}
	}

	const numFrames = channel.length;
	const bytesPerSample = bitDepth / 8;
	const dataSize = numFrames * numChannels * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	// RIFF header
	writeString(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true); // chunk size
	writeString(view, 8, 'WAVE');

	// fmt sub-chunk
	writeString(view, 12, 'fmt ');
	view.setUint32(16, 16, true); // fmt sub-chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
	view.setUint16(32, numChannels * bytesPerSample, true); // block align
	view.setUint16(34, bitDepth, true);

	// data sub-chunk
	writeString(view, 36, 'data');
	view.setUint32(40, dataSize, true);

	// PCM 16-bit signed
	let offset = 44;
	for (let i = 0; i < numFrames; i++) {
		const s = Math.max(-1, Math.min(1, channel[i]));
		view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
		offset += 2;
	}

	return buffer;
}

function writeString(view: DataView, offset: number, s: string) {
	for (let i = 0; i < s.length; i++) {
		view.setUint8(offset + i, s.charCodeAt(i));
	}
}

/** 选浏览器最支持的 MIME 类型给 MediaRecorder 用 */
export function pickRecorderMime(): string {
	const candidates = [
		'audio/webm;codecs=opus',
		'audio/webm',
		'audio/mp4',
		'audio/mp4;codecs=mp4a.40.2',
		'audio/ogg;codecs=opus',
	];
	for (const m of candidates) {
		if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
	}
	return ''; // 让浏览器自选
}
