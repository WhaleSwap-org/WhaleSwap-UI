import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateOrder } from '../js/components/CreateOrder.js';

const SELL_TOKEN = '0x1111111111111111111111111111111111111111';
const BUY_TOKEN = '0x2222222222222222222222222222222222222222';
const FEE_TOKEN = '0x3333333333333333333333333333333333333333';

function createContextStub() {
    return {
        getWebSocket: () => null,
        getPricing: () => null,
        getWallet: () => ({
            isWalletConnected: () => true,
            getAccount: () => '0x4444444444444444444444444444444444444444',
        }),
        getWalletChainId: () => '0x89',
        getSelectedChainSlug: () => 'polygon',
        showError: () => {},
        showSuccess: () => {},
        showWarning: () => {},
        showInfo: () => {},
        toast: {
            createTransactionProgress: vi.fn(),
        },
    };
}

function createComponent() {
    document.body.innerHTML = '<div id="create-order"></div>';
    const component = new CreateOrder();
    component.setContext(createContextStub());
    component.sellToken = {
        address: SELL_TOKEN,
        symbol: 'SELL',
        decimals: 18,
    };
    component.buyToken = {
        address: BUY_TOKEN,
        symbol: 'BUY',
        decimals: 18,
    };
    component.debug = vi.fn();
    return component;
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('CreateOrder fee-token preflight balance checks', () => {
    it('throws when fee configuration is not loaded yet', async () => {
        const component = createComponent();
        component.feeToken = null;
        const feeConfigRefreshSpy = vi
            .spyOn(component, 'requestFeeConfigRefresh')
            .mockResolvedValue(null);

        await expect(component.validateFeeTokenBalanceBeforeSubmit('1')).rejects.toThrow(
            'Order creation fee data is still loading'
        );
        expect(feeConfigRefreshSpy).toHaveBeenCalledWith({
            source: 'create-order:fee-balance-preflight',
        });
    });

    it('waits for in-flight fee balance loading before evaluating preflight', async () => {
        const component = createComponent();
        component.feeToken = {
            address: FEE_TOKEN,
            symbol: 'USDC',
            decimals: 6,
            amount: '1000000',
        };
        vi.spyOn(component, 'requestFeeConfigRefresh').mockResolvedValue(null);
        vi.spyOn(component, 'refreshFeeTokenBalanceInBackground').mockResolvedValue({
            ...component.feeToken,
            balance: '2.0',
            balanceLoading: true,
        });
        component.feeTokenBalanceLoadPromise = Promise.resolve({
            ...component.feeToken,
            balance: '2.0',
            balanceLoading: false,
        });

        const validation = await component.validateFeeTokenBalanceBeforeSubmit('1');

        expect(validation.hasSufficientBalance).toBe(true);
        expect(validation.formattedFeeRequired).toBe('1.0');
        expect(validation.formattedAvailable).toBe('2.0');
    });

    it('fails preflight when fee-token balance is below required fee', async () => {
        const component = createComponent();
        component.feeToken = {
            address: FEE_TOKEN,
            symbol: 'USDC',
            decimals: 6,
            amount: '1000000',
        };
        vi.spyOn(component, 'refreshFeeTokenBalanceInBackground').mockResolvedValue({
            ...component.feeToken,
            balance: '0.5',
            balanceLoading: false,
        });

        const validation = await component.validateFeeTokenBalanceBeforeSubmit('1');

        expect(validation.hasSufficientBalance).toBe(false);
        expect(validation.sameTokenForSellAndFee).toBe(false);
        expect(validation.formattedFeeRequired).toBe('1.0');
        expect(validation.formattedAvailable).toBe('0.5');
    });

    it('retries when the fee-token balance lookup fails instead of treating it as zero', async () => {
        const component = createComponent();
        component.feeToken = {
            address: FEE_TOKEN,
            symbol: 'USDC',
            decimals: 6,
            amount: '1000000',
            balance: '8.25',
        };
        vi.spyOn(component, 'requestFeeConfigRefresh').mockResolvedValue(null);
        vi.spyOn(component, 'refreshFeeTokenBalanceInBackground').mockResolvedValue({
            ...component.feeToken,
            balanceLoading: false,
            balanceLookupFailed: true,
        });

        await expect(component.validateFeeTokenBalanceBeforeSubmit('1')).rejects.toThrow(
            'Fee token balance could not be refreshed. Please try again.'
        );
    });

    it('uses fee-token decimals for same-token preflight even if sell token cache is stale', async () => {
        const component = createComponent();
        component.sellToken = {
            address: SELL_TOKEN,
            symbol: 'ZERO',
            decimals: 18,
        };
        component.feeToken = {
            address: SELL_TOKEN,
            symbol: 'ZERO',
            decimals: 0,
            amount: '1',
        };
        vi.spyOn(component, 'requestFeeConfigRefresh').mockResolvedValue(null);
        vi.spyOn(component, 'refreshFeeTokenBalanceInBackground').mockResolvedValue({
            ...component.feeToken,
            balance: '2',
            balanceLoading: false,
        });

        const validation = await component.validateFeeTokenBalanceBeforeSubmit('1');

        expect(validation.sameTokenForSellAndFee).toBe(true);
        expect(validation.hasSufficientBalance).toBe(true);
        expect(validation.formattedSellAmount).toBe('1');
        expect(validation.formattedTotalRequired).toBe('2');
    });

    it('fails preflight when selling fee-token and balance cannot cover sell+fee', async () => {
        const component = createComponent();
        component.sellToken = {
            address: SELL_TOKEN,
            symbol: 'LIB',
            decimals: 18,
        };
        component.feeToken = {
            address: SELL_TOKEN,
            symbol: 'LIB',
            decimals: 18,
            amount: '1000000000000000000',
        };
        vi.spyOn(component, 'requestFeeConfigRefresh').mockResolvedValue(null);
        vi.spyOn(component, 'refreshFeeTokenBalanceInBackground').mockResolvedValue({
            ...component.feeToken,
            balance: '1.5',
            balanceLoading: false,
        });

        const validation = await component.validateFeeTokenBalanceBeforeSubmit('1');

        expect(validation.hasSufficientBalance).toBe(false);
        expect(validation.sameTokenForSellAndFee).toBe(true);
        expect(validation.formattedSellAmount).toBe('1.0');
        expect(validation.formattedFeeRequired).toBe('1.0');
        expect(validation.formattedTotalRequired).toBe('2.0');
        expect(validation.formattedAvailable).toBe('1.5');
    });
});
