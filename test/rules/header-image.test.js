import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {before, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import remarkLint from 'remark-lint';
import lint from '../_lint.js';
import headerImageRule from '../../rules/header-image.js';

describe('rules › header image', () => {
	const config = {
		plugins: [
			remarkLint,
			headerImageRule,
		],
	};

	let fixtureDirectory;
	let logoPath;
	let fixtureIndex = 0;

	before(async () => {
		fixtureDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'awesome-lint-header-image-'));
		logoPath = path.relative(fixtureDirectory, path.resolve('media/logo.png')).replaceAll(path.sep, '/');
	});

	const createFixture = async content => {
		const filename = path.join(fixtureDirectory, `fixture-${fixtureIndex++}.md`);
		await fs.writeFile(filename, content);
		return filename;
	};

	it('header image - rejects a low-DPI raster image after the H1', async () => {
		const filename = await createFixture(`# Awesome [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

<img src="${logoPath}" width="900" height="600">
`);

		const messages = await lint({config, filename});
		assert.deepEqual(messages, [
			{
				line: 3,
				ruleId: 'awesome-header-image',
				message: 'Header image must be SVG or high-DPI',
			},
		]);
	});

	it('header image - accepts SVG after the H1', async () => {
		const filename = await createFixture(`# Awesome [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

<img src="https://example.com/header.svg">
`);

		const messages = await lint({config, filename});
		assert.deepEqual(messages, []);
	});

	it('header image - accepts @2x raster filename', async () => {
		const filename = await createFixture(`# Awesome [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

<img src="https://example.com/header@2x.png" width="900" height="600">
`);

		const messages = await lint({config, filename});
		assert.deepEqual(messages, []);
	});

	it('header image - accepts local raster images with 2x pixel dimensions', async () => {
		const filename = await createFixture(`# Awesome [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

<img src="${logoPath}" width="400" height="300">
`);

		const messages = await lint({config, filename});
		assert.deepEqual(messages, []);
	});
});
