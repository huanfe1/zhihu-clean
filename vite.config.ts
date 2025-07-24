import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        monkey({
            entry: 'src/main.ts',
            userscript: {
                name: '清爽知乎',
                icon: 'https://static.zhihu.com/heifetz/favicon.ico',
                namespace: 'https://huanfei.top/',
                author: 'huanfei',
                match: ['*://*.zhihu.com/*'],
                "run-at": 'document-start',
                description: '将网页主体部分变宽，去除杂冗部分，并添加一些实用的功能',
                license: 'MIT',
            },
        }),
    ],
    build: { minify: true },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    esbuild: { pure: ['console.log'] },
    css: { preprocessorOptions: { scss: { api: 'modern' } } },
});
