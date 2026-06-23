/**
 * 「动态展示」三种 layout 的 viewer 实现。
 * 入口 renderShow(container, layout, photos) —— 切换时整个 container
 * 内部 reset(unmount Swiper / 清 DOM)然后 mount 新的。
 *
 * Coverflow + Cards 走 Swiper(MIT, https://swiperjs.com/)。
 * Snap 走纯 CSS scroll-snap-y mandatory + IntersectionObserver fade-in。
 *
 * photos 数组顺序就是展示顺序 —— 调用方负责按 photoIds 过滤好。
 */

import Swiper from 'swiper';
import { EffectCoverflow, EffectCards, Keyboard, Mousewheel } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/effect-cards';

import { deliveryUrl, type PhotoEntry } from '../lib/photos';

let _activeSwiper: Swiper | null = null;
let _activeObserver: IntersectionObserver | null = null;

/** 进入 show 视图前清掉之前 mount 的 Swiper / Observer,避免内存泄漏 */
function teardown() {
	if (_activeSwiper) {
		try {
			_activeSwiper.destroy(true, true);
		} catch {
			/* ignore */
		}
		_activeSwiper = null;
	}
	if (_activeObserver) {
		_activeObserver.disconnect();
		_activeObserver = null;
	}
}

/** 三选一入口 */
export function renderShow(
	container: HTMLElement,
	layout: 'coverflow' | 'cards' | 'snap',
	photos: PhotoEntry[],
): void {
	teardown();
	container.innerHTML = '';
	container.removeAttribute('class');
	container.className = 'show-viewer';
	if (photos.length === 0) {
		container.innerHTML =
			'<div class="text-center py-32 text-gray-400">这个展示没有图片</div>';
		return;
	}

	switch (layout) {
		case 'coverflow':
			renderCoverflow(container, photos);
			break;
		case 'cards':
			renderCards(container, photos);
			break;
		case 'snap':
			renderSnap(container, photos);
			break;
	}
}

/* ---------- Coverflow ---------- */

function renderCoverflow(container: HTMLElement, photos: PhotoEntry[]) {
	container.classList.add('show-coverflow');
	const swiperEl = document.createElement('div');
	swiperEl.className = 'swiper show-coverflow-swiper';
	const wrapper = document.createElement('div');
	wrapper.className = 'swiper-wrapper';
	for (const p of photos) {
		const slide = document.createElement('div');
		slide.className = 'swiper-slide';
		const img = document.createElement('img');
		img.src = deliveryUrl(p, { width: 1400 });
		img.alt = p.meta.title || '';
		img.loading = 'lazy';
		img.draggable = false;
		slide.appendChild(img);
		if (p.meta.title) {
			const cap = document.createElement('div');
			cap.className = 'show-caption';
			cap.textContent = p.meta.title;
			slide.appendChild(cap);
		}
		wrapper.appendChild(slide);
	}
	swiperEl.appendChild(wrapper);
	container.appendChild(swiperEl);

	_activeSwiper = new Swiper(swiperEl, {
		modules: [EffectCoverflow, Keyboard, Mousewheel],
		effect: 'coverflow',
		grabCursor: true,
		centeredSlides: true,
		slidesPerView: 'auto',
		loop: photos.length >= 4,
		coverflowEffect: {
			rotate: 28,
			stretch: 0,
			depth: 220,
			modifier: 1,
			slideShadows: true,
		},
		keyboard: { enabled: true },
		mousewheel: { forceToAxis: true, sensitivity: 0.6 },
	});
}

/* ---------- Cards ---------- */

function renderCards(container: HTMLElement, photos: PhotoEntry[]) {
	container.classList.add('show-cards');
	const swiperEl = document.createElement('div');
	swiperEl.className = 'swiper show-cards-swiper';
	const wrapper = document.createElement('div');
	wrapper.className = 'swiper-wrapper';
	for (const p of photos) {
		const slide = document.createElement('div');
		slide.className = 'swiper-slide';
		const inner = document.createElement('div');
		inner.className = 'show-card-inner';
		const img = document.createElement('img');
		img.src = deliveryUrl(p, { width: 1200 });
		img.alt = p.meta.title || '';
		img.loading = 'lazy';
		img.draggable = false;
		inner.appendChild(img);
		if (p.meta.title) {
			const cap = document.createElement('div');
			cap.className = 'show-caption show-caption-cards';
			cap.textContent = p.meta.title;
			inner.appendChild(cap);
		}
		slide.appendChild(inner);
		wrapper.appendChild(slide);
	}
	swiperEl.appendChild(wrapper);
	container.appendChild(swiperEl);

	_activeSwiper = new Swiper(swiperEl, {
		modules: [EffectCards, Keyboard],
		effect: 'cards',
		grabCursor: true,
		keyboard: { enabled: true },
		cardsEffect: {
			perSlideOffset: 8,
			perSlideRotate: 2,
			rotate: true,
			slideShadows: true,
		},
	});
}

/* ---------- Snap (纯 CSS) ---------- */

function renderSnap(container: HTMLElement, photos: PhotoEntry[]) {
	container.classList.add('show-snap');
	const scroller = document.createElement('div');
	scroller.className = 'show-snap-scroller';
	for (const p of photos) {
		const slide = document.createElement('section');
		slide.className = 'show-snap-slide';
		const img = document.createElement('img');
		img.src = deliveryUrl(p, { width: 1800 });
		img.alt = p.meta.title || '';
		img.loading = 'lazy';
		slide.appendChild(img);
		if (p.meta.title) {
			const cap = document.createElement('div');
			cap.className = 'show-caption show-caption-snap';
			cap.textContent = p.meta.title;
			slide.appendChild(cap);
		}
		scroller.appendChild(slide);
	}
	container.appendChild(scroller);

	// IntersectionObserver 触发 in-view fade
	_activeObserver = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				e.target.classList.toggle('in-view', e.isIntersecting);
			}
		},
		{ threshold: 0.5 },
	);
	for (const slide of Array.from(scroller.querySelectorAll('.show-snap-slide'))) {
		_activeObserver.observe(slide);
	}
}
