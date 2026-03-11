import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { CreateOrder } from '../js/components/CreateOrder.js';
import { buildTokenDisplaySymbolMap } from '../js/utils/tokenDisplay.js';
import { walletManager } from '../js/services/WalletManager.js';

const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOKEN_C = '0xcccccccccccccccccccccccccccccccccccccccc';
const TEST_SUFFIXES = {
    137: {
        [TOKEN_A]: 'issuer'
    }
};

function createContextStub() {
    return {
        getPricing: () => ({
            getPrice: () => undefined,
            isPriceEstimated: () => false,
            fetchPricesForTokens: async () => {}
        }),
        getWebSocket: () => ({}),
        getWallet: () => ({
            isWalletConnected: () => true,
            getAccount: () => '0x3333333333333333333333333333333333333333'
        }),
        getWalletChainId: () => '0x89',
        showError: () => {},
        showSuccess: () => {},
        showWarning: () => {},
        showInfo: () => {}
    };
}

function createComponent() {
    document.body.innerHTML = `
        <div id="create-order"></div>
        <div id="sellTokenModal">
            <input id="sellTokenSearch" value="" />
            <div id="sellTokenResultsSection" class="token-section hidden" aria-hidden="true">
                <h4>Results</h4>
                <div id="sellTokenResultsList"></div>
            </div>
            <h4 id="sellTokenListHeading">Allowed tokens</h4>
            <div id="sellAllowedTokenList"></div>
        </div>
        <div id="buyTokenModal">
            <input id="buyTokenSearch" value="" />
            <div id="buyTokenResultsSection" class="token-section hidden" aria-hidden="true">
                <h4>Results</h4>
                <div id="buyTokenResultsList"></div>
            </div>
            <h4 id="buyTokenListHeading">Allowed tokens</h4>
            <div id="buyAllowedTokenList"></div>
        </div>
    `;
    const component = new CreateOrder();
    component.setContext(createContextStub());
    return component;
}

function setAllowedTokens(component, tokens) {
    component.tokenDisplaySymbolMap = buildTokenDisplaySymbolMap(tokens, '0x89', TEST_SUFFIXES);
    const normalizedTokens = tokens.map((token) => component.normalizeTokenDisplay(token));
    component.tokens = normalizedTokens;
    component.allowedTokens = normalizedTokens;
    component.tokensLoading = false;
    return normalizedTokens;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('CreateOrder display symbol wiring', () => {
    it('renders displaySymbol labels in token list sorted order', () => {
        const component = createComponent();
        const tokens = [
            { address: TOKEN_A, symbol: 'AAA', name: 'Alpha Issuer', balance: '1', iconUrl: 'fallback' },
            { address: TOKEN_B, symbol: 'AAA', name: 'Alpha Default', balance: '1', iconUrl: 'fallback' },
            { address: TOKEN_C, symbol: 'USDC', name: 'USD Coin', balance: '1', iconUrl: 'fallback' }
        ];
        component.tokenDisplaySymbolMap = buildTokenDisplaySymbolMap(tokens, '0x89', TEST_SUFFIXES);

        const listContainer = document.createElement('div');
        component.displayTokens(tokens, listContainer, 'buy');

        const labels = Array.from(listContainer.querySelectorAll('.token-item-symbol'))
            .map((element) => element.textContent.trim());

        expect(labels).toEqual(['AAA', 'AAA.issuer', 'USDC']);
    });

    it('uses token explorer page links for modal explorer icons', () => {
        const component = createComponent();
        const tokens = [
            { address: TOKEN_C, symbol: 'USDC', name: 'USD Coin', balance: '1', iconUrl: 'fallback' }
        ];

        const listContainer = document.createElement('div');
        component.displayTokens(tokens, listContainer, 'buy');

        const explorerLink = listContainer.querySelector('.token-explorer-link');
        expect(explorerLink?.getAttribute('href'))
            .toBe(`https://polygonscan.com/token/${ethers.utils.getAddress(TOKEN_C)}`);
    });

    it('allows searching by displaySymbol', async () => {
        const component = createComponent();
        const tokens = [
            { address: TOKEN_A, symbol: 'AAA', name: 'Alpha Issuer', balance: '1', iconUrl: 'fallback' },
            { address: TOKEN_B, symbol: 'AAA', name: 'Alpha Default', balance: '1', iconUrl: 'fallback' }
        ];
        setAllowedTokens(component, tokens);

        await component.handleTokenSearch('issuer', 'sell');

        const resultSymbols = Array.from(
            document.querySelectorAll('#sellTokenResultsList .token-item-symbol')
        ).map((element) => element.textContent.trim());
        const allowedSymbols = Array.from(
            document.querySelectorAll('#sellAllowedTokenList .token-item-symbol')
        ).map((element) => element.textContent.trim());

        expect(resultSymbols).toEqual(['AAA.issuer']);
        expect(allowedSymbols).toEqual(['AAA', 'AAA.issuer']);
        expect(document.getElementById('sellTokenResultsSection')?.getAttribute('aria-hidden')).toBe('false');
    });

    it('allows searching by allowed token address locally', async () => {
        const component = createComponent();
        const tokens = [
            { address: TOKEN_A, symbol: 'AAA', name: 'Alpha Issuer', balance: '1', iconUrl: 'fallback' },
            { address: TOKEN_B, symbol: 'BBB', name: 'Beta Default', balance: '1', iconUrl: 'fallback' }
        ];

        setAllowedTokens(component, tokens);

        await component.handleTokenSearch(TOKEN_B, 'sell');

        const resultSymbols = Array.from(
            document.querySelectorAll('#sellTokenResultsList .token-item-symbol')
        ).map((element) => element.textContent.trim());

        expect(resultSymbols).toEqual(['BBB']);
    });

    it('renders unmatched token search text safely as plain text', async () => {
        const component = createComponent();
        const payload = '<img src=x onerror=alert(1)>';

        component.allowedTokens = [];
        component.tokens = [];
        component.tokensLoading = false;

        await component.handleTokenSearch(payload, 'sell');

        const resultContainer = document.getElementById('sellTokenResultsList');
        const emptyState = resultContainer?.querySelector('.token-list-empty');

        expect(emptyState?.textContent).toContain(payload);
        expect(resultContainer?.querySelector('img')).toBeNull();
        expect(resultContainer?.querySelector('script')).toBeNull();
        expect(resultContainer?.querySelector('input')).toBeNull();
    });

    it('keeps plain unmatched token search messaging unchanged', async () => {
        const component = createComponent();

        component.allowedTokens = [];
        component.tokens = [];
        component.tokensLoading = false;

        await component.handleTokenSearch('missing-token', 'sell');

        expect(document.querySelector('#sellTokenResultsList .token-list-empty')?.textContent)
            .toContain('No tokens found matching "missing-token"');
    });

    it('restores the full allowed token list when search is cleared', async () => {
        const component = createComponent();
        const tokens = [
            { address: TOKEN_A, symbol: 'AAA', name: 'Alpha Issuer', balance: '1', iconUrl: 'fallback' },
            { address: TOKEN_B, symbol: 'BBB', name: 'Beta Default', balance: '1', iconUrl: 'fallback' }
        ];

        setAllowedTokens(component, tokens);

        await component.handleTokenSearch('issuer', 'sell');
        await component.handleTokenSearch('', 'sell');

        const resultSymbols = Array.from(
            document.querySelectorAll('#sellAllowedTokenList .token-item-symbol')
        ).map((element) => element.textContent.trim());

        expect(resultSymbols).toEqual(['AAA.issuer', 'BBB']);
        expect(document.getElementById('sellTokenResultsSection')?.getAttribute('aria-hidden')).toBe('true');
        expect(document.querySelectorAll('#sellTokenResultsList .token-item-symbol')).toHaveLength(0);
    });

    it('preserves the filtered view when modal lists refresh', () => {
        const component = createComponent();
        const tokens = [
            { address: TOKEN_A, symbol: 'AAA', name: 'Alpha Issuer', balance: '1', iconUrl: 'fallback' },
            { address: TOKEN_B, symbol: 'BBB', name: 'Beta Default', balance: '1', iconUrl: 'fallback' }
        ];

        setAllowedTokens(component, tokens);

        const sellModal = document.getElementById('sellTokenModal');
        const searchInput = document.getElementById('sellTokenSearch');
        sellModal.style.display = 'block';
        searchInput.value = 'issuer';

        component.refreshOpenTokenModals();

        const resultSymbols = Array.from(
            document.querySelectorAll('#sellTokenResultsList .token-item-symbol')
        ).map((element) => element.textContent.trim());
        const allowedSymbols = Array.from(
            document.querySelectorAll('#sellAllowedTokenList .token-item-symbol')
        ).map((element) => element.textContent.trim());

        expect(resultSymbols).toEqual(['AAA.issuer']);
        expect(allowedSymbols).toEqual(['AAA.issuer', 'BBB']);
    });

    it('uses displaySymbol in zero-balance warning for sell selection', async () => {
        const component = createComponent();
        const warningSpy = vi.fn();
        component.showWarning = warningSpy;

        vi.spyOn(walletManager, 'isWalletConnected').mockReturnValue(true);

        const token = {
            address: TOKEN_A,
            symbol: 'AAA',
            displaySymbol: 'AAA.issuer',
            name: 'Alpha Issuer',
            balance: '0',
            iconUrl: 'fallback'
        };
        component.tokens = [token];

        const tokenItem = document.createElement('div');
        tokenItem.dataset.address = TOKEN_A;

        await component.handleTokenItemClick('sell', tokenItem);

        expect(warningSpy).toHaveBeenCalledTimes(1);
        expect(warningSpy.mock.calls[0][0]).toContain('AAA.issuer has no balance available for selling');
    });

    it('resets token selector button text to default when selected token is cleared', async () => {
        const component = createComponent();

        document.body.insertAdjacentHTML('beforeend', `
            <button id="buyTokenSelector"></button>
            <input id="buyToken" value="" />
            <div id="buyAmountUSD"></div>
            <button id="createOrderBtn"></button>
        `);

        const token = {
            address: TOKEN_A,
            symbol: 'AAA',
            displaySymbol: 'AAA.issuer',
            name: 'Alpha Issuer',
            balance: '1',
            decimals: 18,
            iconUrl: 'fallback'
        };

        await component.handleTokenSelect('buy', token);
        expect(document.getElementById('buyTokenSelector')?.textContent).toContain('AAA.issuer');

        await component.handleTokenSelect('buy', null);

        expect(document.getElementById('buyTokenSelector')?.textContent).toContain('Select token');
        expect(document.getElementById('buyTokenSelector')?.textContent).not.toContain('AAA.issuer');
        expect(document.getElementById('buyToken')?.value).toBe('');
    });
});
