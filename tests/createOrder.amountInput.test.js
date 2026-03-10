import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrder } from '../js/components/CreateOrder.js';

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

function setupInputs() {
    document.body.innerHTML = `
        <div id="create-order"></div>
        <input id="sellAmount" type="text" />
        <input id="buyAmount" type="text" />
    `;
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
});
