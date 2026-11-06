import { GM_registerMenuCommand, unsafeWindow } from '$';

import '@/styles/index.scss';

const PID_ATTR_RE = /\s*data-pid="[^"]*"/g;

function cleanContent(content: string) {
    return content.replace(PID_ATTR_RE, '');
}

function cleanSegmentTarget(target: unknown) {
    if (!target || typeof target !== 'object') return;
    const item = target as Record<string, unknown>;
    if (Array.isArray(item.segment_infos)) item.segment_infos = [];
    if (typeof item.content === 'string') item.content = cleanContent(item.content);
}

function cleanSegmentData(data: unknown) {
    if (!data || typeof data !== 'object') return;
    const payload = data as Record<string, unknown>;

    if (payload.initialState && typeof payload.initialState === 'object') {
        const entities = (payload.initialState as Record<string, unknown>).entities;
        if (entities && typeof entities === 'object') {
            for (const entityMap of Object.values(entities)) {
                if (!entityMap || typeof entityMap !== 'object') continue;
                for (const item of Object.values(entityMap)) cleanSegmentTarget(item);
            }
        }
    }

    const feedData =
        (payload.initialState as Record<string, any> | undefined)?.topstory?.recommend?.serverPayloadOrigin?.data ??
        (payload.topstory as Record<string, any> | undefined)?.recommend?.serverPayloadOrigin?.data;
    if (Array.isArray(feedData)) {
        feedData.forEach(item => cleanSegmentTarget((item as Record<string, unknown>)?.target ?? item));
    }

    if (Array.isArray(payload.data)) {
        payload.data.forEach(item => cleanSegmentTarget((item as Record<string, unknown>)?.target ?? item));
    }

    cleanSegmentTarget(payload);
    if (payload.search_words) payload.search_words = [];
}

function getFetchUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input.url;
}

function shouldHookFetchUrl(url: string) {
    try {
        const path = new URL(url, location.origin).pathname;
        return path.startsWith('/api/') && !path.startsWith('/api/v4/inbox');
    } catch {
        return false;
    }
}

function stripSegmentPid(root: ParentNode = document) {
    if (root instanceof Element && root.hasAttribute('data-pid')) {
        root.removeAttribute('data-pid');
    }
    root.querySelectorAll?.('[data-pid]')?.forEach(el => el.removeAttribute('data-pid'));
}

function scrubInitialDataScript(originalParse: typeof JSON.parse) {
    const initialData = document.getElementById('js-initialData');
    if (!initialData?.textContent) return false;
    try {
        const data = originalParse.call(JSON, initialData.textContent);
        cleanSegmentData(data);
        initialData.textContent = JSON.stringify(data);
        return true;
    } catch {
        return false;
    }
}

const COMMENT_COMPOSE_ATTR = 'data-zh-comment-compose';
const COMMENT_ACTIONS_ATTR = 'data-zh-comment-actions';

function isCommentPublishButton(button: Element): button is HTMLButtonElement {
    return (
        button instanceof HTMLButtonElement &&
        button.classList.contains('Button--primary') &&
        button.textContent?.trim() === '发布'
    );
}

// 操作栏是「发布」按钮往上、编辑器往下之间的那一层（表情、同时发布到想法、发布）
function findCommentActionBar(button: HTMLButtonElement) {
    let bar: HTMLElement | null = null;
    let node = button.parentElement;
    while (node && node !== document.body) {
        if (node.querySelector('.DraftEditor-root')) break;
        const text = node.innerText?.replace(/\s+/g, '') ?? '';
        if (text.includes('同时发布到想法') && node.querySelector('button.Button--plain')) bar = node;
        node = node.parentElement;
    }
    return bar;
}

function collapseCommentActionBars(root: ParentNode) {
    const buttons: HTMLButtonElement[] = [];
    if (root instanceof Element && isCommentPublishButton(root)) buttons.push(root);
    root.querySelectorAll?.('button.Button--primary').forEach(button => {
        if (isCommentPublishButton(button)) buttons.push(button);
    });

    for (const button of buttons) {
        const bar = findCommentActionBar(button);
        if (!bar || bar.closest(`[${COMMENT_COMPOSE_ATTR}]`)) continue;
        bar.setAttribute(COMMENT_ACTIONS_ATTR, 'hide');
    }
}

// 只有用户点进或开始输入时才标记，自动聚焦打开的评论窗不会被标记
function markCommentComposer(target: Element) {
    const editor = target.closest('.DraftEditor-root');
    if (!(editor instanceof HTMLElement)) return;

    let node = editor.parentElement;
    for (let i = 0; i < 8 && node && node !== document.body; i++) {
        if (
            node.classList.contains('Modal-content') ||
            node.classList.contains('Comments-container') ||
            node.classList.contains('ContentItem') ||
            node.getBoundingClientRect().height > 320
        ) {
            break;
        }
        node.setAttribute(COMMENT_COMPOSE_ATTR, '1');
        node.querySelectorAll(`[${COMMENT_ACTIONS_ATTR}]`).forEach(el => el.removeAttribute(COMMENT_ACTIONS_ATTR));
        node = node.parentElement;
    }
}

function startDomCleanup() {
    if (!document.body) return;
    stripSegmentPid(document.body);
    collapseCommentActionBars(document.body);
    new MutationObserver(mutations => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                if (node instanceof Element) {
                    stripSegmentPid(node);
                    collapseCommentActionBars(node);
                }
            });
        }
    }).observe(document.body, { childList: true, subtree: true });
}

function bootstrap(originalParse: typeof JSON.parse) {
    const initialDataObserver = new MutationObserver(() => {
        if (scrubInitialDataScript(originalParse)) initialDataObserver.disconnect();
    });
    initialDataObserver.observe(document.documentElement, { childList: true, subtree: true });
    scrubInitialDataScript(originalParse);

    if (document.body) startDomCleanup();
    else document.addEventListener('DOMContentLoaded', startDomCleanup, { once: true });
}

// 去除复制小尾巴
window.addEventListener('copy', e => e.stopPropagation(), true);

document.addEventListener('pointerdown', e => {
    if (e.target instanceof Element) markCommentComposer(e.target);
}, true);

document.addEventListener('keydown', e => {
    if (e.target instanceof Element) markCommentComposer(e.target);
}, true);

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
    const data = originalParse.call(this, text, reviver);
    if (data && typeof data === 'object') cleanSegmentData(data);
    return data;
};

const originalFetch = unsafeWindow.fetch;
unsafeWindow.fetch = async (...args: Parameters<typeof originalFetch>) => {
    const response = await originalFetch(...args);
    const url = getFetchUrl(args[0]);
    if (!shouldHookFetchUrl(url)) return response;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) return response;

    try {
        const data = await response.clone().json();
        cleanSegmentData(data);
        const headers = new Headers(response.headers);
        headers.set('content-type', 'application/json');
        return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch {
        return response;
    }
};

bootstrap(originalParse);

function setupFoldButton() {
    const container = document.querySelector('.CornerAnimayedFlex:not(.CornerAnimayedFlex--kanshanEntry)');
    if (!container || container.querySelector('[data-tooltip="全部折叠"]')) return;

    const template = container.querySelector('button.CornerButton[aria-label="回到顶部"]');
    if (!template) return;

    const button = template.cloneNode(true) as Element;
    button.setAttribute('aria-label', '全部折叠');
    button.setAttribute('data-tooltip', '全部折叠');
    button.addEventListener('click', () => {
        const topElement = [...document.querySelectorAll('.Topstory-recommend .Card.TopstoryItem')]
            .reverse()
            .find(el => el.getBoundingClientRect().y < 0)?.nextElementSibling;

        const cards = document.querySelectorAll(
            '.RichContent:not(.is-collapsed) .ContentItem-action:has(.RichContent-collapsedText)',
        );
        const comments = document.querySelectorAll(
            '.Card.TopstoryItem:has(.Comments-container) button.ContentItem-action:has(.Zi--Comment)',
        );
        const toFoldItems = [...comments, ...cards] as HTMLElement[];

        if (toFoldItems.length > 0) {
            toFoldItems.forEach(el => el.click());
            requestAnimationFrame(() => topElement?.scrollIntoView());
        }

        (document.querySelector('.Comments-container button:has(.ZDI--ArrowUpSmall24)') as HTMLElement)?.click();
    });
    container.append(button);
}

new MutationObserver(() => setupFoldButton()).observe(document.documentElement, {
    childList: true,
    subtree: true,
});
setupFoldButton();
