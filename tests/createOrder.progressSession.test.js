import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateOrder } from '../js/components/CreateOrder.js';
import { walletManager } from '../js/services/WalletManager.js';

const SELL_TOKEN = '0x1111111111111111111111111111111111111111';
const BUY_TOKEN = '0x2222222222222222222222222222222222222222';

function setupCreateOrderDom() {
    document.body.innerHTML = `
        <div id="create-order">
            <input id="sellAmount" value="1" />
            <input id="buyAmount" value="2" />
            <input id="takerAddress" value="" />
            <button id="createOrderBtn" type="button"></button>
        </div>
    `;
}

function createSessionDouble({ hidden = false, active = true } = {}) {
    let visibilityListener = null;

    return {
        session: {
            isHidden: vi.fn(() => hidden),
            isVisible: vi.fn(() => !hidden),
            isActive: vi.fn(() => active),
            reopen: vi.fn(),
            onVisibilityChange: vi.fn((listener) => {
                visibilityListener = listener;
                return vi.fn(() => {
                    visibilityListener = null;
                });
            }),
        },
        emitVisibility(update) {
            hidden = update.hidden;
            active = update.active;
            visibilityListener?.(update);
        },
    };
}

function createComponent() {
    setupCreateOrderDom();

    const component = new CreateOrder();
    component.setContext({
        toast: {
            createTransactionProgress: vi.fn(),
        },
        getWebSocket: () => null,
        getWalletChainId: () => '0x89',
        getSelectedChainSlug: () => 'test-chain',
        getPricing: () => null,
        getWallet: () => walletManager,
        showError: vi.fn(),
        showSuccess: vi.fn(),
        showWarning: vi.fn(),
        showInfo: vi.fn(),
    });

    component.sellToken = {
        address: SELL_TOKEN,
        symbol: 'SELL',
    };
    component.buyToken = {
        address: BUY_TOKEN,
        symbol: 'BUY',
    };
    component.debug = vi.fn();
    component.refreshContractDisabledState = vi.fn(async () => false);

    return component;
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('CreateOrder checklist session lifecycle', () => {
    it('does not start a new create flow while a visible checklist exists', async () => {
        const component = createComponent();
        const { session } = createSessionDouble({ hidden: false, active: false });
        component.transactionProgressSession = session;

        await component.handleCreateOrder({ preventDefault: vi.fn() });

        expect(component.refreshContractDisabledState).not.toHaveBeenCalled();
        expect(session.reopen).not.toHaveBeenCalled();
        expect(component.isSubmitting).toBe(false);
    });

    it('reopens a hidden checklist instead of starting a new create flow', async () => {
        const component = createComponent();
        const { session } = createSessionDouble({ hidden: true, active: true });
        component.transactionProgressSession = session;

        await component.handleCreateOrder({ preventDefault: vi.fn() });

        expect(component.refreshContractDisabledState).not.toHaveBeenCalled();
        expect(session.reopen).toHaveBeenCalledTimes(1);
        expect(component.isSubmitting).toBe(false);
    });

    it('does not reopen a hidden terminal checklist and starts a fresh create flow', async () => {
        const component = createComponent();
        const { session } = createSessionDouble({ hidden: true, active: false });
        component.transactionProgressSession = session;
        const clearSessionSpy = vi.spyOn(component, 'clearTransactionProgressSession');
        component.ensureWalletReadyForWrite = vi.fn(async () => false);

        await component.handleCreateOrder({ preventDefault: vi.fn() });

        expect(session.reopen).not.toHaveBeenCalled();
        expect(clearSessionSpy).toHaveBeenCalledTimes(1);
        expect(component.refreshContractDisabledState).toHaveBeenCalledTimes(1);
    });

    it('disables the create button while a terminal checklist remains visible', () => {
        const component = createComponent();
        const { session } = createSessionDouble({ hidden: false, active: false });
        vi.spyOn(walletManager, 'isWalletConnected').mockReturnValue(true);

        component.transactionProgressSession = session;
        component.updateCreateButtonState();

        const button = document.getElementById('createOrderBtn');
        expect(button.disabled).toBe(true);
        expect(button.textContent).toBe('Checklist Open');
    });

    it('restores normal button behavior after a terminal checklist is closed', () => {
        const component = createComponent();
        const { session, emitVisibility } = createSessionDouble({ hidden: false, active: false });
        vi.spyOn(walletManager, 'isWalletConnected').mockReturnValue(true);

        component.setTransactionProgressSession(session);
        emitVisibility({ hidden: true, active: false });

        const button = document.getElementById('createOrderBtn');
        expect(component.transactionProgressSession).toBeNull();
        expect(button.disabled).toBe(false);
        expect(button.textContent).toBe('Create Order');
    });

    it('shows View Progress when an in-flight checklist is hidden', () => {
        const component = createComponent();
        const { session } = createSessionDouble({ hidden: true, active: true });
        vi.spyOn(walletManager, 'isWalletConnected').mockReturnValue(true);

        component.isSubmitting = true;
        component.transactionProgressSession = session;
        component.updateCreateButtonState();

        const button = document.getElementById('createOrderBtn');
        expect(button.disabled).toBe(false);
        expect(button.textContent).toBe('View Progress');
    });

    it('clears tracked checklist session during resetState', () => {
        const component = createComponent();
        const { session } = createSessionDouble({ hidden: false, active: false });

        component.setTransactionProgressSession(session);
        component.resetState();

        expect(component.transactionProgressSession).toBeNull();
        expect(component.transactionProgressVisibilityCleanup).toBeNull();
    });

    it('clears tracked checklist session when applying disconnected state', () => {
        const component = createComponent();
        const { session } = createSessionDouble({ hidden: false, active: false });

        component.setTransactionProgressSession(session);
        component.applyDisconnectedState();

        expect(component.transactionProgressSession).toBeNull();
        expect(component.transactionProgressVisibilityCleanup).toBeNull();
    });
});
