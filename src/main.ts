import { GM_registerMenuCommand, unsafeWindow } from '$';

import '@/styles/index.scss';

const PID_ATTR_RE = /\s*data-pid="[^"]*"/g;
const SEARCH_WORD_LINK_RE = /<a\b[^>]*\bsearch_word\b[^>]*>([\s\S]*?)<\/a>/gi;
const COMMENT_COMPOSE_ATTR = 'data-zh-comment-compose';
const COMMENT_ACTIONS_ATTR = 'data-zh-comment-actions';
const FONT_SIZE_KEY = 'custom-font-size';

function textNeedsClean(text: string) {
    return text.includes('data-pid') || text.includes('search_word') || text.includes('segment_infos');
}

function cleanContent(content: string) {
    let next = content;
    if (content.includes('data-pid')) next = next.replace(PID_ATTR_RE, '');
    if (content.includes('search_word')) next = next.replace(SEARCH_WORD_LINK_RE, '$1');
    return next;
}

// 只在正文、划线或搜索词出现时整棵扫。JSON 没有环，用深度兜底即可
function cleanSegmentData(data: unknown, depth = 0) {
    if (!data || typeof data !== 'object' || depth > 64) return;

    if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            if (item && typeof item === 'object') cleanSegmentData(item, depth + 1);
        }
        return;
    }

    const record = data as Record<string, unknown>;
    if (Array.isArray(record.segment_infos)) record.segment_infos = [];
    if (record.search_words) record.search_words = [];
    const content = record.content;
    if (typeof content === 'string' && (content.includes('data-pid') || content.includes('search_word'))) {
        record.content = cleanContent(content);
    }

    for (const key in record) {
        if (key === 'content' || key === 'segment_infos' || key === 'search_words') continue;
        const value = record[key];
        if (value && typeof value === 'object') cleanSegmentData(value, depth + 1);
    }
}

function getFetchUrl(input: RequestInfo | URL) {
    if (typeof input === 'string') return input;
    return input instanceof URL ? input.href : input.url;
}

function shouldHookFetchUrl(url: string) {
    try {
        const path = new URL(url, location.origin).pathname;
        return path.startsWith('/api/') && !path.startsWith('/api/v4/inbox');
    } catch {
        return false;
    }
}

const DOM_CLEAN_SELECTOR = '[data-pid], a.search_word, a[href*="search_source=CommentEntity"], button.Button--primary, .SearchBar input';

function cleanElement(el: Element) {
    if (el.hasAttribute('data-pid')) el.removeAttribute('data-pid');
    if (el instanceof HTMLAnchorElement && (el.classList.contains('search_word') || (el.getAttribute('href') ?? '').includes('search_source=CommentEntity'))) {
        el.replaceWith(document.createTextNode(el.textContent ?? ''));
        return;
    }
    if (isCommentPublishButton(el)) {
        const bar = findCommentActionBar(el);
        if (bar && !bar.closest(`[${COMMENT_COMPOSE_ATTR}]`)) bar.setAttribute(COMMENT_ACTIONS_ATTR, 'hide');
        return;
    }
    if (el instanceof HTMLInputElement && el.placeholder) el.placeholder = '';
}

function cleanDom(root: ParentNode) {
    if (root instanceof Element && root.matches(DOM_CLEAN_SELECTOR)) cleanElement(root);
    if (!(root instanceof Element) || root.childElementCount > 0) root.querySelectorAll(DOM_CLEAN_SELECTOR).forEach(cleanElement);
}

function scrubInitialDataScript(originalParse: typeof JSON.parse) {
    const initialData = document.getElementById('js-initialData');
    if (!initialData?.textContent) return false;
    try {
        const data = originalParse(initialData.textContent);
        cleanSegmentData(data);
        initialData.textContent = JSON.stringify(data);
        return true;
    } catch {
        return false;
    }
}

function isCommentPublishButton(button: Element): button is HTMLButtonElement {
    return button instanceof HTMLButtonElement && button.classList.contains('Button--primary') && button.textContent?.trim() === '发布';
}

// 操作栏是「发布」按钮往上、编辑器往下之间的那一层
function findCommentActionBar(button: HTMLButtonElement) {
    let bar: HTMLElement | null = null;
    let node = button.parentElement;
    while (node && node !== document.body) {
        if (node.querySelector('.DraftEditor-root')) break;
        const text = node.textContent?.replace(/\s+/g, '') ?? '';
        if (text.includes('同时发布到想法') && node.querySelector('button.Button--plain')) bar = node;
        node = node.parentElement;
    }
    return bar;
}

// 只有用户点进或开始输入时才标记，自动聚焦打开的评论窗不会被标记
function markCommentComposer(target: Element) {
    const editor = target.closest('.DraftEditor-root');
    if (!(editor instanceof HTMLElement)) return;
    const parent = editor.parentElement;
    if (!parent || parent.closest(`[${COMMENT_COMPOSE_ATTR}]`)) return;

    let node: HTMLElement | null = parent;
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

let foldButton: Element | null = null;
let foldScheduled = false;

function setupFoldButton() {
    if (foldButton?.isConnected) return;
    const container = document.querySelector('.CornerAnimayedFlex:not(.CornerAnimayedFlex--kanshanEntry)');
    if (!container) return;
    const existing = container.querySelector('[data-tooltip="全部折叠"]');
    if (existing) {
        foldButton = existing;
        return;
    }

    const template = container.querySelector('button.CornerButton[aria-label="回到顶部"]');
    if (!template) return;

    const button = template.cloneNode(true) as Element;
    button.setAttribute('aria-label', '全部折叠');
    button.setAttribute('data-tooltip', '全部折叠');
    button.addEventListener('click', () => {
        const topElement = [...document.querySelectorAll('.Topstory-recommend .Card.TopstoryItem')].reverse().find(el => el.getBoundingClientRect().y < 0)?.nextElementSibling;

        const toFoldItems = [
            ...document.querySelectorAll('.RichContent:not(.is-collapsed) .ContentItem-action:has(.RichContent-collapsedText)'),
            ...document.querySelectorAll('.Card.TopstoryItem:has(.Comments-container) button.ContentItem-action:has(.Zi--Comment)'),
        ] as HTMLElement[];

        if (toFoldItems.length > 0) {
            toFoldItems.forEach(el => el.click());
            requestAnimationFrame(() => topElement?.scrollIntoView());
        }

        (document.querySelector('.Comments-container button:has(.ZDI--ArrowUpSmall24)') as HTMLElement)?.click();
    });
    foldButton = button;
    container.append(button);
}

function scheduleFoldButton() {
    if (foldButton?.isConnected || foldScheduled) return;
    foldScheduled = true;
    requestAnimationFrame(() => {
        foldScheduled = false;
        setupFoldButton();
    });
}

function startDomCleanup() {
    if (!document.body) return;
    cleanDom(document.body);
    setupFoldButton();
    new MutationObserver(mutations => {
        let addedElement = false;
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') {
                const target = mutation.target;
                if (target instanceof HTMLInputElement && target.placeholder) target.placeholder = '';
                continue;
            }
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;
                addedElement = true;
                if (node.childElementCount === 0) {
                    if (node.matches(DOM_CLEAN_SELECTOR)) cleanElement(node);
                } else {
                    cleanDom(node);
                }
            }
        }
        if (addedElement) scheduleFoldButton();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['placeholder'] });
}

function bootstrap(originalParse: typeof JSON.parse) {
    if (!scrubInitialDataScript(originalParse)) {
        const initialDataObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element && node.id === 'js-initialData' && scrubInitialDataScript(originalParse)) {
                        initialDataObserver.disconnect();
                        return;
                    }
                }
            }
        });
        initialDataObserver.observe(document.documentElement, { childList: true, subtree: true });
        document.addEventListener(
            'DOMContentLoaded',
            () => {
                scrubInitialDataScript(originalParse);
                initialDataObserver.disconnect();
            },
            { once: true },
        );
    }

    if (document.body) startDomCleanup();
    else document.addEventListener('DOMContentLoaded', startDomCleanup, { once: true });
}

window.addEventListener('copy', event => event.stopPropagation(), true);

function onComposerIntent(event: Event) {
    if (event.target instanceof Element) markCommentComposer(event.target);
}
document.addEventListener('pointerdown', onComposerIntent, true);
document.addEventListener('keydown', onComposerIntent, true);

document.addEventListener(
    'click',
    event => {
        const link = event.target instanceof Element ? event.target.closest('a.external') : null;
        if (!(link instanceof HTMLAnchorElement)) return;
        event.preventDefault();
        const raw = new URL(link.href).searchParams.get('target');
        if (raw) window.open(raw, '_blank');
    },
    true,
);

GM_registerMenuCommand('深浅主题切换（将刷新页面）', () => {
    const url = new URL(location.href);
    url.searchParams.set('theme', document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    location.href = url.href;
});

const savedFontSize = localStorage.getItem(FONT_SIZE_KEY);
if (savedFontSize) document.documentElement.style.setProperty('--font-size', `${savedFontSize}px`);
GM_registerMenuCommand('修改字体大小', () => {
    const fontSize = prompt('请输入字体大小（默认15px）', localStorage.getItem(FONT_SIZE_KEY) || '15');
    if (!fontSize) return;
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
    localStorage.setItem(FONT_SIZE_KEY, fontSize);
});

GM_registerMenuCommand('隐私模式', () => {
    const root = document.documentElement;
    const enabled = root.dataset.privacy !== 'true';
    root.dataset.privacy = String(enabled);
    if (enabled) document.title = '';
});

const originalParse = unsafeWindow.JSON.parse;
unsafeWindow.JSON.parse = function (text, reviver?) {
    const data = originalParse.call(this, text, reviver);
    if (data && typeof data === 'object' && (typeof text !== 'string' || textNeedsClean(text))) cleanSegmentData(data);
    return data;
};

const originalFetch = unsafeWindow.fetch;
unsafeWindow.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (!shouldHookFetchUrl(getFetchUrl(args[0]))) return response;
    if (!(response.headers.get('content-type') ?? '').includes('json')) return response;

    try {
        const text = await response.clone().text();
        if (!textNeedsClean(text)) return response;
        const data = originalParse(text);
        if (data && typeof data === 'object') cleanSegmentData(data);
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
