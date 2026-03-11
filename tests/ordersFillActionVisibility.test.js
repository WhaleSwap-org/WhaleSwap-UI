import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewOrders } from '../js/components/ViewOrders.js';
import { TakerOrders } from '../js/components/TakerOrders.js';

const MAKER = '0x1111111111111111111111111111111111111111';
const TAKER = '0x2222222222222222222222222222222222222222';

function createOrder() {
    return {
        id: 7,
        maker: MAKER,
        taker: TAKER,
        status: 'Active',
    };
}

function createContext({ canFillOrder = false } = {}) {
    const ws = {
        canFillOrder: vi.fn(() => canFillOrder),
    };

    return {
        ws,
        ctx: {
            getWebSocket: () => ws,
            getWallet: () => ({
                getAccount: () => TAKER,
            }),
            getWalletChainId: () => '0x89',
            getPricing: () => null,
            showError: () => {},
            showSuccess: () => {},
            showWarning: () => {},
            showInfo: () => {},
        },
    };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('fill action visibility with tracked progress', () => {
    it('does not keep the ViewOrders fill button visible when the viewer can no longer fill', () => {
        document.body.innerHTML = '<div id="view-orders"></div>';

        const { ctx } = createContext({ canFillOrder: false });
        const component = new ViewOrders();
        component.setContext(ctx);
        component.helper.hasTrackedFillProgress = vi.fn(() => true);
        component.helper.configureFillButton = vi.fn();

        const actionCell = document.createElement('td');
        component.updateActionColumn(actionCell, createOrder(), {
            getAccount: () => TAKER,
        });

        expect(actionCell.querySelector('.fill-button')).toBeNull();
        expect(component.helper.configureFillButton).not.toHaveBeenCalled();
    });

    it('does not keep the TakerOrders fill button visible when the viewer can no longer fill', () => {
        document.body.innerHTML = '<div id="taker-orders"></div>';

        const { ctx } = createContext({ canFillOrder: false });
        const component = new TakerOrders();
        component.setContext(ctx);
        component.helper.hasTrackedFillProgress = vi.fn(() => true);
        component.helper.configureFillButton = vi.fn();

        const actionCell = document.createElement('td');
        component.updateActionColumn(actionCell, createOrder(), {
            getAccount: () => TAKER,
        });

        expect(actionCell.querySelector('.fill-button')).toBeNull();
        expect(actionCell.textContent.trim()).toBe('-');
        expect(component.helper.configureFillButton).not.toHaveBeenCalled();
    });
});
