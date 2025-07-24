import { unsafeWindow } from '$';

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

// 去除外链限制
document.addEventListener('click', e => {
    if (e.target instanceof HTMLElement && e.target.closest('a.external')) {
        e.preventDefault();
        const raw = new URL((e.target as HTMLAnchorElement).href).searchParams.get('target');
        raw && window.open(raw, '_blank');
    }
});

// 去除关键词高亮
const originalFetch = unsafeWindow.fetch;
const hookFetch = (...args: Parameters<typeof originalFetch>) => {
    const [url, _] = args;
    if ((url as string).startsWith('/api/v3/entity_word')) {
        return Promise.resolve(
            new Response(
                JSON.stringify({
                    search_words: null,
                    ab_params: { qa_searchword: '0' },
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        );
    }
    return originalFetch(...args);
};
unsafeWindow.fetch = hookFetch;
