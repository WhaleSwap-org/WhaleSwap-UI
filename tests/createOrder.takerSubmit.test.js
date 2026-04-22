import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEthersContract, mockValidateSellBalance } = vi.hoisted(() => ({
    mockEthersContract: vi.fn(),
    mockValidateSellBalance: vi.fn(),
}));

vi.mock('ethers', async () => {
    const actual = await vi.importActual('ethers');
    return {
        ...actual,
        ethers: {
            ...actual.ethers,
            Contract: mockEthersContract,
        },
    };
});

vi.mock('../js/utils/balanceValidation.js', async () => {
    const actual = await vi.importActual('../js/utils/balanceValidation.js');
    return {
        ...actual,
        validateSellBalance: mockValidateSellBalance,
    };
});

import { CreateOrder } from '../js/components/CreateOrder.js';
import { contractService } from '../js/services/ContractService.js';
import { walletManager } from '../js/services/WalletManager.js';

const ACCOUNT = '0x3333333333333333333333333333333333333333';
const SELL_TOKEN = '0x1111111111111111111111111111111111111111';
const BUY_TOKEN = '0x2222222222222222222222222222222222222222';
const FEE_TOKEN = '0x4444444444444444444444444444444444444444';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TX_HASH = `0x${'a'.repeat(64)}`;

function setupCreateOrderDom() {
    document.body.innerHTML = '<div id="create-order"></div>';
}

function createToastStub() {
    return {
        createTransactionProgress: vi.fn(() => ({
            onClose: vi.fn(),
            updateStep: vi.fn(),
            setSummary: vi.fn(),
            setTransaction: vi.fn(),
            finishSuccess: vi.fn(),
            finishFailure: vi.fn(),
            finishCancelled: vi.fn(),
        })),
    };
}

function createSubmitHarness({ takerValue = '' } = {}) {
    setupCreateOrderDom();

    const toast = createToastStub();
    const ws = {
        syncAllOrders: vi.fn(async () => {}),
    };
    const ctx = {
        toast,
        getWebSocket: () => ws,
        getWalletChainId: () => '0x89',
        getSelectedChainSlug: () => 'test-chain',
        showError: vi.fn(),
        showSuccess: vi.fn(),
        showWarning: vi.fn(),
        showInfo: vi.fn(),
    };

    const component = new CreateOrder();
    component.setContext(ctx);
    component.container.innerHTML = component.render();
    component.sellToken = {
        address: SELL_TOKEN,
        symbol: 'SELL',
        displaySymbol: 'SELL',
        decimals: 18,
    };
    component.buyToken = {
        address: BUY_TOKEN,
        symbol: 'BUY',
        displaySymbol: 'BUY',
        decimals: 18,
    };

    document.getElementById('sellAmount').value = '1';
    document.getElementById('buyAmount').value = '2';
    document.getElementById('takerAddress').value = takerValue;

    component.refreshContractDisabledState = vi.fn(async () => false);
    component.ensureWalletReadyForWrite = vi.fn(async () => true);
    component.getTokenDecimals = vi.fn(async () => 18);
    component.getCreateOrderApprovalRequirements = vi.fn(async () => []);
    component.updateCreateButtonState = vi.fn();
    component.refreshOpenTokenModals = vi.fn();
    component.feeToken = {
        address: FEE_TOKEN,
        symbol: 'USDC',
        decimals: 6,
        amount: '1000000',
    };
    component.refreshFeeTokenBalanceInBackground = vi.fn(async () => ({
        ...component.feeToken,
        balance: '1000',
        balanceLoading: false,
    }));
    component.debug = vi.fn();
    component.error = vi.fn();
    component.showError = vi.fn();
    component.showWarning = vi.fn();

    mockValidateSellBalance.mockResolvedValue({
        hasSufficientBalance: true,
        symbol: 'SELL',
        formattedRequired: '1',
        formattedBalance: '10',
    });

    const signer = {
        getAddress: vi.fn(async () => ACCOUNT),
    };
    vi.spyOn(walletManager, 'getSigner').mockReturnValue(signer);
    vi.spyOn(contractService, 'isTokenAllowed').mockResolvedValue(true);

    const tx = {
        hash: TX_HASH,
        wait: vi.fn(async () => ({ status: 1 })),
    };
    const contract = {
        createOrder: vi.fn(async () => tx),
    };
    mockEthersContract.mockImplementation(() => contract);

    return { component, contract };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    mockEthersContract.mockReset();
    mockValidateSellBalance.mockReset();
});

describe('CreateOrder taker submit handling', () => {
    it('accepts a bare 40-hex taker address without 0x on submit', async () => {
        const bareAddress = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
        const { component, contract } = createSubmitHarness({
            takerValue: bareAddress,
        });

        await component.handleCreateOrder({ preventDefault: vi.fn() });

        expect(contract.createOrder).toHaveBeenCalledTimes(1);
        expect(contract.createOrder.mock.calls[0][0]).toBe(bareAddress);
        expect(component.showError).not.toHaveBeenCalled();
    });

    it('maps an empty taker field to the zero address on submit', async () => {
        const { component, contract } = createSubmitHarness({
            takerValue: '',
        });

        await component.handleCreateOrder({ preventDefault: vi.fn() });

        expect(contract.createOrder).toHaveBeenCalledTimes(1);
        expect(contract.createOrder.mock.calls[0][0]).toBe(ZERO_ADDRESS);
        expect(component.showError).not.toHaveBeenCalled();
    });

    it('rejects malformed taker hex on submit', async () => {
        const { component, contract } = createSubmitHarness({
            takerValue: '0x1234',
        });

        await component.handleCreateOrder({ preventDefault: vi.fn() });

        expect(contract.createOrder).not.toHaveBeenCalled();
        expect(component.showError).toHaveBeenCalledWith('Invalid taker address format');
    });

    it('does not submit create-order transaction when fee-token preflight balance is insufficient', async () => {
        const { component, contract } = createSubmitHarness({
            takerValue: '',
        });
        vi.spyOn(component, 'validateFeeTokenBalanceBeforeSubmit').mockResolvedValue({
            hasSufficientBalance: false,
            symbol: 'USDC',
            sameTokenForSellAndFee: false,
            formattedFeeRequired: '1.0',
            formattedAvailable: '0.2',
        });

        await component.handleCreateOrder({ preventDefault: vi.fn() });

        expect(contract.createOrder).not.toHaveBeenCalled();
        expect(component.showError).toHaveBeenCalledWith(
            expect.stringContaining('Insufficient USDC balance for order creation fee.')
        );
    });
});
