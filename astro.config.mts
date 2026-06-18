import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	// TODO: 部署时改成候鸟 300 的实际 URL（如 https://houniao300.github.io 或自定义域名）
	site: 'https://example.github.io',
	// TODO: 部署时改成实际仓库名 / 子路径，根域名部署可改为 '/'
	base: 'houniao-300-gallery',
	vite: {
		plugins: [tailwindcss()],
	},
});
