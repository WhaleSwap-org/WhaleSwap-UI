import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrder } from '../js/components/CreateOrder.js';
import { buildTokenDisplaySymbolMap } from '../js/utils/tokenDisplay.js';
import { walletManager } from '../js/services/WalletManager.js';

const POLYGON_LINK_POS = '0x53E0bca35eC356BD5ddDFebBD1Fc0fD03FaBad39';
const OTHER_LINK = '0x1111111111111111111111111111111111111111';
const USDC = '0x2222222222222222222222222222222222222222';

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
            { address: POLYGON_LINK_POS, symbol: 'LINK', name: 'Chainlink PoS', balance: '1', iconUrl: 'fallback' },
            { address: OTHER_LINK, symbol: 'LINK', name: 'Other Link', balance: '1', iconUrl: 'fallback' },
            { address: USDC, symbol: 'USDC', name: 'USD Coin', balance: '1', iconUrl: 'fallback' }
        ];
        component.tokenDisplaySymbolMap = buildTokenDisplaySymbolMap(tokens, '0x89');

        const listContainer = document.createElement('div');
        component.displayTokens(tokens, listContainer, 'buy');

        const labels = Array.from(listContainer.querySelectorAll('.token-item-symbol'))
            .map((element) => element.textContent.trim());

        expect(labels).toEqual(['LINK', 'LINK.pol', 'USDC']);
    });

    it('allows searching by displaySymbol', async () => {
        const component = createComponent();
        const tokens = [
            { address: POLYGON_LINK_POS, symbol: 'LINK', name: 'Chainlink PoS', balance: '1', iconUrl: 'fallback' },
            { address: OTHER_LINK, symbol: 'LINK', name: 'Other Link', balance: '1', iconUrl: 'fallback' }
        ];
        component.tokenDisplaySymbolMap = buildTokenDisplaySymbolMap(tokens, '0x89');
        component.tokens = tokens.map((token) => component.normalizeTokenDisplay(token));
        component.tokensLoading = false;
        component.renderTokenIcon = vi.fn();

        await component.handleTokenSearch('pol', 'sell');

        const resultSymbols = Array.from(
            document.querySelectorAll('#sellContractResult .token-item-symbol')
        ).map((element) => element.textContent.trim());

        expect(resultSymbols).toEqual(['LINK.pol']);
    });

    it('uses displaySymbol in zero-balance warning for sell selection', async () => {
        const component = createComponent();
        const warningSpy = vi.fn();
        component.showWarning = warningSpy;

        vi.spyOn(walletManager, 'isWalletConnected').mockReturnValue(true);

        const token = {
            address: POLYGON_LINK_POS,
            symbol: 'LINK',
            displaySymbol: 'LINK.pol',
            name: 'Chainlink PoS',
            balance: '0',
            iconUrl: 'fallback'
        };
        component.tokens = [token];

        const tokenItem = document.createElement('div');
        tokenItem.dataset.address = POLYGON_LINK_POS;

        await component.handleTokenItemClick('sell', tokenItem);

        expect(warningSpy).toHaveBeenCalledTimes(1);
        expect(warningSpy.mock.calls[0][0]).toContain('LINK.pol has no balance available for selling');
    });
});
