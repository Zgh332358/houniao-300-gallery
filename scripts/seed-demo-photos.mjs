#!/usr/bin/env node
/**
 * seed-demo-photos.mjs
 *
 * 一次性把 4 位虚构 demo 艺术家 + 20 张 CC0 摄影作品塞进 Supabase,
 * 让线上站点不至于空空荡荡。再跑会在第一步检查到已 seed,默认中止,
 * 加 --force 跳过检查(会重复插行,自己看着办)。
 *
 * 用法:
 *   node scripts/seed-demo-photos.mjs           # 检查 + 执行
 *   node scripts/seed-demo-photos.mjs --force   # 跳过已 seed 检查
 *   node scripts/seed-demo-photos.mjs --dry     # 只打印计划,不写网络
 *
 * 图片来源: picsum.photos `seed` 模式 —— 每个 seed 字符串都映射到一张
 * 真实的 Unsplash 摄影作品,免费商用,且 URL 完全稳定(不依赖 ID 是几号)。
 *
 * Supabase 调用全部用 anon key(跟前端走的是同一把),依赖现有 RLS:
 *   - photos:  允许 anon INSERT(publish 流程在用)
 *   - artists: 允许 anon INSERT + UPDATE(migration 0001 设过)
 */

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// 配置 —— Supabase 公开信息,跟 site.config.mts 里一致。anon key 本来就是
// 进浏览器 bundle 的,放这里没安全损失。
// ---------------------------------------------------------------------------
const SUPABASE_URL = 'https://efvfkoxoilkqfsuuladv.supabase.co';
const SUPABASE_ANON =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdmZrb3hvaWxrcWZzdXVsYWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NzI1NDYsImV4cCI6MjA5NzM0ODU0Nn0.rLkYGFgtPmVg1xdXvZdraLTe7tYh4ZniV1HJtWEeHQY';
const PHOTOS_BUCKET = 'photos';

// 跟 src/lib/auth.ts:phoneHash 一致(normalizePhone + 'houniao300-2026' → SHA-256)
const HASH_SALT = 'houniao300-2026';
function phoneHashFull(phone) {
	const normalized = phone.replace(/[\s\-()]/g, '');
	return createHash('sha256').update(normalized + HASH_SALT).digest('hex');
}

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const DRY = args.has('--dry');

// ---------------------------------------------------------------------------
// Seed 数据 —— 4 位艺术家,每人一个作品集 5 张图。
// 标签 5 维(theme/style/medium/palette/mood)全部填满,主题在艺术家之间区分。
// ---------------------------------------------------------------------------

const D_LAND = { width: 1600, height: 1067 }; //  3:2 横构
const D_PORT = { width: 1067, height: 1600 }; //  2:3 竖构
const D_SQUARE = { width: 1200, height: 1200 };
const D_WIDE = { width: 1800, height: 900 };

const ARTISTS = [
	{
		slug: 'lin-mo',
		name: 'Lin Mo',
		bio: '上海 / 东京两地工作。在城市的边缘找安静的瞬间。',
		contact: 'demo: linmo@houniao300.example',
		phone: '15555550101',
		collection: { slug: 'night-streets', name: '深夜街道 / Night Streets' },
		photos: [
			{
				seed: 'lin-mo-1',
				unsplashId: '1502082553048-f009c37129b9',
				dim: D_LAND,
				title: '便利店窗外',
				titleEn: 'Outside the Convenience Store',
				description: '雨后,玻璃倒映着街灯。',
				descriptionEn: 'After the rain. Streetlights doubled in the glass.',
				tags: { theme: '都市', style: '街拍', medium: '数码', palette: '冷色', mood: '安静' },
				curatorNote: '光在玻璃的另一边稍稍迟疑了一下。',
			},
			{
				seed: 'lin-mo-2',
				unsplashId: '1518791841217-8f162f1e1131',
				dim: D_PORT,
				title: '弄堂深处',
				titleEn: 'Deeper Into the Lane',
				description: '一盏白炽灯,把巷子切成两半。',
				descriptionEn: 'A bare bulb halves the alley.',
				tags: { theme: '都市', style: '纪实', medium: '数码', palette: '暖色', mood: '怀旧' },
				curatorNote: '老城的呼吸藏在路灯之间。',
			},
			{
				seed: 'lin-mo-3',
				unsplashId: '1551269901-5c5e14c25df7',
				dim: D_WIDE,
				title: '末班电车',
				titleEn: 'Last Train',
				description: '车窗映出空座位,和远方的霓虹。',
				descriptionEn: 'Empty seats in the window. Neon far away.',
				tags: { theme: '都市', style: '街拍', medium: '数码', palette: '高对比', mood: '安静' },
				curatorNote: '一个人的夜行车厢,像在边缘上挪动。',
			},
			{
				seed: 'lin-mo-4',
				unsplashId: '1560343090-f0409e92791a',
				dim: D_SQUARE,
				title: '24:00 的便当店',
				titleEn: 'Bento Shop at Midnight',
				description: '收银台前,只剩一个人。',
				descriptionEn: 'Only one person left at the counter.',
				tags: { theme: '都市', style: '纪实', medium: '数码', palette: '暖色', mood: '亲密' },
				curatorNote: '深夜的便利店,是城市的客厅。',
			},
			{
				seed: 'lin-mo-5',
				unsplashId: '1493514789931-586cb221d7a7',
				dim: D_LAND,
				title: '过街天桥',
				titleEn: 'Pedestrian Bridge',
				description: '车流像被拉长的光。',
				descriptionEn: 'Traffic stretched into ribbons of light.',
				tags: { theme: '都市', style: '长曝光', medium: '数码', palette: '冷色', mood: '梦境' },
				curatorNote: '把 30 秒卷成一张照片。',
			},
		],
	},
	{
		slug: 'aiken',
		name: 'Aiken',
		bio: '山地徒步与海岸摄影。在地球的褶皱里找光。',
		contact: 'demo: aiken@houniao300.example',
		phone: '15555550102',
		collection: { slug: 'sea-and-mountain', name: '海与山 / Sea & Mountain' },
		photos: [
			{
				seed: 'aiken-1',
				unsplashId: '1506905925346-21bda4d32df4',
				dim: D_WIDE,
				title: '云海日出',
				titleEn: 'Cloud Sea, Sunrise',
				description: '光从远处的山脊上漫过来。',
				descriptionEn: 'Light spills over the distant ridge.',
				tags: { theme: '自然', style: '风光', medium: '数码', palette: '暖色', mood: '苍茫' },
				curatorNote: '云海有自己的潮汐。',
			},
			{
				seed: 'aiken-2',
				unsplashId: '1469474968028-56623f02e42e',
				dim: D_PORT,
				title: '雪线之上',
				titleEn: 'Above the Snowline',
				description: '岩石、冰、和一小块蓝。',
				descriptionEn: 'Stone, ice, and a small piece of blue.',
				tags: { theme: '自然', style: '风光', medium: '胶片', palette: '冷色', mood: '苍茫' },
				curatorNote: '风更小了,但更尖。',
			},
			{
				seed: 'aiken-3',
				unsplashId: '1500382017468-9049fed747ef',
				dim: D_LAND,
				title: '潮间带',
				titleEn: 'Tidal Zone',
				description: '退潮以后,礁石上还留着海的痕迹。',
				descriptionEn: 'After the tide, the rocks remember the sea.',
				tags: { theme: '自然', style: '纪实', medium: '数码', palette: '低饱和', mood: '安静' },
				curatorNote: '海退走的时候是斜的。',
			},
			{
				seed: 'aiken-4',
				unsplashId: '1465101046530-73398c7f28ca',
				dim: D_SQUARE,
				title: '高原湖泊',
				titleEn: 'Alpine Lake',
				description: '镜面,然后被一只鸟划破。',
				descriptionEn: 'A mirror, broken by a single bird.',
				tags: { theme: '自然', style: '风光', medium: '数码', palette: '冷色', mood: '梦境' },
				curatorNote: '湖在等一只鸟。',
			},
			{
				seed: 'aiken-5',
				unsplashId: '1431512284068-4c4002298068',
				dim: D_LAND,
				title: '黑沙滩',
				titleEn: 'Black Sand Beach',
				description: '火山岩与浪,一明一暗。',
				descriptionEn: 'Volcanic sand against breaking waves.',
				tags: { theme: '自然', style: '风光', medium: '黑白胶片', palette: '高对比', mood: '紧张' },
				curatorNote: '黑白之间没有缓冲。',
			},
		],
	},
	{
		slug: 'mira-chen',
		name: 'Mira Chen',
		bio: '肖像与日常,记录身边人不经意的神情。',
		contact: 'demo: mira@houniao300.example',
		phone: '15555550103',
		collection: { slug: 'unnamed-faces', name: '未署名的脸 / Unnamed Faces' },
		photos: [
			{
				seed: 'mira-1',
				unsplashId: '1518972559570-7cc1309f3229',
				dim: D_PORT,
				title: '阳台午后',
				titleEn: 'Afternoon, on the Balcony',
				description: '光从窗帘的缝隙漏下来。',
				descriptionEn: 'Light leaks through the curtain.',
				tags: { theme: '人像', style: '肖像', medium: '胶片', palette: '暖色', mood: '亲密' },
				curatorNote: '她没看镜头,镜头先看了她。',
			},
			{
				seed: 'mira-2',
				unsplashId: '1494790108377-be9c29b29330',
				dim: D_SQUARE,
				title: '镜中',
				titleEn: 'In the Mirror',
				description: '两张脸,只是同一个人。',
				descriptionEn: 'Two faces. The same person.',
				tags: { theme: '人像', style: '肖像', medium: '数码', palette: '低饱和', mood: '亲密' },
				curatorNote: '镜子是一种简陋的他者。',
			},
			{
				seed: 'mira-3',
				unsplashId: '1554080353-a576cf803bda',
				dim: D_PORT,
				title: '咖啡馆',
				titleEn: 'At the Café',
				description: '杯子蒸起一点雾,挡住眼睛。',
				descriptionEn: 'Steam rises and blurs the eyes.',
				tags: { theme: '人像', style: '纪实', medium: '数码', palette: '暖色', mood: '怀旧' },
				curatorNote: '35mm 焦段,刚刚够诚实。',
			},
			{
				seed: 'mira-4',
				unsplashId: '1414235077428-338989a2e8c0',
				dim: D_LAND,
				title: '初见',
				titleEn: 'First Time We Met',
				description: '她说话的时候,手在杯沿上转。',
				descriptionEn: 'She talked while turning the cup.',
				tags: { theme: '人像', style: '肖像', medium: '数码', palette: '低饱和', mood: '亲密' },
				curatorNote: '注意手指,有时候手指比脸更说话。',
			},
			{
				seed: 'mira-5',
				unsplashId: '1492321936769-b49830bc1d1e',
				dim: D_PORT,
				title: '雨季的眼睛',
				titleEn: 'Eyes in the Rainy Season',
				description: '玻璃后面,光只剩一种颜色。',
				descriptionEn: 'Behind the glass, light has only one color.',
				tags: { theme: '人像', style: '肖像', medium: '数码', palette: '冷色', mood: '梦境' },
				curatorNote: '湿气让肖像变得安静。',
			},
		],
	},
	{
		slug: 'yuki-sato',
		name: 'Yuki Sato',
		bio: '极简与材质。建筑表面、几何阴影、单色构图。',
		contact: 'demo: yuki@houniao300.example',
		phone: '15555550104',
		collection: { slug: 'form-and-shadow', name: '形与影 / Form & Shadow' },
		photos: [
			{
				seed: 'yuki-1',
				unsplashId: '1444065381814-865dc9da92c0',
				dim: D_SQUARE,
				title: '光的研究 #03',
				titleEn: 'Study of Light #03',
				description: '正方形里只放进去一条对角线。',
				descriptionEn: 'One diagonal line in a square.',
				tags: { theme: '抽象', style: '极简', medium: '数码', palette: '黑白', mood: '安静' },
				curatorNote: '极简不是少,是只剩本质。',
			},
			{
				seed: 'yuki-2',
				unsplashId: '1441974231531-c6227db76b6e',
				dim: D_LAND,
				title: '混凝土与天',
				titleEn: 'Concrete & Sky',
				description: '两种灰,中间是一道直线。',
				descriptionEn: 'Two greys, with one line between.',
				tags: { theme: '抽象', style: '建筑', medium: '数码', palette: '低饱和', mood: '安静' },
				curatorNote: '建筑师在用混凝土写诗。',
			},
			{
				seed: 'yuki-3',
				unsplashId: '1454496522488-7a8e488e8606',
				dim: D_PORT,
				title: '楼梯,正午',
				titleEn: 'Stairs at Noon',
				description: '阳光把楼梯切成了交替的三角。',
				descriptionEn: 'Noon light cuts the stairs into triangles.',
				tags: { theme: '抽象', style: '几何', medium: '胶片', palette: '高对比', mood: '紧张' },
				curatorNote: '正午的光最不留情。',
			},
			{
				seed: 'yuki-4',
				unsplashId: '1470770841072-f978cf4d019e',
				dim: D_WIDE,
				title: '色场',
				titleEn: 'Color Field',
				description: '没有焦点,只有色块的呼吸。',
				descriptionEn: 'No subject. Just color breathing.',
				tags: { theme: '抽象', style: '抽象表现', medium: '数码', palette: '暖色', mood: '梦境' },
				curatorNote: '让眼睛迷路一会儿。',
			},
			{
				seed: 'yuki-5',
				unsplashId: '1539571696357-5a69c17a67c6',
				dim: D_SQUARE,
				title: '反射 12',
				titleEn: 'Reflection 12',
				description: '玻璃幕墙把街道折成了几何。',
				descriptionEn: 'Curtain wall folds the street into geometry.',
				tags: { theme: '抽象', style: '建筑', medium: '数码', palette: '冷色', mood: '紧张' },
				curatorNote: '城市照见自己的时候并不温柔。',
			},
		],
	},
];

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const SB_HEADERS = {
	apikey: SUPABASE_ANON,
	Authorization: `Bearer ${SUPABASE_ANON}`,
};

async function sbFetch(path, init = {}) {
	const res = await fetch(`${SUPABASE_URL}${path}`, {
		...init,
		headers: { ...SB_HEADERS, ...(init.headers || {}) },
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`HTTP ${res.status} ${res.statusText} on ${path}\n${body.slice(0, 400)}`);
	}
	return res;
}

async function insertArtistIfNew(a) {
	if (DRY) {
		console.log(`  [dry] insert artist ${a.slug} (${a.name})`);
		return 'dry';
	}
	// 走纯 INSERT,不用 upsert —— 线上 anon UPDATE 在某些 Supabase 实例上
	// 被 RLS 静默拒(虽然 migration 0001 写过 update policy 但实际没生效)。
	// 重复 slug 会拿到 409 + 23505,直接跳过即可:demo seed 只需要 artist 存在,
	// 不必每次 seed 都覆写 bio/contact。
	const res = await fetch(`${SUPABASE_URL}/rest/v1/artists`, {
		method: 'POST',
		headers: {
			...SB_HEADERS,
			'Content-Type': 'application/json',
			Prefer: 'return=minimal',
		},
		body: JSON.stringify({
			slug: a.slug,
			name: a.name,
			bio: a.bio,
			contact: a.contact,
			phone_hash: phoneHashFull(a.phone),
		}),
	});
	if (res.status === 409) return 'exists';
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`HTTP ${res.status} on artists insert\n${body.slice(0, 400)}`);
	}
	return 'inserted';
}

async function downloadUnsplash(unsplashId, width, height) {
	// Unsplash CDN 直链:固定 photo-{id}.&fit=crop 强制按目标 w/h 裁剪,
	// 跟 DB 行的 width/height 字段对齐。免费商用 / 免 attribution / 无 API key。
	const url = `https://images.unsplash.com/photo-${unsplashId}?w=${width}&h=${height}&fit=crop&q=85&auto=format`;
	const res = await fetch(url, { redirect: 'follow' });
	if (!res.ok) throw new Error(`unsplash ${unsplashId} HTTP ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

async function uploadPhotoBlob(buf, storagePath) {
	if (DRY) {
		console.log(`  [dry] upload → ${storagePath} (${buf.length} bytes)`);
		return;
	}
	await sbFetch(`/storage/v1/object/${PHOTOS_BUCKET}/${storagePath}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'image/jpeg',
			'x-upsert': 'true',
		},
		body: buf,
	});
}

async function insertPhotoRow(row) {
	if (DRY) {
		console.log(`  [dry] insert photos row for ${row.storage_path}`);
		return;
	}
	await sbFetch(`/rest/v1/photos`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Prefer: 'return=minimal',
		},
		body: JSON.stringify(row),
	});
}

async function existingDemoCount() {
	const slugs = ARTISTS.map((a) => a.slug)
		.map((s) => `"${s}"`)
		.join(',');
	const res = await sbFetch(
		`/rest/v1/photos?select=id&artist_slug=in.(${slugs})`,
		{ headers: { Prefer: 'count=exact' } },
	);
	const rows = await res.json();
	return Array.isArray(rows) ? rows.length : 0;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
	console.log(`▶ seed-demo-photos · ${ARTISTS.length} 位艺术家 · 共 ${ARTISTS.reduce((n, a) => n + a.photos.length, 0)} 张图`);
	if (DRY) console.log('  模式: --dry (只打印,不写网络)');
	if (FORCE) console.log('  模式: --force (跳过已 seed 检查)');

	// 1. 已 seed 检查
	if (!FORCE && !DRY) {
		const n = await existingDemoCount();
		if (n > 0) {
			console.error(
				`\n✗ 已经检测到 ${n} 张属于 demo 艺术家(${ARTISTS.map((a) => a.slug).join('/')})的 photos 行。\n` +
					`  默认中止,避免重复插行。\n` +
					`  - 想强行再跑一遍: node scripts/seed-demo-photos.mjs --force\n` +
					`  - 想清掉重来: 到 Supabase SQL Editor 执行\n` +
					`    DELETE FROM public.photos WHERE artist_slug IN ('${ARTISTS.map((a) => a.slug).join(`','`)}');\n` +
					`    DELETE FROM public.artists WHERE slug IN ('${ARTISTS.map((a) => a.slug).join(`','`)}');\n`,
			);
			process.exit(1);
		}
	}

	// 2. INSERT 4 位艺术家(重复 slug 跳过,不更新)
	console.log('\n① insert artists (纯 INSERT,重复 slug 跳过)');
	for (const a of ARTISTS) {
		const r = await insertArtistIfNew(a);
		const tag = r === 'exists' ? '↺ 已存在,跳过' : r === 'dry' ? '[dry]' : '✓';
		console.log(`  ${tag} ${a.slug} (${a.name})`);
	}

	// 3. 每位艺术家依次下载 + 上传 + INSERT
	console.log('\n② 下载 → 上传 → 写元数据');
	let total = 0;
	for (const a of ARTISTS) {
		for (let i = 0; i < a.photos.length; i++) {
			const p = a.photos[i];
			const filename = `${p.seed}.jpg`;
			const storagePath = `${a.slug}/${a.collection.slug}/${filename}`;
			process.stdout.write(`  · ${a.slug}/${p.seed} ... `);
			try {
				if (DRY) {
					console.log(`[dry] would fetch unsplash ${p.unsplashId} → ${storagePath}`);
					total++;
					continue;
				}
				const buf = await downloadUnsplash(p.unsplashId, p.dim.width, p.dim.height);
				await uploadPhotoBlob(buf, storagePath);
				await insertPhotoRow({
					artist_slug: a.slug,
					artist_name: a.name,
					artist_contact: a.contact,
					collection_slug: a.collection.slug,
					collection_name: a.collection.name,
					title: p.title,
					title_en: p.titleEn,
					description: p.description,
					description_en: p.descriptionEn,
					storage_path: storagePath,
					width: p.dim.width,
					height: p.dim.height,
					format: 'jpg',
					tags: p.tags,
					curator_note: p.curatorNote,
					owner_hash: phoneHashFull(a.phone),
				});
				total++;
				console.log('✓');
			} catch (e) {
				console.log(`✗ ${e.message}`);
				throw e;
			}
		}
	}

	console.log(`\n✓ 全部完成。已 seed: ${ARTISTS.length} 位艺术家 · ${total} 张作品`);
	console.log(`  → 刷新首页应该能看到 marquee 流动起来了`);
	console.log(`  → 各艺术家页 URL(/<phoneHash前8>/<slug>/):`);
	for (const a of ARTISTS) {
		const h8 = phoneHashFull(a.phone).slice(0, 8);
		console.log(`     /${h8}/${a.slug}/  (${a.name})`);
	}
}

main().catch((e) => {
	console.error('\n✗ 失败:', e.message);
	process.exit(1);
});
