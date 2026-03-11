import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdersComponentHelper } from '../js/services/OrdersComponentHelper.js';

function setupOrdersDom() {
    document.body.innerHTML = `
        <div id="orders">
            <button class="fill-button" data-order-id="7" type="button"></button>
            <button class="fill-button" data-order-id="8" type="button"></button>
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

function createHelperHarness() {
    setupOrdersDom();

    const component = {
        container: document.getElementById('orders'),
        ctx: {
            getWalletChainId: () => '0x89',
            getWebSocket: () => ({
                unsubscribe: vi.fn(),
            }),
        },
        refreshOrdersView: vi.fn(async () => {}),
        ensureWalletReadyForWrite: vi.fn(async () => true),
        getContract: vi.fn(async () => ({})),
        provider: null,
        isProcessingFill: false,
        eventSubscriptions: new Set(),
        _boundPricingHandler: null,
        _boundOrdersUpdatedHandler: null,
        _refreshTimeout: null,
        pricingService: null,
        walletListener: null,
        debug: vi.fn(),
        error: vi.fn(),
        showError: vi.fn(),
    };

    const helper = new OrdersComponentHelper(component);
    helper.debug = vi.fn();

    return { component, helper };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('OrdersComponentHelper fill checklist lifecycle', () => {
    it('keeps the tracked button locked while its terminal checklist is visible', () => {
        const { helper } = createHelperHarness();
        const { session } = createSessionDouble({ hidden: false, active: false });

        helper.setFillProgressSession(session, 7);

        const trackedButton = document.querySelector('.fill-button[data-order-id="7"]');
        const otherButton = document.querySelector('.fill-button[data-order-id="8"]');

        expect(trackedButton.disabled).toBe(true);
        expect(trackedButton.textContent).toBe('Checklist Open');
        expect(otherButton.disabled).toBe(true);
        expect(otherButton.textContent).toBe('Fill');
    });

    it('shows View Progress only for the tracked button when its checklist is hidden mid-flight', () => {
        const { helper } = createHelperHarness();
        const { session } = createSessionDouble({ hidden: true, active: true });

        helper.setFillProgressSession(session, 7);

        const trackedButton = document.querySelector('.fill-button[data-order-id="7"]');
        const otherButton = document.querySelector('.fill-button[data-order-id="8"]');

        expect(trackedButton.disabled).toBe(false);
        expect(trackedButton.textContent).toBe('View Progress');
        expect(otherButton.disabled).toBe(true);
        expect(otherButton.textContent).toBe('Fill');
    });

    it('reopens the tracked hidden checklist instead of starting a second fill flow', async () => {
        const { component, helper } = createHelperHarness();
        const { session } = createSessionDouble({ hidden: true, active: true });

        helper.setFillProgressSession(session, 7);
        await helper.fillOrder(7);

        expect(session.reopen).toHaveBeenCalledTimes(1);
        expect(component.ensureWalletReadyForWrite).not.toHaveBeenCalled();
    });

    it('blocks fill attempts for other orders while a checklist is still open', async () => {
        const { component, helper } = createHelperHarness();
        const { session } = createSessionDouble({ hidden: false, active: false });

        helper.setFillProgressSession(session, 7);
        await helper.fillOrder(8);

        expect(session.reopen).not.toHaveBeenCalled();
        expect(component.ensureWalletReadyForWrite).not.toHaveBeenCalled();
    });

    it('clears tracked fill progress after a terminal checklist is dismissed', () => {
        const { helper } = createHelperHarness();
        const { session, emitVisibility } = createSessionDouble({ hidden: false, active: false });

        helper.setFillProgressSession(session, 7);
        emitVisibility({ hidden: true, active: false });

        const trackedButton = document.querySelector('.fill-button[data-order-id="7"]');
        const otherButton = document.querySelector('.fill-button[data-order-id="8"]');

        expect(helper.fillProgressSession).toBeNull();
        expect(helper.fillProgressOrderId).toBeNull();
        expect(trackedButton.disabled).toBe(false);
        expect(trackedButton.textContent).toBe('Fill');
        expect(otherButton.disabled).toBe(false);
        expect(otherButton.textContent).toBe('Fill');
    });
});
