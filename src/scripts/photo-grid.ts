import justifiedLayout from 'justified-layout';
import GLightbox from 'glightbox';

interface JustifiedLayoutResult {
	containerHeight: number;
	widowCount: number;
	boxes: LayoutBox[];
}

interface LayoutBox {
	aspectRatio: number;
	top: number;
	width: number;
	height: number;
	left: number;
	forcedAspectRatio?: boolean;
}

let lightbox: ReturnType<typeof GLightbox> | null = null;

/**
 * 销毁当前 GLightbox 实例并清理 grid 的内联样式。
 * 在重新渲染图片之前调用，避免事件监听重复绑定。
 */
export function teardownGallery() {
	if (lightbox) {
		try {
			lightbox.destroy();
		} catch {
			/* 忽略 */
		}
		lightbox = null;
	}
}

export async function setupGallery() {
	if (typeof document === 'undefined') return;

	const container = document.getElementById('photo-grid');
	if (!container) return;

	const imageLinks = Array.from(container.querySelectorAll('.photo-item')) as HTMLElement[];
	if (imageLinks.length === 0) return;

	const imageElements = await waitForImagesToLoad(container);
	const layout = createLayoutFor(imageElements, container);

	applyImagesStyleBasedOnLayout(imageLinks, layout);
	applyContainerStyleBasedOnLayout(container, layout);

	// 重新初始化前先销毁，避免重复绑定
	teardownGallery();
	lightbox = GLightbox({
		selector: '.glightbox',
		openEffect: 'zoom',
		closeEffect: 'fade',
		width: 'auto',
		height: 'auto',
	});
}

function createLayoutFor(
	imageElements: HTMLImageElement[],
	container: HTMLElement,
): JustifiedLayoutResult {
	const imageSizes = imageElements.map((img) => ({
		width: img.naturalWidth || img.width || 300,
		height: img.naturalHeight || img.height || 200,
	}));

	const containerWidth = container.clientWidth || window.innerWidth;
	// 移动端窄屏（< 640px sm 断点）行高减半，避免单张图片占满整屏
	const targetRowHeight = containerWidth < 640 ? 180 : 300;
	const boxSpacing = containerWidth < 640 ? 6 : 10;

	const layout = justifiedLayout(imageSizes, {
		containerWidth,
		targetRowHeight,
		boxSpacing,
		containerPadding: 0,
	});
	return layout;
}

async function waitForImagesToLoad(container: HTMLElement) {
	const imageElements = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];

	await Promise.all(
		imageElements.map(
			(img) =>
				new Promise((resolve) => {
					if (img.complete) {
						resolve(null);
					} else {
						img.onload = () => resolve(null);
						img.onerror = () => resolve(null);
					}
				}),
		),
	);
	return imageElements;
}

function applyImagesStyleBasedOnLayout(imageLinks: HTMLElement[], layout: JustifiedLayoutResult) {
	imageLinks.forEach((el, i) => {
		if (!layout.boxes[i]) return;
		const { left, top, width, height } = layout.boxes[i];

		el.style.position = 'absolute';
		el.style.left = `${left}px`;
		el.style.top = `${top}px`;
		el.style.width = `${width}px`;
		el.style.height = `${height}px`;
		el.style.display = 'block';
	});
}

function applyContainerStyleBasedOnLayout(container: HTMLElement, layout: JustifiedLayoutResult) {
	container.style.position = 'relative';
	container.style.height = `${layout.containerHeight}px`;
}

if (typeof window !== 'undefined') {
	const debouncedSetup = debounce(setupGallery, 250);

	document.addEventListener('DOMContentLoaded', () => {
		// 仅在 DOM 已存在 .photo-item 时跑（构建时由 yaml 注入图片的页面）。
		// 客户端动态渲染页面会自行调用 setupGallery()。
		const grid = document.getElementById('photo-grid');
		if (grid && grid.querySelector('.photo-item')) setupGallery();
	});
	window.addEventListener('resize', debouncedSetup);
}

function debounce<T extends (...args: unknown[]) => unknown>(func: T, wait: number) {
	let timeout: ReturnType<typeof setTimeout>;
	return function executedFunction(...args: Parameters<T>) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}
