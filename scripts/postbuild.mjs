#!/usr/bin/env node
/**
 * postbuild：把 dist/__artist__/index.html 复制成 dist/404.html。
 *
 * GitHub Pages 对未知路径会返回 404.html。我们把 [artist].astro 的占位
 * HTML 当 404 壳，里面的 JS 解析 location.pathname 取出 artist slug，
 * 再客户端 fetch Cloudinary 数据渲染。这样 /<artist-slug>/ 直链就能用。
 */

import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const src = path.join(dist, '__artist__', 'index.html');
const dst = path.join(dist, '404.html');

if (!fs.existsSync(src)) {
	console.warn(`[postbuild] skip: ${src} 不存在 (build 是否完成?)`);
	process.exit(0);
}

fs.copyFileSync(src, dst);
console.log(`[postbuild] ${path.relative(process.cwd(), dst)} 已生成 (artist fallback)`);
