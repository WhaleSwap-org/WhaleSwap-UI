import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
        <div id="sellContractResult"></div>
    `;
    const component = new CreateOrder();
    component.setContext(createContextStub());
    return component;
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

    it('allows searching by displaySymbol', async () => {
        const component = createComponent();
        const tokens = [
            { address: TOKEN_A, symbol: 'AAA', name: 'Alpha Issuer', balance: '1', iconUrl: 'fallback' },
            { address: TOKEN_B, symbol: 'AAA', name: 'Alpha Default', balance: '1', iconUrl: 'fallback' }
        ];
        component.tokenDisplaySymbolMap = buildTokenDisplaySymbolMap(tokens, '0x89', TEST_SUFFIXES);
        component.tokens = tokens.map((token) => component.normalizeTokenDisplay(token));
        component.tokensLoading = false;
        component.renderTokenIcon = vi.fn();

        await component.handleTokenSearch('issuer', 'sell');

        const resultSymbols = Array.from(
            document.querySelectorAll('#sellContractResult .token-item-symbol')
        ).map((element) => element.textContent.trim());

        expect(resultSymbols).toEqual(['AAA.issuer']);
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

    it('formats balance chip USD text without duplicating the dollar sign', () => {
        const component = createComponent();

        document.body.insertAdjacentHTML('beforeend', `
            <button id="sellTokenBalanceBtn" type="button"></button>
            <div id="sellTokenBalanceDisplay"></div>
            <div id="sellTokenBalanceAmount"></div>
            <div id="sellTokenBalanceUSD"></div>
        `);

        component.updateBalanceDisplay('sell', '1.25', '$3.50');
        expect(document.getElementById('sellTokenBalanceUSD')?.textContent).toBe('• $3.50');

        component.updateBalanceDisplay('sell', 'loading...', 'loading...');
        expect(document.getElementById('sellTokenBalanceUSD')?.textContent).toBe('• loading...');
    });

    it('returns $0.00 immediately for zero balances even while price loading is pending', () => {
        const component = createComponent();
        component.setContext({
            ...createContextStub(),
            getPricing: () => ({
                shouldShowPriceLoading: () => true,
                getPrice: () => undefined,
                isPriceEstimated: () => false,
                fetchPricesForTokens: async () => {}
            })
        });

        expect(component.formatTokenListUsdValue(TOKEN_A, '0')).toBe('$0.00');
    });
});
