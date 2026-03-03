import { afterEach, describe, expect, it } from 'vitest';
import { OrdersTableRenderer } from '../js/services/OrdersTableRenderer.js';

const POLYGON_LINK_POS = '0x53E0bca35eC356BD5ddDFebBD1Fc0fD03FaBad39';
const OTHER_LINK = '0x1111111111111111111111111111111111111111';
const USDC = '0x2222222222222222222222222222222222222222';

function createRenderer(tokens, chainId = '0x89') {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const tokenEntries = tokens.map((token) => [token.address.toLowerCase(), token]);
    const component = {
        container,
        tokenDisplaySymbolMap: null,
        createElement(tag, className = '') {
            const element = document.createElement(tag);
            if (className) {
                element.className = className;
            }
            return element;
        },
        ctx: {
            getWebSocket: () => ({
                tokenCache: new Map(tokenEntries)
            }),
            getWalletChainId: () => chainId
        }
    };

    return new OrdersTableRenderer(component, { showRefreshButton: false });
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('OrdersTableRenderer display symbols', () => {
    it('renders issuer-postfixed label for mapped symbol collisions', () => {
        const renderer = createRenderer([
            { address: POLYGON_LINK_POS, symbol: 'LINK' },
            { address: OTHER_LINK, symbol: 'LINK' },
            { address: USDC, symbol: 'USDC' }
        ], '0x89');

        const filterControls = renderer._createFilterControls(() => {});
        const sellOptions = Array.from(
            filterControls.querySelectorAll('#sell-token-filter option')
        ).map((option) => option.textContent.trim());

        expect(sellOptions).toEqual(['All Buy Tokens', 'LINK', 'LINK.pol', 'USDC']);
        expect(sellOptions.some((label) => /^LINK\.[a-f0-9]{4}$/i.test(label))).toBe(false);
        expect(renderer.component.tokenDisplaySymbolMap.get(POLYGON_LINK_POS.toLowerCase())).toBe('LINK.pol');
    });

    it('does not apply issuer postfix on non-mapped chains', () => {
        const renderer = createRenderer([
            { address: POLYGON_LINK_POS, symbol: 'LINK' },
            { address: OTHER_LINK, symbol: 'LINK' },
            { address: USDC, symbol: 'USDC' }
        ], '0x1');

        const filterControls = renderer._createFilterControls(() => {});
        const sellOptions = Array.from(
            filterControls.querySelectorAll('#sell-token-filter option')
        ).map((option) => option.textContent.trim());

        expect(sellOptions.includes('LINK.pol')).toBe(false);
        expect(sellOptions.filter((label) => label === 'LINK')).toHaveLength(2);
    });
});
