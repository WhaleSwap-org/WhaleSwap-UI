import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdersTableRenderer } from '../js/services/OrdersTableRenderer.js';
import { ViewOrders } from '../js/components/ViewOrders.js';
import { MyOrders } from '../js/components/MyOrders.js';
import { renderOrderSortOptions } from '../js/utils/orderSort.js';

const MAKER = '0x1111111111111111111111111111111111111111';
const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function createRenderer() {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const component = {
        container,
        currentPage: 3,
        totalOrders: 12,
        createElement(tag, className = '') {
            const element = document.createElement(tag);
            if (className) {
                element.className = className;
            }
            return element;
        },
        ctx: {
            getWebSocket: () => ({
                tokenCache: new Map()
            }),
            getWalletChainId: () => '0x89'
        }
    };

    return {
        component,
        renderer: new OrdersTableRenderer(component, { showRefreshButton: false })
    };
}

function createOrder(id, deal) {
    return {
        id,
        maker: MAKER,
        sellToken: TOKEN_A,
        buyToken: TOKEN_B,
        status: 'Active',
        timings: {
            expiresAt: 1_700_000_000 + id
        },
        dealMetrics: {
            deal
        }
    };
}

function createContext(ws, walletAddress = MAKER) {
    return {
        getWebSocket: () => ws,
        getWalletChainId: () => '0x89',
        getPricing: () => ({
            getPrice: () => undefined,
            isPriceEstimated: () => false
        }),
        getWallet: () => ({
            getAccount: () => walletAddress,
            isWalletConnected: () => true
        }),
        showError: () => {},
        showSuccess: () => {},
        showWarning: () => {},
        showInfo: () => {}
    };
}

function mountSortingControls(container, sortValue = 'best-deal') {
    container.innerHTML = `
        <label>
            <input id="fillable-orders-toggle" type="checkbox">
        </label>
        <select id="sell-token-filter"><option value="">All</option></select>
        <select id="buy-token-filter"><option value="">All</option></select>
        <select id="order-sort">${renderOrderSortOptions(sortValue)}</select>
        <select id="page-size-select">
            <option value="25" selected>25</option>
            <option value="-1">View all</option>
        </select>
        <table class="orders-table"><tbody></tbody></table>
    `;
    container.querySelector('#order-sort').value = sortValue;
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('OrdersTableRenderer sortable headers', () => {
    it('keeps the select and active header state in sync', async () => {
        const { component, renderer } = createRenderer();
        const onRefresh = vi.fn();

        await renderer.setupTable(onRefresh);

        const sortSelect = component.container.querySelector('#order-sort');
        const dealHeader = component.container.querySelector('th[data-sort="deal"]');
        const expiresHeader = component.container.querySelector('th[data-sort="expires"]');

        expect(sortSelect.value).toBe('best-deal');
        expect(dealHeader.classList.contains('active-sort')).toBe(true);
        expect(dealHeader.getAttribute('aria-sort')).toBe('descending');

        dealHeader.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(sortSelect.value).toBe('worst-deal');
        expect(dealHeader.getAttribute('aria-sort')).toBe('ascending');

        expiresHeader.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(sortSelect.value).toBe('expires-newest');
        expect(expiresHeader.classList.contains('active-sort')).toBe(true);
        expect(expiresHeader.getAttribute('aria-sort')).toBe('descending');

        expiresHeader.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(sortSelect.value).toBe('expires-oldest');
        expect(expiresHeader.getAttribute('aria-sort')).toBe('ascending');
        expect(component.currentPage).toBe(1);
        expect(onRefresh).toHaveBeenCalledTimes(3);
    });

    it('lets the Deal info icon trigger sort while keeping the tooltip visible', async () => {
        const { component, renderer } = createRenderer();
        const onRefresh = vi.fn();

        await renderer.setupTable(onRefresh);

        const sortSelect = component.container.querySelector('#order-sort');
        const dealIcon = component.container.querySelector('th[data-sort="deal"] .order-tooltip-icon');

        dealIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const tooltip = document.getElementById('order-tooltip-popover');
        expect(sortSelect.value).toBe('worst-deal');
        expect(tooltip).not.toBeNull();
        expect(tooltip.classList.contains('is-visible')).toBe(true);
        expect(onRefresh).toHaveBeenCalledOnce();
    });

    it('removes hidden desktop-only header controls from tab order in mobile card mode', async () => {
        const { component, renderer } = createRenderer();
        const onRefresh = vi.fn();
        const viewportState = { isMobile: false };
        const originalMatchMedia = window.matchMedia;

        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: vi.fn(() => ({ matches: viewportState.isMobile }))
        });

        try {
            await renderer.setupTable(onRefresh);

            const dealHeader = component.container.querySelector('th[data-sort="deal"]');
            const dealIcon = component.container.querySelector('th[data-sort="deal"] .order-tooltip-icon');

            expect(dealHeader.tabIndex).toBe(0);
            expect(dealIcon.tabIndex).toBe(0);

            viewportState.isMobile = true;
            window.dispatchEvent(new Event('resize'));

            expect(dealHeader.tabIndex).toBe(-1);
            expect(dealIcon.tabIndex).toBe(-1);
        } finally {
            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                writable: true,
                value: originalMatchMedia
            });
        }
    });
});

describe('order tab sorting behavior', () => {
    it('uses buyer-side deal ordering in ViewOrders', async () => {
        document.body.innerHTML = '<div id="view-orders"></div>';

        const ws = {
            tokenCache: new Map(),
            orderCache: new Map([
                [1, createOrder(1, 2)],
                [2, createOrder(2, 0.5)]
            ]),
            ensureChainTimeInitialized: vi.fn(async () => {}),
            getOrderExpiryTime: vi.fn((order) => order.timings?.expiresAt ?? null),
            isPastTimestamp: vi.fn(() => false),
            canFillOrder: vi.fn(() => true),
            hasCompletedOrderSync: true
        };

        const component = new ViewOrders();
        component.setContext(createContext(ws));
        mountSortingControls(component.container, 'best-deal');
        component.renderer.renderOrders = vi.fn(async () => {});
        component.renderer.updatePaginationControls = vi.fn();

        await component.refreshOrdersView();

        const renderedOrders = component.renderer.renderOrders.mock.calls[0][0];
        expect(renderedOrders.map((order) => order.id)).toEqual([2, 1]);
    });

    it('uses maker-side deal ordering in MyOrders', async () => {
        document.body.innerHTML = '<div id="my-orders"></div>';

        const ws = {
            tokenCache: new Map(),
            orderCache: new Map([
                [1, createOrder(1, 2)],
                [2, createOrder(2, 0.5)]
            ]),
            ensureChainTimeInitialized: vi.fn(async () => {}),
            getOrderExpiryTime: vi.fn((order) => order.timings?.expiresAt ?? null),
            canCancelOrder: vi.fn(() => false),
            hasCompletedOrderSync: true
        };

        const component = new MyOrders();
        component.setContext(createContext(ws));
        mountSortingControls(component.container, 'best-deal');
        component.renderer.renderOrders = vi.fn(async () => {});
        component.renderer.updatePaginationControls = vi.fn();

        await component.refreshOrdersView();

        const renderedOrders = component.renderer.renderOrders.mock.calls[0][0];
        expect(renderedOrders.map((order) => order.id)).toEqual([1, 2]);
    });

    it('initializes MyOrders with the shared table setup defaults', async () => {
        document.body.innerHTML = '<div id="my-orders"></div>';

        const ws = {
            tokenCache: new Map([
                [TOKEN_A, { address: TOKEN_A, symbol: 'AAA' }],
                [TOKEN_B, { address: TOKEN_B, symbol: 'BBB' }]
            ])
        };

        const component = new MyOrders();
        component.setContext(createContext(ws));
        component.refreshOrdersView = vi.fn(async () => {});
        component.setupEventListeners = vi.fn();

        await component.setupTable();

        const sortSelect = component.container.querySelector('#order-sort');
        const pageSizeSelect = component.container.querySelector('#page-size-select');
        const headerLabels = Array.from(component.container.querySelectorAll('thead th'))
            .map((element) => element.textContent.replace(/\s+/g, ' ').trim());
        const dealHeader = component.container.querySelector('th[data-sort="deal"]');

        expect(sortSelect.value).toBe('best-deal');
        expect(pageSizeSelect.value).toBe('10');
        expect(headerLabels.slice(0, 3)).toEqual(['ID', 'You Sell', 'You Buy']);
        expect(dealHeader.classList.contains('active-sort')).toBe(true);
        expect(dealHeader.getAttribute('aria-sort')).toBe('descending');
    });
});
