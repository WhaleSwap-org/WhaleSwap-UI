import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrder } from '../js/components/CreateOrder.js';

function createPricingStub(overrides = {}) {
    return {
        getPrice: () => undefined,
        isPriceEstimated: () => false,
        fetchPricesForTokens: async () => {},
        subscribe: () => {},
        unsubscribe: () => {},
        ...overrides
    };
}

function createContextStub({ pricing } = {}) {
    const pricingService = pricing || createPricingStub();

    return {
        getPricing: () => pricingService,
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

function setupInputs() {
    document.body.innerHTML = `
        <div id="create-order"></div>
        <input id="sellAmount" type="text" />
        <input id="buyAmount" type="text" />
    `;
}

function setupSuggestionInputs() {
    document.body.innerHTML = `
        <div id="create-order"></div>
        <input id="sellAmount" type="text" />
        <div id="sellAmountUSD" class="amount-usd is-hidden" aria-hidden="true"></div>
        <button id="sellAmountSuggestion" type="button" class="amount-suggestion is-hidden" aria-hidden="true"></button>
        <input id="buyAmount" type="text" />
        <div id="buyAmountUSD" class="amount-usd is-hidden" aria-hidden="true"></div>
        <button id="buyAmountSuggestion" type="button" class="amount-suggestion is-hidden" aria-hidden="true"></button>
    `;
}

function createSelectedToken(address, { decimals = 18, usdPrice } = {}) {
    return {
        address,
        decimals,
        usdPrice
    };
}

async function waitForBlurHandlers() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('CreateOrder amount input sanitizing', () => {
    it('keeps only digits and a single decimal point while typing', () => {
        setupInputs();

        const component = new CreateOrder();
        component.setContext(createContextStub());
        const updateTokenAmountsSpy = vi.spyOn(component, 'updateTokenAmounts').mockImplementation(() => {});

        component.initializeAmountInputs();

        const sellAmountInput = document.getElementById('sellAmount');
        sellAmountInput.value = '1e2..3-4abc';
        sellAmountInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(sellAmountInput.value).toBe('12.34');
        expect(sellAmountInput.getAttribute('inputmode')).toBe('decimal');
        expect(updateTokenAmountsSpy).toHaveBeenCalledWith('sell');
    });

    it('accepts positive decimal strings and rejects malformed values at submit validation', () => {
        setupInputs();

        const component = new CreateOrder();

        expect(component.isValidPositiveAmount('12')).toBe(true);
        expect(component.isValidPositiveAmount('12.34')).toBe(true);
        expect(component.isValidPositiveAmount('.5')).toBe(true);
        expect(component.isValidPositiveAmount('1.')).toBe(true);
        expect(component.isValidPositiveAmount('')).toBe(false);
        expect(component.isValidPositiveAmount('.')).toBe(false);
        expect(component.isValidPositiveAmount('0')).toBe(false);
        expect(component.isValidPositiveAmount('1..2')).toBe(false);
        expect(component.isValidPositiveAmount('1e2')).toBe(false);
    });

    it('caps fractional precision to the selected token decimals', () => {
        setupInputs();

        const component = new CreateOrder();
        component.setContext(createContextStub());
        component.sellToken = { decimals: 2 };

        component.initializeAmountInputs();

        const sellAmountInput = document.getElementById('sellAmount');
        sellAmountInput.value = '123.4567';
        sellAmountInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(sellAmountInput.value).toBe('123.45');
    });

    it('removes the decimal portion entirely for zero-decimal tokens', () => {
        setupInputs();

        const component = new CreateOrder();
        component.setContext(createContextStub());
        component.buyToken = { decimals: 0 };

        component.initializeAmountInputs();

        const buyAmountInput = document.getElementById('buyAmount');
        buyAmountInput.value = '987.65';
        buyAmountInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(buyAmountInput.value).toBe('987');
    });

    it('hides the USD preview for a lone decimal input', () => {
        document.body.innerHTML = `
            <div id="create-order"></div>
            <input id="sellAmount" type="text" />
            <div id="sellAmountUSD" class="amount-usd"></div>
        `;

        const component = new CreateOrder();
        component.setContext(createContextStub());
        component.sellToken = { decimals: 18, usdPrice: 2 };

        const updateCreateButtonStateSpy = vi.spyOn(component, 'updateCreateButtonState').mockImplementation(() => {});

        component.initializeAmountInputs();

        const sellAmountInput = document.getElementById('sellAmount');
        const sellAmountUsd = document.getElementById('sellAmountUSD');
        sellAmountInput.value = '.';
        sellAmountInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(sellAmountUsd.textContent).not.toContain('NaN');
        expect(sellAmountUsd.classList.contains('is-hidden')).toBe(true);
        expect(sellAmountUsd.getAttribute('aria-hidden')).toBe('true');
        expect(updateCreateButtonStateSpy).toHaveBeenCalled();
    });

    it('shows a sub-cent USD preview without rounding down to zero', () => {
        document.body.innerHTML = `
            <div id="create-order"></div>
            <input id="sellAmount" type="text" />
            <div id="sellAmountUSD" class="amount-usd is-hidden" aria-hidden="true"></div>
        `;

        const component = new CreateOrder();
        component.setContext(createContextStub());
        component.sellToken = { decimals: 18, usdPrice: 0.005 };

        component.initializeAmountInputs();

        const sellAmountInput = document.getElementById('sellAmount');
        const sellAmountUsd = document.getElementById('sellAmountUSD');
        sellAmountInput.value = '1';
        sellAmountInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(sellAmountUsd.textContent).toBe('<$0.01');
        expect(sellAmountUsd.classList.contains('is-hidden')).toBe(false);
        expect(sellAmountUsd.getAttribute('aria-hidden')).toBe('false');
    });
});

describe('CreateOrder focused amount suggestions', () => {
    it('shows a suggestion only for the focused field when both tokens, prices, and the opposite amount exist', () => {
        setupSuggestionInputs();

        const pricing = createPricingStub({
            getPrice: (address) => {
                if (address === '0xsell') return 2;
                if (address === '0xbuy') return 4;
                return undefined;
            }
        });

        const component = new CreateOrder();
        component.setContext(createContextStub({ pricing }));
        component.sellToken = createSelectedToken('0xsell', { decimals: 18, usdPrice: 99 });
        component.buyToken = createSelectedToken('0xbuy', { decimals: 18, usdPrice: 99 });

        component.initializeAmountInputs();

        const sellAmountInput = document.getElementById('sellAmount');
        const sellSuggestion = document.getElementById('sellAmountSuggestion');
        const buyAmountInput = document.getElementById('buyAmount');
        const buySuggestion = document.getElementById('buyAmountSuggestion');

        sellAmountInput.value = '4';
        buyAmountInput.focus();

        expect(buySuggestion.textContent).toBe('2');
        expect(buySuggestion.classList.contains('is-hidden')).toBe(false);
        expect(buySuggestion.getAttribute('aria-hidden')).toBe('false');
        expect(sellSuggestion.classList.contains('is-hidden')).toBe(true);
    });

    it('moves the suggestion to the newly focused field and hides the previous one', async () => {
        setupSuggestionInputs();

        const pricing = createPricingStub({
            getPrice: (address) => {
                if (address === '0xsell') return 2;
                if (address === '0xbuy') return 4;
                return undefined;
            }
        });

        const component = new CreateOrder();
        component.setContext(createContextStub({ pricing }));
        component.sellToken = createSelectedToken('0xsell', { decimals: 18, usdPrice: 2 });
        component.buyToken = createSelectedToken('0xbuy', { decimals: 18, usdPrice: 4 });

        component.initializeAmountInputs();

        const sellAmountInput = document.getElementById('sellAmount');
        const sellSuggestion = document.getElementById('sellAmountSuggestion');
        const buyAmountInput = document.getElementById('buyAmount');
        const buySuggestion = document.getElementById('buyAmountSuggestion');

        sellAmountInput.value = '4';
        buyAmountInput.value = '3';

        buyAmountInput.focus();
        expect(buySuggestion.textContent).toBe('2');

        sellAmountInput.focus();
        await waitForBlurHandlers();

        expect(sellSuggestion.textContent).toBe('6');
        expect(sellSuggestion.classList.contains('is-hidden')).toBe(false);
        expect(buySuggestion.classList.contains('is-hidden')).toBe(true);
    });

    it('fills the focused input with the suggested amount when the suggestion is clicked', () => {
        setupSuggestionInputs();

        const pricing = createPricingStub({
            getPrice: (address) => {
                if (address === '0xsell') return 2;
                if (address === '0xbuy') return 4;
                return undefined;
            }
        });

        const component = new CreateOrder();
        component.setContext(createContextStub({ pricing }));
        component.sellToken = createSelectedToken('0xsell', { decimals: 18, usdPrice: 2 });
        component.buyToken = createSelectedToken('0xbuy', { decimals: 18, usdPrice: 4 });

        const updateTokenAmountsSpy = vi.spyOn(component, 'updateTokenAmounts');

        component.initializeAmountInputs();

        const sellAmountInput = document.getElementById('sellAmount');
        const buyAmountInput = document.getElementById('buyAmount');
        const buySuggestion = document.getElementById('buyAmountSuggestion');

        sellAmountInput.value = '4';
        buyAmountInput.focus();
        buySuggestion.click();

        expect(buyAmountInput.value).toBe('2');
        expect(updateTokenAmountsSpy).toHaveBeenCalledWith('buy');
        expect(document.activeElement).toBe(buyAmountInput);
    });

    it('keeps suggestions hidden when tokens, prices, or the opposite amount are missing', () => {
        setupSuggestionInputs();

        const pricing = createPricingStub({
            getPrice: (address) => {
                if (address === '0xsell') return 2;
                return undefined;
            }
        });

        const component = new CreateOrder();
        component.setContext(createContextStub({ pricing }));
        component.sellToken = createSelectedToken('0xsell', { decimals: 18, usdPrice: 2 });
        component.buyToken = createSelectedToken('0xbuy', { decimals: 18, usdPrice: undefined });

        component.initializeAmountInputs();

        const sellAmountInput = document.getElementById('sellAmount');
        const buyAmountInput = document.getElementById('buyAmount');
        const buySuggestion = document.getElementById('buyAmountSuggestion');

        buyAmountInput.focus();
        expect(buySuggestion.classList.contains('is-hidden')).toBe(true);

        sellAmountInput.value = '.';
        sellAmountInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(buySuggestion.classList.contains('is-hidden')).toBe(true);

        sellAmountInput.value = '5';
        sellAmountInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(buySuggestion.classList.contains('is-hidden')).toBe(true);

        component.sellToken = null;
        component.refreshActiveAmountSuggestion();
        expect(buySuggestion.classList.contains('is-hidden')).toBe(true);
    });

    it('formats suggested amounts to the target token precision without grouping separators', () => {
        document.body.innerHTML = '<div id="create-order"></div>';

        const component = new CreateOrder();
        component.buyToken = createSelectedToken('0xbuy', { decimals: 4 });

        expect(component.formatSuggestedAmount('buy', 1.23)).toBe('1.23');
        expect(component.formatSuggestedAmount('buy', 1.234567)).toBe('1.2346');
    });

    it('refreshes USD previews and suggestions from live pricing updates instead of stale selected-token prices', () => {
        setupSuggestionInputs();

        let pricingSubscriber = null;
        const livePrices = new Map([
            ['0xsell', 1],
            ['0xbuy', 2],
        ]);
        const pricing = createPricingStub({
            getPrice: (address) => livePrices.get(address),
            subscribe: (callback) => {
                pricingSubscriber = callback;
            },
            unsubscribe: () => {}
        });

        const component = new CreateOrder();
        component.setContext(createContextStub({ pricing }));
        component.sellToken = createSelectedToken('0xsell', { decimals: 18, usdPrice: 99 });
        component.buyToken = createSelectedToken('0xbuy', { decimals: 18, usdPrice: 99 });

        component.initializeAmountInputs();
        component.subscribeToPricingUpdates();

        const sellAmountInput = document.getElementById('sellAmount');
        const sellAmountUsd = document.getElementById('sellAmountUSD');
        const buyAmountInput = document.getElementById('buyAmount');
        const buySuggestion = document.getElementById('buyAmountSuggestion');

        sellAmountInput.value = '3';
        buyAmountInput.focus();
        component.updateTokenAmounts('sell');

        expect(sellAmountUsd.textContent).toBe('$3.00');
        expect(buySuggestion.textContent).toBe('1.5');

        livePrices.set('0xsell', 6);
        livePrices.set('0xbuy', 3);
        pricingSubscriber?.('priceUpdates');

        expect(sellAmountUsd.textContent).toBe('$18.00');
        expect(buySuggestion.textContent).toBe('6');
    });
});
