import fs from 'node:fs';
import path from 'node:path';
import {lintRule} from 'unified-lint-rule';
import {visit} from 'unist-util-visit';

const badgeSourceUrlAllowList = new Set([
	'https://awesome.re/badge.svg',
	'https://awesome.re/badge-flat.svg',
	'https://awesome.re/badge-flat2.svg',
]);

const isBadgeImage = url => {
	if (typeof url !== 'string') {
		return false;
	}

	return badgeSourceUrlAllowList.has(url) || /(?:badge|shields)\.io|\/badge(?:[./?]|$)/i.test(url);
};

const stripQueryString = url => url.split(/[?#]/, 1)[0];
const isSvg = url => stripQueryString(url).toLowerCase().endsWith('.svg');
const isHiDpiFilename = url => /@2x|\b2x\b/i.test(stripQueryString(url));

const readImageDimensions = filePath => {
	const buffer = fs.readFileSync(filePath);

	if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
		return {
			width: buffer.readUInt32BE(16),
			height: buffer.readUInt32BE(20),
		};
	}

	if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
		return;
	}

	let offset = 2;
	while (offset < buffer.length) {
		if (buffer[offset] !== 0xFF) {
			offset++;
			continue;
		}

		const marker = buffer[offset + 1];
		offset += 2;

		if (marker === 0xD9 || marker === 0xDA || offset + 2 > buffer.length) {
			break;
		}

		const size = buffer.readUInt16BE(offset);
		if (size < 2 || offset + size > buffer.length) {
			break;
		}

		if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
			return {
				height: buffer.readUInt16BE(offset + 3),
				width: buffer.readUInt16BE(offset + 5),
			};
		}

		offset += size;
	}
};

const parseImageTags = value => {
	const images = [];

	for (const match of value.matchAll(/<img\s+[^>]*>/gi)) {
		const tag = match[0];
		const url = /src\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
		const width = Number.parseInt(/width\s*=\s*["']?(\d+)["']?/i.exec(tag)?.[1], 10);
		const height = Number.parseInt(/height\s*=\s*["']?(\d+)["']?/i.exec(tag)?.[1], 10);

		if (url) {
			images.push({
				url,
				node: {type: 'html', value: tag},
				width: Number.isFinite(width) ? width : undefined,
				height: Number.isFinite(height) ? height : undefined,
			});
		}
	}

	return images;
};

const getImagesFromHeading = node => {
	const images = [];

	visit(node, imageNode => imageNode.type === 'image', imageNode => {
		images.push({
			url: imageNode.url,
			node: imageNode,
		});
	});

	return images;
};

const findHeaderImages = ast => {
	const children = ast.children ?? [];
	const firstH1Index = children.findIndex(node => node.type === 'heading' && node.depth === 1);

	if (firstH1Index === -1) {
		return [];
	}

	const images = getImagesFromHeading(children[firstH1Index]);

	for (let index = firstH1Index + 1; index < children.length; index++) {
		const node = children[index];

		if (node.type === 'html') {
			images.push(...parseImageTags(node.value).map(image => ({...image, node})));
			continue;
		}

		if (node.type === 'paragraph') {
			for (const child of node.children ?? []) {
				if (child.type === 'image') {
					images.push({
						url: child.url,
						node: child,
					});
				}
			}

			continue;
		}

		break;
	}

	return images.filter(image => !isBadgeImage(image.url));
};

const hasDoublePixelDimensions = ({url, width, height, cwd}) => {
	if (!width || !height || /^https?:\/\//i.test(url)) {
		return false;
	}

	const filePath = path.resolve(cwd, url);
	if (!fs.existsSync(filePath)) {
		return false;
	}

	const dimensions = readImageDimensions(filePath);

	return dimensions && dimensions.width >= width * 2 && dimensions.height >= height * 2;
};

const isAcceptableHeaderImage = ({url, width, height, cwd}) => isSvg(url) || isHiDpiFilename(url) || hasDoublePixelDimensions({
	url,
	width,
	height,
	cwd,
});

const headerImageRule = lintRule('remark-lint:awesome-header-image', (ast, file) => {
	const cwd = path.dirname(file.path ?? '.');

	for (const image of findHeaderImages(ast)) {
		if (!isAcceptableHeaderImage({...image, cwd})) {
			file.message('Header image must be SVG or high-DPI', image.node);
			return;
		}
	}
});

export default headerImageRule;
