import { URL, fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
    plugins: [
        monkey({
            entry: 'src/main.ts',
            userscript: {
                name: '清爽知乎',
                namespace: 'https://huanfe1.com/',
                author: 'huanfei',
                description: '加宽知乎正文，去掉侧栏和划线词，并补上几个常用功能。',
                license: 'MIT',
                icon: 'https://static.zhihu.com/heifetz/favicon.ico',
                match: ['*://*.zhihu.com/*'],
                'run-at': 'document-start',
            },
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    esbuild: {
        pure: ['console.log'],
    },
    css: {
        preprocessorOptions: {
            scss: { api: 'modern' },
        },
    },
});
