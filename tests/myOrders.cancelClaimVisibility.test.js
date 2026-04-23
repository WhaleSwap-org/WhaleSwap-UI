import { afterEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { MyOrders } from '../js/components/MyOrders.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';

function createComponent() {
    document.body.innerHTML = '<div id="my-orders"></div>';

    const txWait = vi.fn(async () => ({ status: 1 }));
    const contractWithSigner = {
        estimateGas: {
            cancelOrder: vi.fn(async () => ethers.BigNumber.from(100))
        },
        cancelOrder: vi.fn(async () => ({ wait: txWait }))
    };

    const ws = {
        canCancelOrder: vi.fn(() => true),
        contract: {
            connect: vi.fn(() => contractWithSigner)
        }
    };

    const component = new MyOrders();
    let isWalletActionActive = false;
    component.setContext({
        getWebSocket: () => ws,
        getWallet: () => ({
            getAccount: () => ACCOUNT
        }),
        beginWalletAction: () => {
            isWalletActionActive = true;
            return () => {
                isWalletActionActive = false;
            };
        },
        isWalletActionInFlight: () => isWalletActionActive,
    });
    component.provider = {
        getSigner: vi.fn(() => ({}))
    };
    component.ensureWalletReadyForWrite = vi.fn(async () => true);
    component.showError = vi.fn();
    component.showSuccess = vi.fn();
    component.debouncedRefresh = vi.fn();

    return { component, contractWithSigner, txWait };
}

async function flushAsyncWork() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
    document.body.innerHTML = '';
    delete window.app;
    vi.restoreAllMocks();
});

describe('MyOrders cancel claim-tab visibility hardening', () => {
    it('schedules a claim-tab visibility refresh after a successful cancel', async () => {
        const { component, contractWithSigner, txWait } = createComponent();
        const actionCell = document.createElement('td');

        window.app = {
            scheduleClaimTabVisibilityRefresh: vi.fn()
        };

        component.updateActionColumn(actionCell, { id: 7, maker: ACCOUNT }, {
            getAccount: () => ACCOUNT
        });

        const cancelButton = actionCell.querySelector('.cancel-order-btn');
        expect(cancelButton).not.toBeNull();

        cancelButton.click();
        await flushAsyncWork();

        expect(contractWithSigner.cancelOrder).toHaveBeenCalledTimes(1);
        expect(txWait).toHaveBeenCalledTimes(1);
        expect(window.app.scheduleClaimTabVisibilityRefresh).toHaveBeenCalledWith(null, { force: true });
        expect(component.showSuccess).toHaveBeenCalledWith(
            'Order 7 cancelled successfully! Go to the Claim tab to withdraw your tokens.'
        );
        expect(component.debouncedRefresh).toHaveBeenCalledTimes(1);
    });
});
