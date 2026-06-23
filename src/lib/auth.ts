/**
 * 简单手机登录(荣誉系统)的会话层。
 *
 * 关键决策(见 plans/curious-swimming-sloth.md):
 *  - 不存明文手机号,只存 SHA-256(phone + 'houniao300-2026')
 *  - localStorage `pf:auth:v1` 存 { phone, slug, expiresAt },14 天过期
 *  - 没 PIN / 没 SMS,这就是"识别"不是"鉴权"
 *  - 1 phone : 1 slug,绑定后客户端层面锁死(实际 DB 还是 anon 可写,荣誉系统)
 */

const KEY = 'pf:auth:v1';
const SALT = 'houniao300-2026';
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface Session {
	/** 原始手机号(用户输入的,带不带 + 都行,会原样保留以便 UI 显示) */
	phone: string;
	/** 这个手机号绑定的 artist slug;首次注册期间为空字符串 */
	slug: string;
	/** ms 时间戳,过期就当未登录 */
	expiresAt: number;
}

/* ---------- 哈希 ---------- */

/**
 * 浏览器端 SHA-256(phone + SALT),返回 64-char lowercase hex。
 * 服务端从来不接受明文 phone —— 登录查询、注册写入都只发这串 hash。
 */
export async function phoneHash(phone: string): Promise<string> {
	const normalized = normalizePhone(phone);
	const data = new TextEncoder().encode(normalized + SALT);
	const buf = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** 取完整 hash 前 8 位作 URL 短句柄。所有权判定要用完整 64 字符,不能用这个。 */
export function phoneHashShort(hashFull: string): string {
	return hashFull.slice(0, 8);
}

/**
 * 把用户输入的手机号收成统一形态用于 hash:
 *  - 去掉所有空格、连字符、括号
 *  - 不强制 +86 前缀(国际艺术家也能用),用户输啥 hash 啥
 */
export function normalizePhone(input: string): string {
	return input.replace(/[\s\-()]/g, '');
}

/**
 * 给 UI 显示用的"打码"形态:138****1234。规则:留前 3 后 4 中间星号,
 * 太短就不打码(无意义,只是个识别码),原样返回。
 */
export function maskPhone(phone: string): string {
	const s = normalizePhone(phone);
	if (s.length < 8) return s;
	const head = s.slice(0, s.length - 8);
	const tail = s.slice(-4);
	return head + '****' + tail;
}

/* ---------- 会话(localStorage) ---------- */

export function getSession(): Session | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const s = JSON.parse(raw) as Session;
		if (!s || !s.phone || typeof s.expiresAt !== 'number') return null;
		if (Date.now() > s.expiresAt) {
			localStorage.removeItem(KEY);
			return null;
		}
		return { phone: s.phone, slug: s.slug || '', expiresAt: s.expiresAt };
	} catch {
		return null;
	}
}

/**
 * 写会话。phone 用于 UI 显示,slug 是绑定的画廊(注册中可能是空字符串)。
 * 每次 set 都续期 14 天,这样活跃用户不掉线。
 */
export function setSession(phone: string, slug: string): void {
	if (typeof localStorage === 'undefined') return;
	const next: Session = {
		phone: normalizePhone(phone),
		slug,
		expiresAt: Date.now() + TTL_MS,
	};
	localStorage.setItem(KEY, JSON.stringify(next));
}

/** 只更新已有会话的 slug 字段(注册成功时把刚拿到的 slug 补进去) */
export function bindSlugToSession(slug: string): void {
	const cur = getSession();
	if (!cur) return;
	setSession(cur.phone, slug);
}

export function clearSession(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(KEY);
}

export function isLoggedIn(): boolean {
	return getSession() !== null;
}

/** 已绑定 slug(即不是"首次注册中"那种半截状态) */
export function hasBoundSlug(): boolean {
	const s = getSession();
	return !!(s && s.slug);
}

/**
 * 拿会话,没拿到就抛 —— 给 publish 这种"必须登录才能进"的入口用。
 */
export function requireSession(): Session {
	const s = getSession();
	if (!s) throw new Error('未登录:回 /login 输入手机号');
	return s;
}
