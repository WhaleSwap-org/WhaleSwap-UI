import { afterEach, describe, expect, it } from 'vitest';
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

function setupModalDom() {
    document.body.innerHTML = `
        <div id="create-order"></div>
        <button id="sellTokenSelector" type="button">Sell</button>
        <button id="buyTokenSelector" type="button">Buy</button>
        <div id="sellTokenModal" class="token-modal">
            <button class="token-modal-close" type="button">x</button>
        </div>
        <div id="buyTokenModal" class="token-modal">
            <button class="token-modal-close" type="button">x</button>
        </div>
        <div id="admin-delete-token-modal" class="token-modal"></div>
    `;
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('CreateOrder outside-click modal handling', () => {
    it('closes only CreateOrder token modals on backdrop click', () => {
        setupModalDom();

        const component = new CreateOrder();
        component.setContext(createContextStub());
        component.initializeTokenSelectors();

        const adminModal = document.getElementById('admin-delete-token-modal');
        const sellModal = document.getElementById('sellTokenModal');

        expect(adminModal).toBeTruthy();
        expect(sellModal).toBeTruthy();

        adminModal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(adminModal.style.display).toBe('');

        sellModal.style.display = 'block';
        sellModal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(sellModal.style.display).toBe('none');

        component.cleanup();
    });
});
