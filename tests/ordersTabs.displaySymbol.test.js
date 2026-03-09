import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyOrders } from '../js/components/MyOrders.js';
import { ViewOrders } from '../js/components/ViewOrders.js';
import { TakerOrders } from '../js/components/TakerOrders.js';
import { DEAL_TOOLTIP_TEXT } from '../js/utils/ui.js';

const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOKEN_C = '0xcccccccccccccccccccccccccccccccccccccccc';
const POLYGON_LINK_POS = '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39';
const OTHER_LINK = '0xb0897686c545045afc77cf20ec7a532e3120e0f1';
const MAKER = '0x1111111111111111111111111111111111111111';
const TAKER = '0x2222222222222222222222222222222222222222';
const TOKEN_INFO = {
    [TOKEN_A]: { address: TOKEN_A, symbol: 'AAA', name: 'Alpha Issuer', decimals: 18 },
    [TOKEN_B]: { address: TOKEN_B, symbol: 'AAA', name: 'Alpha Default', decimals: 18 },
    [TOKEN_C]: { address: TOKEN_C, symbol: 'USDC', name: 'USD Coin', decimals: 6 }
};

function createWsStub({
    includeCache = false,
    tokenInfoMap = TOKEN_INFO,
    orderStatus = 'Active',
    currentTimestamp = 1_700_000_000,
    canFillOrder = false
} = {}) {
    const ws = {
        getTokenInfo: vi.fn(async (address) => tokenInfoMap[address.toLowerCase()] || null),
        getOrderStatus: vi.fn(() => orderStatus),
        getCurrentTimestamp: vi.fn(() => currentTimestamp),
        canCancelOrder: vi.fn(() => false),
        canFillOrder: vi.fn(() => canFillOrder)
    };

    if (includeCache) {
        ws.tokenCache = new Map(
            Object.values(tokenInfoMap).map((token) => [token.address.toLowerCase(), token])
        );
    }

    return ws;
}

function createContext(
    ws,
    walletAddress = MAKER,
    {
        pricingByToken = {},
        estimatedTokens = []
    } = {}
) {
    return {
        getWebSocket: () => ws,
        getWalletChainId: () => '0x89',
        getPricing: () => ({
            getPrice: (token) => pricingByToken[token?.toLowerCase?.()] ?? undefined,
            isPriceEstimated: (token) => estimatedTokens.includes(token?.toLowerCase?.())
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

function createOrder() {
    return {
        id: 1,
        maker: MAKER,
        taker: TAKER,
        sellToken: TOKEN_A,
        buyToken: TOKEN_B,
        sellAmount: '1',
        buyAmount: '1',
        timings: {
            createdAt: 1_700_000_000,
            expiresAt: 1_700_003_600
        },
        dealMetrics: {
            formattedSellAmount: '1.00',
            formattedBuyAmount: '1.00',
            deal: 1
        }
    };
}

function createFallbackOrder() {
    return {
        id: 2,
        maker: MAKER,
        taker: TAKER,
        sellToken: TOKEN_A,
        buyToken: TOKEN_B,
        sellAmount: '2000000',
        buyAmount: '500000',
        timings: {
            createdAt: 1_700_000_000,
            expiresAt: 1_700_003_600
        }
    };
}

function createDisplaySymbolWs() {
    return {
        tokenCache: new Map([
            [POLYGON_LINK_POS, { address: POLYGON_LINK_POS, symbol: 'LINK', name: 'ChainLink Token' }],
            [OTHER_LINK, { address: OTHER_LINK, symbol: 'LINK', name: 'ChainLink Token' }],
            [TOKEN_C, TOKEN_INFO[TOKEN_C]]
        ])
    };
}

function getTableHeaderDetails(component) {
    return {
        headerLabels: [
            component.container.querySelector('thead th:nth-child(2)')?.textContent?.trim(),
            component.container.querySelector('thead th:nth-child(3)')?.textContent?.trim()
        ],
        filterLabels: [
            component.container.querySelector('#sell-token-filter option')?.textContent?.trim(),
            component.container.querySelector('#buy-token-filter option')?.textContent?.trim()
        ],
        dealTooltip: component.container.querySelector('th[data-sort="deal"] .order-tooltip-icon')
            ?.getAttribute('data-order-tooltip')
    };
}

function getRowDisplayDetails(row) {
    return {
        symbols: Array.from(row.querySelectorAll('.token-symbol'))
            .map((element) => element.textContent.trim()),
        dealTooltip: row.querySelector('.deal-tooltip-icon')?.getAttribute('data-order-tooltip')
    };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('orders tabs display symbol rendering', () => {
    it('renders MyOrders filter dropdown with display symbols', async () => {
        document.body.innerHTML = '<div id="my-orders"></div>';

        const ws = createDisplaySymbolWs();
        const component = new MyOrders();
        component.setContext(createContext(ws));
        component.setupEventListeners = vi.fn();

        await component.setupTable();

        const sellOptions = Array.from(
            component.container.querySelectorAll('#sell-token-filter option')
        ).map((option) => option.textContent.trim());
        const { headerLabels, filterLabels, dealTooltip } = getTableHeaderDetails(component);

        expect(sellOptions).toEqual(['All You Sell Tokens', 'LINK', 'LINK.pol', 'USDC']);
        expect(headerLabels).toEqual(['You Sell', 'You Buy']);
        expect(filterLabels).toEqual(['All You Sell Tokens', 'All You Buy Tokens']);
        expect(dealTooltip).toBe(DEAL_TOOLTIP_TEXT);
        expect(sellOptions.some((label) => /^LINK\.[a-f0-9]{4}$/i.test(label))).toBe(false);
    });

    it('renders ViewOrders with buyer-perspective headers and filters', async () => {
        document.body.innerHTML = '<div id="view-orders"></div>';

        const ws = createDisplaySymbolWs();
        const component = new ViewOrders();
        component.setContext(createContext(ws));

        await component.setupTable();

        const { headerLabels, filterLabels, dealTooltip } = getTableHeaderDetails(component);

        expect(headerLabels).toEqual(['You Buy', 'You Sell']);
        expect(filterLabels).toEqual(['All You Buy Tokens', 'All You Sell Tokens']);
        expect(dealTooltip).toBe(DEAL_TOOLTIP_TEXT);
    });

    it('renders TakerOrders with buyer-perspective headers and filters', async () => {
        document.body.innerHTML = '<div id="taker-orders"></div>';

        const ws = createDisplaySymbolWs();
        const component = new TakerOrders();
        component.setContext(createContext(ws, TAKER));

        await component.setupTable();

        const { headerLabels, filterLabels, dealTooltip } = getTableHeaderDetails(component);

        expect(headerLabels).toEqual(['You Buy', 'You Sell']);
        expect(filterLabels).toEqual(['All You Buy Tokens', 'All You Sell Tokens']);
        expect(dealTooltip).toBe(DEAL_TOOLTIP_TEXT);
    });

    it('renders ViewOrders row using display symbols for sell/buy tokens', async () => {
        document.body.innerHTML = '<div id="view-orders"></div>';

        const ws = createWsStub();
        const component = new ViewOrders();
        component.setContext(createContext(ws));
        component.tokenDisplaySymbolMap = new Map([
            [TOKEN_A, 'AAA.issuer'],
            [TOKEN_B, 'AAA']
        ]);
        component.helper.renderTokenIcon = vi.fn();
        component.renderer.startExpiryTimer = vi.fn();

        const row = await component.createOrderRow(createOrder());
        const { symbols, dealTooltip } = getRowDisplayDetails(row);

        expect(symbols).toEqual(['AAA.issuer', 'AAA']);
        expect(dealTooltip).toBe(DEAL_TOOLTIP_TEXT);
    });

    it('renders MyOrders row using display symbols for sell/buy tokens', async () => {
        document.body.innerHTML = '<div id="my-orders"></div>';

        const ws = createWsStub();
        const component = new MyOrders();
        component.setContext(createContext(ws));
        component.tokenDisplaySymbolMap = new Map([
            [TOKEN_A, 'AAA.issuer'],
            [TOKEN_B, 'AAA']
        ]);
        component.helper.renderTokenIcon = vi.fn();
        component.renderer.startExpiryTimer = vi.fn();

        const row = await component.createOrderRow(createOrder());
        const { symbols, dealTooltip } = getRowDisplayDetails(row);

        expect(symbols).toEqual(['AAA.issuer', 'AAA']);
        expect(dealTooltip).toBe(DEAL_TOOLTIP_TEXT);
    });

    it('renders TakerOrders row using display symbols for sell/buy tokens', async () => {
        document.body.innerHTML = '<div id="taker-orders"></div>';

        const ws = createWsStub();
        const component = new TakerOrders();
        component.setContext(createContext(ws, TAKER));
        component.tokenDisplaySymbolMap = new Map([
            [TOKEN_A, 'AAA.issuer'],
            [TOKEN_B, 'AAA']
        ]);
        component.helper.renderTokenIcon = vi.fn();
        component.renderer.startExpiryTimer = vi.fn();

        const row = await component.createOrderRow(createOrder());
        const { symbols, dealTooltip } = getRowDisplayDetails(row);

        expect(symbols).toEqual(['AAA.issuer', 'AAA']);
        expect(dealTooltip).toBe(DEAL_TOOLTIP_TEXT);
    });

    it('uses fallback formatting, price classes, and expiry text in ViewOrders rows', async () => {
        document.body.innerHTML = '<div id="view-orders"></div>';

        const tokenInfoMap = {
            [TOKEN_A]: { address: TOKEN_A, symbol: 'AAA', name: 'Token A', decimals: 6 },
            [TOKEN_B]: { address: TOKEN_B, symbol: 'BBB', name: 'Token B', decimals: 6 }
        };
        const ws = createWsStub({ tokenInfoMap, orderStatus: 'Active', currentTimestamp: 1_700_000_000 });
        const component = new ViewOrders();
        component.setContext(createContext(ws, MAKER, {
            pricingByToken: {
                [TOKEN_A]: 2,
                [TOKEN_B]: 3
            },
            estimatedTokens: [TOKEN_A]
        }));
        component.tokenDisplaySymbolMap = new Map([
            [TOKEN_A, 'AAA.issuer'],
            [TOKEN_B, 'BBB']
        ]);
        component.helper.renderTokenIcon = vi.fn();
        component.renderer.startExpiryTimer = vi.fn();

        const row = await component.createOrderRow(createFallbackOrder());
        const tokenAmounts = Array.from(row.querySelectorAll('.token-amount'))
            .map((element) => element.textContent.trim());
        const tokenPrices = Array.from(row.querySelectorAll('.token-price'))
            .map((element) => element.textContent.trim());
        const tokenPriceClasses = Array.from(row.querySelectorAll('.token-price'))
            .map((element) => element.classList.contains('price-estimate'));
        const expiryText = row.querySelector('td:nth-child(5)')?.textContent?.trim();
        const dealText = row.querySelector('.deal-value')?.textContent?.trim();

        expect(tokenAmounts).toEqual(['2.0', '0.5']);
        expect(tokenPrices).toEqual(['$4.00', '$1.50']);
        expect(tokenPriceClasses).toEqual([true, false]);
        expect(expiryText).toBe('1H 0M');
        expect(dealText).toBe('N/A');
    });

    it('uses fallback formatting, price classes, and expiry text in TakerOrders rows', async () => {
        document.body.innerHTML = '<div id="taker-orders"></div>';

        const tokenInfoMap = {
            [TOKEN_A]: { address: TOKEN_A, symbol: 'AAA', name: 'Token A', decimals: 6 },
            [TOKEN_B]: { address: TOKEN_B, symbol: 'BBB', name: 'Token B', decimals: 6 }
        };
        const ws = createWsStub({
            tokenInfoMap,
            orderStatus: 'Active',
            currentTimestamp: 1_700_000_000,
            canFillOrder: true
        });
        const component = new TakerOrders();
        component.setContext(createContext(ws, TAKER, {
            pricingByToken: {
                [TOKEN_A]: 2,
                [TOKEN_B]: 3
            },
            estimatedTokens: [TOKEN_A]
        }));
        component.tokenDisplaySymbolMap = new Map([
            [TOKEN_A, 'AAA.issuer'],
            [TOKEN_B, 'BBB']
        ]);
        component.helper.renderTokenIcon = vi.fn();
        component.renderer.startExpiryTimer = vi.fn();

        const row = await component.createOrderRow(createFallbackOrder());
        const tokenAmounts = Array.from(row.querySelectorAll('.token-amount'))
            .map((element) => element.textContent.trim());
        const tokenPrices = Array.from(row.querySelectorAll('.token-price'))
            .map((element) => element.textContent.trim());
        const tokenPriceClasses = Array.from(row.querySelectorAll('.token-price'))
            .map((element) => element.classList.contains('price-estimate'));
        const expiryText = row.querySelector('td:nth-child(5)')?.textContent?.trim();
        const dealText = row.querySelector('.deal-value')?.textContent?.trim();
        const dealLabel = row.querySelector('.deal-card-label')?.textContent?.trim();

        expect(tokenAmounts).toEqual(['2.0', '0.5']);
        expect(tokenPrices).toEqual(['$4.00', '$1.50']);
        expect(tokenPriceClasses).toEqual([true, false]);
        expect(expiryText).toBe('1H 0M');
        expect(dealLabel).toContain('Deal');
        expect(dealText).toBe('N/A');
    });
});
