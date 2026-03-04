import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../js/utils/claims.js', () => ({
    getClaimableSnapshot: vi.fn()
}));

import { Claim } from '../js/components/Claim.js';
import { getClaimableSnapshot } from '../js/utils/claims.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const POLYGON_LINK_POS = '0x53E0bca35eC356BD5ddDFebBD1Fc0fD03FaBad39';

function createComponent() {
    document.body.innerHTML = '<div id="claim"></div>';

    const ws = {
        contract: {},
        subscribe: vi.fn(),
        unsubscribe: vi.fn()
    };

    const component = new Claim();
    component.setContext({
        getWalletChainId: () => '0x89',
        getWallet: () => ({
            isWalletConnected: () => true,
            getAccount: () => ACCOUNT
        }),
        getWebSocket: () => ws,
        showError: () => {},
        showSuccess: () => {},
        showWarning: () => {},
        showInfo: () => {}
    });

    component.webSocket = ws;
    component.contract = ws.contract;
    component.currentMode = false;
    component.renderShell();

    return component;
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('Claim display symbols', () => {
    it('renders mapped display symbol in claim rows', async () => {
        getClaimableSnapshot.mockResolvedValue([
            {
                token: POLYGON_LINK_POS,
                tokenLower: POLYGON_LINK_POS.toLowerCase(),
                symbol: 'LINK',
                name: 'ChainLink Token',
                amount: '1000000000000000000',
                formattedAmount: '1.0',
                decimals: 18,
                iconUrl: 'fallback'
            }
        ]);

        const component = createComponent();
        await component.refreshClaimables();

        const symbol = component.container.querySelector('.claim-token-symbol')?.textContent?.trim();
        expect(symbol).toBe('LINK.pol');
    });

    it('escapes claim row symbol, name, and amount text', () => {
        const component = createComponent();

        component.renderClaimRows([
            {
                token: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                tokenLower: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                symbol: 'SAFE',
                displaySymbol: '<b>BAD</b>',
                name: '<img src=x onerror=1>',
                formattedAmount: '1<2',
                iconUrl: 'fallback'
            }
        ]);

        const symbol = component.container.querySelector('.claim-token-symbol');
        const name = component.container.querySelector('.claim-token-name');
        const amount = component.container.querySelector('.claim-amount');

        expect(symbol?.textContent).toBe('<b>BAD</b>');
        expect(name?.textContent).toBe('<img src=x onerror=1>');
        expect(amount?.textContent).toBe('1<2');
        expect(symbol?.querySelector('b')).toBeNull();
        expect(name?.querySelector('img')).toBeNull();
    });
});
