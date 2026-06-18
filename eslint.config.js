import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import astroPlugin from 'eslint-plugin-astro';
import astroParser from 'astro-eslint-parser';
import globals from 'globals';

export default [
	js.configs.recommended,
	{
		ignores: ['dist/**', '.astro/**', 'node_modules/**', '.cache/**'],
	},

	// Node 端脚本（postbuild 等）— 让 console / process 等全局可见
	{
		files: ['scripts/**/*.{js,mjs}', '*.config.{js,mjs}'],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},

	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: './tsconfig.json',
				sourceType: 'module',
			},
			globals: {
				...globals.node,
				...globals.browser,
			},
		},
		plugins: {
			'@typescript-eslint': ts,
		},
		rules: {
			...ts.configs.recommended.rules,
			// 下划线前缀豁免：故意标记的未使用参数/变量 (_tag, _entry 等) 不报错
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
		},
	},

	{
		files: ['**/*.astro'],
		languageOptions: {
			parser: astroParser,
			parserOptions: {
				parser: tsParser,
				extraFileExtensions: ['.astro'],
			},
		},
		plugins: {
			astro: astroPlugin,
		},
		rules: {
			...astroPlugin.configs.recommended.rules,
		},
	},
];
