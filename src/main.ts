import { GM_registerMenuCommand } from '$';

import '@/styles/index.scss';

window.onload = () => {
    // 添加全部折叠按钮
    const button = document.querySelector('button.CornerButton')?.cloneNode(true) as Element;
    if (!button) return;
    button.setAttribute('aria-label', '全部折叠');
    button.setAttribute('data-tooltip', '全部折叠');
    button.addEventListener('click', () => {
        const topElement = [...document.querySelectorAll('.Topstory-recommend .Card.TopstoryItem')].reverse().find(el => el.getBoundingClientRect().y < 0)?.nextElementSibling;

        const cards = document.querySelectorAll('.RichContent:not(.is-collapsed) .ContentItem-action:has(.RichContent-collapsedText)');
        const comments = document.querySelectorAll('.Card.TopstoryItem:has(.Comments-container) button.ContentItem-action:has(.Zi--Comment)');
        const toFoldItems = [...comments, ...cards] as HTMLElement[];

        if (toFoldItems.length > 0) {
            toFoldItems.forEach(el => el.click());
            requestAnimationFrame(() => topElement?.scrollIntoView());
        }
    });
    document.querySelector('.CornerAnimayedFlex')?.append(button);
};

// 去除复制小尾巴
window.addEventListener('copy', e => e.stopPropagation(), true);

document.addEventListener('click', e => {
    if (!(e.target instanceof HTMLElement)) return;
    // 外链限制
    if (e.target.closest('a.external')) {
        e.preventDefault();
        const raw = new URL((e.target as HTMLAnchorElement).href).searchParams.get('target');
        raw && window.open(raw, '_blank');
    }
    // 关键词高亮
    if (e.target.closest('.RichContent-EntityWord')) {
        e.preventDefault();
        if (!e.target.parentElement) return;
        e.target.parentElement.innerHTML = e.target.textContent ?? '';
    }
});

// const originalFetch = unsafeWindow.fetch;
// const hookFetch = (...args: Parameters<typeof originalFetch>) => {
//     // const [url, _] = args;
//     // if ((url as string).startsWith('/api/v3/entity_word')) {
//     //     return Promise.resolve(
//     //         new Response(
//     //             JSON.stringify({
//     //                 search_words: null,
//     //                 ab_params: { qa_searchword: '0' },
//     //             }),
//     //             { status: 200, headers: { 'Content-Type': 'application/json' } },
//     //         ),
//     //     );
//     // }
//     return originalFetch(...args);
// };
// unsafeWindow.fetch = hookFetch;

// 深浅主题切换
GM_registerMenuCommand('深浅主题切换（将刷新页面）', () => {
    const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    const url = new URL(location.href);
    const params = new URLSearchParams(url.search);
    params.set('theme', theme);
    url.search = params.toLocaleString();
    location.href = url.href;
});

const savedFontSize = localStorage.getItem('custom-font-size');
if (savedFontSize) {
    document.documentElement.style.setProperty('--font-size', `${savedFontSize}px`);
}
GM_registerMenuCommand('修改字体大小', () => {
    const currentFontSize = localStorage.getItem('custom-font-size') || '15';
    const fontSize = prompt('请输入字体大小（默认15px）', currentFontSize);
    if (fontSize) {
        const root = document.documentElement;
        root.style.setProperty('--font-size', `${fontSize}px`);
        localStorage.setItem('custom-font-size', fontSize);
    }
});

GM_registerMenuCommand('隐私模式', () => {
    if (document.documentElement.dataset.privacy === 'true') {
        document.documentElement.dataset.privacy = 'false';
    } else {
        document.documentElement.dataset.privacy = 'true';
    }
});
