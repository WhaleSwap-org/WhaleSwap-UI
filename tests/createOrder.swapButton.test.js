import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrder } from '../js/components/CreateOrder.js';

const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function createContextStub() {
    return {
        getPricing: () => ({
            getPrice: () => undefined,
            isPriceEstimated: () => false,
            fetchPricesForTokens: async () => {},
            subscribe: () => {},
            unsubscribe: () => {},
        }),
        getWebSocket: () => ({
            isInitialized: true,
        }),
        getWallet: () => ({
            isWalletConnected: () => true,
            getAccount: () => '0x3333333333333333333333333333333333333333',
        }),
        getWalletChainId: () => '0x89',
        showError: () => {},
        showSuccess: () => {},
        showWarning: () => {},
        showInfo: () => {},
    };
}

function createToken(address, {
    symbol,
    displaySymbol = symbol,
    balance = '0',
    balanceLoading = false,
    decimals = 18,
} = {}) {
    return {
        address,
        symbol,
        displaySymbol,
        name: `${symbol} Token`,
        balance,
        balanceLoading,
        decimals,
        iconUrl: 'fallback',
    };
}

function setupCreateOrderDom(component) {
    document.getElementById('create-order').innerHTML = component.render();
    component.populateTokenDropdowns();
    component.setupCreateOrderListener();
    component.initializeAmountInputs();
    component.initializeTakerAddressInput();
    component.updateSellAmountMax();
}

function createComponent() {
    document.body.innerHTML = '<div id="create-order"></div>';
    const component = new CreateOrder();
    component.setContext(createContextStub());
    component.isReadOnlyMode = false;
    setupCreateOrderDom(component);
    return component;
}

function setAllowedTokens(component, tokens) {
    const normalizedTokens = tokens.map((token) => component.normalizeTokenDisplay(token));
    component.tokens = normalizedTokens;
    component.allowedTokens = normalizedTokens;
    component.tokensLoading = false;
    return normalizedTokens;
}

async function flushAsyncWork() {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('CreateOrder swap button', () => {
    it('swaps selected tokens and amounts using cached balances without refreshing balances', async () => {
        const component = createComponent();
        const warningSpy = vi.fn();
        component.showWarning = warningSpy;

        const refreshSpy = vi
            .spyOn(component, 'requestVisibleBalanceRefresh')
            .mockResolvedValue([]);

        const [sellToken, buyToken] = setAllowedTokens(component, [
            createToken(TOKEN_A, { symbol: 'AAA', balance: '10' }),
            createToken(TOKEN_B, { symbol: 'BBB', balance: '5' }),
        ]);

        await component.handleTokenSelect('sell', sellToken, { focusInput: false });
        await component.handleTokenSelect('buy', buyToken, { focusInput: false });

        document.getElementById('sellAmount').value = '1.25';
        document.getElementById('buyAmount').value = '2.5';
        document.getElementById('takerAddress').value = '0x1234';

        document.getElementById('swapOrderSidesButton').click();
        await flushAsyncWork();

        expect(component.sellToken?.address).toBe(TOKEN_B);
        expect(component.buyToken?.address).toBe(TOKEN_A);
        expect(document.getElementById('sellAmount').value).toBe('2.5');
        expect(document.getElementById('buyAmount').value).toBe('1.25');
        expect(document.getElementById('sellTokenSelector')?.textContent).toContain('BBB');
        expect(document.getElementById('buyTokenSelector')?.textContent).toContain('AAA');
        expect(document.getElementById('sellTokenBalanceAmount')?.textContent).toBe('5.00');
        expect(document.getElementById('sellAmountMax')?.style.display).toBe('inline');
        expect(document.getElementById('takerAddress')?.value).toBe('0x1234');
        expect(refreshSpy).not.toHaveBeenCalled();
        expect(warningSpy).not.toHaveBeenCalled();
    });

    it('blocks swapping when the post-swap sell token has no cached balance', async () => {
        const component = createComponent();
        const warningSpy = vi.fn();
        component.showWarning = warningSpy;

        const [sellToken, buyToken] = setAllowedTokens(component, [
            createToken(TOKEN_A, { symbol: 'AAA', balance: '10' }),
            createToken(TOKEN_B, { symbol: 'BBB', balance: '0' }),
        ]);

        await component.handleTokenSelect('sell', sellToken, { focusInput: false });
        await component.handleTokenSelect('buy', buyToken, { focusInput: false });

        document.getElementById('sellAmount').value = '1';
        document.getElementById('buyAmount').value = '2';

        document.getElementById('swapOrderSidesButton').click();
        await flushAsyncWork();

        expect(component.sellToken?.address).toBe(TOKEN_A);
        expect(component.buyToken?.address).toBe(TOKEN_B);
        expect(document.getElementById('sellAmount').value).toBe('1');
        expect(document.getElementById('buyAmount').value).toBe('2');
        expect(warningSpy).toHaveBeenCalledTimes(1);
        expect(warningSpy.mock.calls[0][0]).toBe('Cannot swap: you have no balance of BBB to sell.');
    });

    it('blocks swapping while the post-swap sell token balance is still loading', async () => {
        const component = createComponent();
        const warningSpy = vi.fn();
        component.showWarning = warningSpy;

        const [sellToken, buyToken] = setAllowedTokens(component, [
            createToken(TOKEN_A, { symbol: 'AAA', balance: '10' }),
            createToken(TOKEN_B, { symbol: 'BBB', balance: '0', balanceLoading: true }),
        ]);

        await component.handleTokenSelect('sell', sellToken, { focusInput: false });
        await component.handleTokenSelect('buy', buyToken, { focusInput: false });

        document.getElementById('swapOrderSidesButton').click();
        await flushAsyncWork();

        expect(component.sellToken?.address).toBe(TOKEN_A);
        expect(component.buyToken?.address).toBe(TOKEN_B);
        expect(warningSpy).toHaveBeenCalledTimes(1);
        expect(warningSpy.mock.calls[0][0]).toBe('Cannot swap: BBB balance is still loading. Please try again in a moment.');
    });

    it('blocks swapping when the cached balance is lower than the swapped sell amount', async () => {
        const component = createComponent();
        const warningSpy = vi.fn();
        component.showWarning = warningSpy;

        const [sellToken, buyToken] = setAllowedTokens(component, [
            createToken(TOKEN_A, { symbol: 'AAA', balance: '10' }),
            createToken(TOKEN_B, { symbol: 'BBB', balance: '1.5' }),
        ]);

        await component.handleTokenSelect('sell', sellToken, { focusInput: false });
        await component.handleTokenSelect('buy', buyToken, { focusInput: false });

        document.getElementById('sellAmount').value = '1';
        document.getElementById('buyAmount').value = '2.5';

        document.getElementById('swapOrderSidesButton').click();
        await flushAsyncWork();

        expect(component.sellToken?.address).toBe(TOKEN_A);
        expect(component.buyToken?.address).toBe(TOKEN_B);
        expect(document.getElementById('sellAmount').value).toBe('1');
        expect(document.getElementById('buyAmount').value).toBe('2.5');
        expect(warningSpy).toHaveBeenCalledTimes(1);
        expect(warningSpy.mock.calls[0][0]).toContain('Cannot swap: you need 2.5 BBB');
        expect(warningSpy.mock.calls[0][0]).toContain('1.5 BBB available to sell');
    });
});
