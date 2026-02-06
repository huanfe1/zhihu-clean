import { GM_registerMenuCommand, unsafeWindow } from '$';

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

        (document.querySelector('.Comments-container button:has(.ZDI--ArrowUpSmall24)') as HTMLElement)?.click();
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
});

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
        document.title = '';
    }
});

const originalParse = unsafeWindow.JSON.parse;
unsafeWindow.JSON.parse = function (text, reviver?) {
    let data = originalParse.call(this, text, reviver);
    // 去除网页初始化数据中的段落划线
    if (data && data.initialState) {
        const answers = data.initialState?.entities?.answers;
        if (answers) {
            for (const key in answers) {
                const item = answers[key];
                if (item.segment_infos) {
                    item.segment_infos = [];
                }
                if (item.content) {
                    item.content = item.content.replace(/data-pid=".*?"/g, '');
                }
            }
        }
        // if (data.initialState?.topstory?.recommend?.serverPayloadOrigin?.data) {
        //     data.initialState?.topstory?.recommend?.serverPayloadOrigin?.data.forEach((item: any) => {
        //         if (item?.target?.segment_infos) {
        //             item.target.segment_infos = [];
        //         }
        //         if (item?.target?.content) {
        //             item.target.content = item.target.content.replace(/data-pid=\".*?\"/g, '');
        //         }
        //     });
        // }
    }
    return data;
};

const originalFetch = unsafeWindow.fetch;
const hookFetch = async (...args: Parameters<typeof originalFetch>) => {
    const [url, _] = args as [string, RequestInit];

    if (url.startsWith('/api/') && !url.startsWith('/api/v4/inbox')) {
        return originalFetch(...args)
            .then(res => res.json())
            .then(data => {
                // 去除段落划线
                data?.data?.forEach((items: any) => {
                    if (items?.target?.segment_infos) {
                        items.target.segment_infos = [];
                    }
                    if (items?.target?.content) {
                        items.target.content = items.target.content.replace(/data-pid=\".*?\"/g, '');
                    }
                });
                // 去除关键词高亮
                if (data?.search_words) {
                    data.search_words = [];
                }
                return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
            });
    }
    return originalFetch(...args);
};
unsafeWindow.fetch = hookFetch;
