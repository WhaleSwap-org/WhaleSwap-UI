import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAllWalletTokens = vi.fn();
const mockGetContractAllowedTokens = vi.fn();

vi.mock('../js/utils/contractTokens.js', () => ({
    getAllWalletTokens: (...args) => mockGetAllWalletTokens(...args),
    getContractAllowedTokens: (...args) => mockGetContractAllowedTokens(...args),
    clearTokenCaches: vi.fn(),
}));

import { CreateOrder } from '../js/components/CreateOrder.js';

const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

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
            contract: {},
            provider: {},
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

function setupTokenModalDom() {
    document.body.innerHTML = `
        <div id="create-order"></div>
        <button id="sellTokenSelector" type="button">Sell</button>
        <button id="buyTokenSelector" type="button">Buy</button>
        <div id="sellTokenModal" class="token-modal">
            <button class="token-modal-close" type="button">x</button>
            <input id="sellTokenSearch" value="" />
            <div id="sellTokenResultsSection" class="token-section hidden" aria-hidden="true">
                <div id="sellTokenResultsList"></div>
            </div>
            <div id="sellAllowedTokenList"></div>
        </div>
        <div id="buyTokenModal" class="token-modal">
            <button class="token-modal-close" type="button">x</button>
            <input id="buyTokenSearch" value="" />
            <div id="buyTokenResultsSection" class="token-section hidden" aria-hidden="true">
                <div id="buyTokenResultsList"></div>
            </div>
            <div id="buyAllowedTokenList"></div>
        </div>
    `;
}

beforeEach(() => {
    vi.restoreAllMocks();
    mockGetAllWalletTokens.mockReset();
    mockGetContractAllowedTokens.mockReset();
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('CreateOrder lazy balance refresh', () => {
    it('does not eagerly refresh balances when loading allowed tokens', async () => {
        setupTokenModalDom();
        mockGetContractAllowedTokens.mockResolvedValue([
            {
                address: TOKEN_A,
                symbol: 'AAA',
                name: 'Alpha',
                decimals: 18,
                balance: null,
                balanceLoading: true,
                iconUrl: 'fallback',
            },
        ]);

        const component = new CreateOrder();
        component.setContext(createContextStub());

        const refreshSpy = vi
            .spyOn(component, 'refreshAllowedTokenBalancesInBackground')
            .mockResolvedValue([]);

        await component.loadContractTokens();

        expect(mockGetContractAllowedTokens).toHaveBeenCalledWith({ includeBalances: false });
        expect(refreshSpy).not.toHaveBeenCalled();
        expect(component.allowedTokens).toHaveLength(1);
        expect(component.allowedTokens[0].balanceLoading).toBe(true);
    });

    it('requests a visible balance refresh when create order is re-opened in connected mode', async () => {
        document.body.innerHTML = '<div id="create-order"></div>';

        const component = new CreateOrder();
        component.setContext(createContextStub());
        component.initialized = true;

        const refreshSpy = vi
            .spyOn(component, 'requestVisibleBalanceRefresh')
            .mockResolvedValue([]);

        await component.initialize(false);

        expect(refreshSpy).toHaveBeenCalledWith('tab-active');
        expect(component.isReadOnlyMode).toBe(false);
    });

    it('refreshes balances when a token selector is opened without blocking the modal', () => {
        setupTokenModalDom();

        const component = new CreateOrder();
        component.setContext(createContextStub());
        component.allowedTokens = [
            {
                address: TOKEN_A,
                symbol: 'AAA',
                name: 'Alpha',
                decimals: 18,
                balance: '0',
                balanceLoading: true,
                iconUrl: 'fallback',
            },
        ];

        const refreshSpy = vi
            .spyOn(component, 'requestVisibleBalanceRefresh')
            .mockResolvedValue([]);
        vi.spyOn(component, 'refreshContractDisabledState').mockResolvedValue(false);

        component.initializeTokenSelectors();
        document.getElementById('sellTokenSelector')?.dispatchEvent(
            new MouseEvent('click', { bubbles: true })
        );

        expect(document.getElementById('sellTokenModal')?.style.display).toBe('block');
        expect(refreshSpy).toHaveBeenCalledWith('sell-selector-open');
    });

    it('refreshes balances after a forced allowed-token reload in connected mode', async () => {
        setupTokenModalDom();
        mockGetContractAllowedTokens.mockResolvedValue([
            {
                address: TOKEN_A,
                symbol: 'AAA',
                name: 'Alpha',
                decimals: 18,
                balance: null,
                balanceLoading: true,
                iconUrl: 'fallback',
            },
        ]);

        const component = new CreateOrder();
        component.setContext(createContextStub());
        component.isReadOnlyMode = false;

        const refreshSpy = vi
            .spyOn(component, 'requestVisibleBalanceRefresh')
            .mockResolvedValue([]);

        await component.requestAllowedTokensRefresh({
            forceFresh: true,
            source: 'AllowedTokensUpdated',
        });

        expect(refreshSpy).toHaveBeenCalledWith('AllowedTokensUpdated:post-force-refresh');
    });

    it('renders disconnected token rows without loading placeholders', () => {
        setupTokenModalDom();

        const component = new CreateOrder();
        component.setContext(createContextStub());
        component.isReadOnlyMode = true;

        const listContainer = document.createElement('div');
        component.displayTokens([
            {
                address: TOKEN_A,
                symbol: 'AAA',
                name: 'Alpha',
                decimals: 18,
                balance: null,
                balanceLoading: true,
                iconUrl: 'fallback',
            },
        ], listContainer, 'sell');

        expect(listContainer.textContent).toContain('0.00');
        expect(listContainer.textContent).not.toContain('loading...');
        expect(listContainer.textContent).not.toContain('balances loading...');
    });

    it('preserves allowed tokens during disconnect-style reset', () => {
        document.body.innerHTML = '<div id="create-order"></div>';

        const component = new CreateOrder();
        component.setContext(createContextStub());
        component.tokens = [{ address: TOKEN_A, symbol: 'AAA', balance: '12.5', balanceLoading: false }];
        component.allowedTokens = [{ address: TOKEN_A, symbol: 'AAA', balance: '12.5', balanceLoading: false }];

        component.resetState({ clearSelections: true, preserveAllowedTokens: true });

        expect(component.tokens).toEqual([{ address: TOKEN_A, symbol: 'AAA', balance: null, balanceLoading: true }]);
        expect(component.allowedTokens).toEqual([{ address: TOKEN_A, symbol: 'AAA', balance: null, balanceLoading: true }]);
        expect(component.isReadOnlyMode).toBe(true);
        expect(component.initialized).toBe(false);
    });
});
