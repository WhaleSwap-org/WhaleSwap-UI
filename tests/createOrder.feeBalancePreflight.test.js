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

        await expect(component.validateFeeTokenBalanceBeforeSubmit('1')).rejects.toThrow(
            'Order creation fee data is still loading'
        );
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
