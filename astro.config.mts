import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	site: 'https://zgh332358.github.io',
	base: 'houniao-300-gallery',
	vite: {
		plugins: [tailwindcss()],
	},
});
