import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { getDefaultNetwork } from '../js/config/networks.js';

const mockGetAllWalletTokens = vi.fn();
const mockGetContractAllowedTokens = vi.fn();
const mockGetTokenBalanceInfo = vi.fn();

vi.mock('../js/utils/contractTokens.js', () => ({
    getAllWalletTokens: (...args) => mockGetAllWalletTokens(...args),
    getContractAllowedTokens: (...args) => mockGetContractAllowedTokens(...args),
    getTokenBalanceInfo: (...args) => mockGetTokenBalanceInfo(...args),
    clearTokenCaches: vi.fn(),
}));

import { CreateOrder } from '../js/components/CreateOrder.js';

const FEE_TOKEN = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

function createContextStub({ connected = true } = {}) {
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
            isWalletConnected: () => connected,
            getAccount: () => connected ? '0x3333333333333333333333333333333333333333' : null,
        }),
        getWalletChainId: () => '0x89',
        showError: () => {},
        showSuccess: () => {},
        showWarning: () => {},
        showInfo: () => {},
    };
}

function createComponent({ connected = true } = {}) {
    document.body.innerHTML = '<div id="create-order"></div>';
    const component = new CreateOrder();
    component.setContext(createContextStub({ connected }));
    component.container.innerHTML = component.render();
    return component;
}

beforeEach(() => {
    vi.restoreAllMocks();
    mockGetAllWalletTokens.mockReset();
    mockGetContractAllowedTokens.mockReset();
    mockGetTokenBalanceInfo.mockReset();
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('CreateOrder fee display', () => {
    it('renders the fee token with a standalone explorer icon link and wallet balance text', () => {
        const component = createComponent({ connected: true });
        component.isReadOnlyMode = false;
        component.feeToken = {
            address: FEE_TOKEN,
            amount: ethers.utils.parseUnits('1.5', 6),
            symbol: 'USDC',
            decimals: 6,
            balance: '42.123456',
            balanceLoading: false,
        };

        component.updateFeeDisplay();

        expect(document.querySelector('.fee-amount-value')?.textContent).toBe('1.5');
        expect(document.querySelector('.fee-token-symbol-label')?.textContent).toBe('USDC');
        expect(document.querySelector('.fee-token-explorer-link')?.getAttribute('href'))
            .toBe(`${getDefaultNetwork().explorer}/token/${ethers.utils.getAddress(FEE_TOKEN)}`);
        expect(document.querySelector('.fee-balance')?.classList.contains('is-hidden')).toBe(false);
        expect(document.querySelector('.fee-balance-value')?.textContent).toBe('42.1235');
        expect(document.querySelector('.fee-balance-value')?.classList.contains('fee-balance-value--insufficient')).toBe(false);
    });

    it('highlights fee balance in red when balance is below required fee amount', () => {
        const component = createComponent({ connected: true });
        component.isReadOnlyMode = false;
        component.feeToken = {
            address: FEE_TOKEN,
            amount: ethers.utils.parseUnits('1', 6),
            symbol: 'USDC',
            decimals: 6,
            balance: '0.5',
            balanceLoading: false,
        };

        component.updateFeeDisplay();

        expect(document.querySelector('.fee-balance-value')?.textContent).toBe('0.50');
        expect(document.querySelector('.fee-balance-value')?.classList.contains('fee-balance-value--insufficient')).toBe(true);
    });

    it('refreshes the fee token wallet balance through the connected refresh path', async () => {
        const component = createComponent({ connected: true });
        component.isReadOnlyMode = false;
        component.allowedTokens = [
            {
                address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                symbol: 'AAA',
                balance: '0',
                balanceLoading: false,
            },
        ];
        component.feeToken = {
            address: FEE_TOKEN,
            amount: ethers.utils.parseUnits('2', 6),
            symbol: 'USDC',
            decimals: 6,
            balance: null,
            balanceLoading: false,
        };

        vi.spyOn(component, 'refreshAllowedTokenBalancesInBackground').mockResolvedValue(component.allowedTokens);
        mockGetTokenBalanceInfo.mockResolvedValue({
            type: 'ok',
            balance: '7.5',
            symbol: 'USDC',
            decimals: 6,
        });

        await component.requestVisibleBalanceRefresh('tab-active');

        expect(mockGetTokenBalanceInfo).toHaveBeenCalledWith(FEE_TOKEN);
        expect(component.feeToken.balance).toBe('7.5');
        expect(document.querySelector('.fee-balance-value')?.textContent).toBe('7.50');
    });

    it('loads the fee-token balance after fee config refresh completes in connected mode', async () => {
        const component = createComponent({ connected: true });
        component.isReadOnlyMode = false;

        vi.spyOn(component, 'loadOrderCreationFee').mockImplementation(async () => {
            component.feeToken = {
                address: FEE_TOKEN,
                amount: ethers.utils.parseUnits('3', 6),
                symbol: 'USDC',
                decimals: 6,
                balance: null,
                balanceLoading: false,
            };
        });
        mockGetTokenBalanceInfo.mockResolvedValue({
            type: 'ok',
            balance: '15.01',
            symbol: 'USDC',
            decimals: 6,
        });

        await component.requestFeeConfigRefresh({ source: 'test' });

        expect(mockGetTokenBalanceInfo).toHaveBeenCalledWith(FEE_TOKEN);
        expect(document.querySelector('.fee-balance-value')?.textContent).toBe('15.01');
        expect(document.querySelector('.fee-token-explorer-link')?.getAttribute('href'))
            .toBe(`${getDefaultNetwork().explorer}/token/${ethers.utils.getAddress(FEE_TOKEN)}`);
    });

    it('preserves the last known fee-token balance when a refresh lookup fails', async () => {
        const component = createComponent({ connected: true });
        component.isReadOnlyMode = false;
        component.allowedTokens = [];
        component.feeToken = {
            address: FEE_TOKEN,
            amount: ethers.utils.parseUnits('2', 6),
            symbol: 'USDC',
            decimals: 6,
            balance: '7.5',
            balanceLoading: false,
        };

        mockGetTokenBalanceInfo.mockResolvedValue({
            type: 'unavailable',
            symbol: 'USDC',
            decimals: 6,
        });

        await component.refreshFeeTokenBalanceInBackground({ source: 'test-failure' });

        expect(component.feeToken.balance).toBe('7.5');
        expect(component.feeToken.balanceLookupFailed).toBe(true);
        expect(document.querySelector('.fee-balance-value')?.textContent).toBe('7.50');
    });
});
