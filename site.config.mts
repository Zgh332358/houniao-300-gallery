import type { AstroInstance } from 'astro';
import { Instagram } from 'lucide-astro';
import Xiaohongshu from './src/components/icons/XiaohongshuIcon.astro';

export interface SocialLink {
	name: string;
	/** 网页兜底链接（桌面端 / 未安装 App / JS 不可用时使用） */
	url: string;
	icon: AstroInstance;
	/** App 深链（scheme）。填了之后，移动端点击会优先唤起 App，唤起失败再回退到 url */
	appUrl?: string;
}

export interface SupabaseConfig {
	url: string;
	anonKey: string;
	bucket: string;
}

export default {
	// 站点品牌
	title: '候鸟 300',
	owner: '候鸟 300',
	tagline: '候鸟 300 艺术家驻地 · 线上作品展示平台',
	favicon: 'favicon.svg',

	// Supabase 配置（live 模式 — 多端同步）
	supabase: {
		url: 'https://efvfkoxoilkqfsuuladv.supabase.co',
		anonKey:
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdmZrb3hvaWxrcWZzdXVsYWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NzI1NDYsImV4cCI6MjA5NzM0ODU0Nn0.rLkYGFgtPmVg1xdXvZdraLTe7tYh4ZniV1HJtWEeHQY',
		bucket: 'photos',
	} as SupabaseConfig,

	// 社交 / 联系入口（TODO: 把 URL 替换为候鸟 300 的真实小红书 / Instagram 主页）
	socialLinks: [
		{
			name: '小红书',
			// TODO: 换成候鸟 300 的主页，如 https://www.xiaohongshu.com/user/profile/<你的id>
			url: 'https://www.xiaohongshu.com/',
			icon: Xiaohongshu,
			// 移动端优先唤起小红书 App。有主页后改为 xhsdiscover://user/<你的id> 可直达主页
			appUrl: 'xhsdiscover://',
		} as SocialLink,
		{
			name: 'Instagram',
			url: 'https://www.instagram.com/',
			icon: Instagram,
		} as SocialLink,
	],
};
