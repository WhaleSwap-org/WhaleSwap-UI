import { afterEach, describe, expect, it, vi } from 'vitest';
import '../js/app.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

function setupTabDom() {
    document.body.innerHTML = `
        <button class="tab-button" data-tab="view-orders" style="display:block">View</button>
        <button class="tab-button" data-tab="my-orders" style="display:none">My</button>
        <button class="tab-button" data-tab="taker-orders" style="display:none">Invited</button>
    `;
}

function createAppWithContext({
    isConnected = true,
    account = ACCOUNT,
    orders = [],
    networkMatch = true,
    currentTab = 'view-orders'
} = {}) {
    const AppCtor = window.app.constructor;
    const app = new AppCtor();

    const ws = {
        waitForInitialization: vi.fn(async () => true),
        waitForOrderSync: vi.fn(async () => true),
        hasCompletedOrderSync: true,
        orderCache: new Map(orders.map((order, index) => [index + 1, order]))
    };

    app.ctx = {
        getWallet: () => ({
            isWalletConnected: () => isConnected,
            getAccount: () => account
        }),
        getWebSocket: () => ws
    };
    app.isWalletOnSelectedNetwork = vi.fn(() => networkMatch);
    app.updateTabRailOverflowState = vi.fn();
    app.showTab = vi.fn(async () => {});
    app.currentTab = currentTab;

    return { app, ws };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('App order tab visibility behavior', () => {
    it('hides both tabs when wallet is disconnected', async () => {
        setupTabDom();
        const { app } = createAppWithContext({
            isConnected: false,
            orders: [{ maker: ACCOUNT, taker: ACCOUNT }]
        });

        const result = await app.refreshOrderTabVisibility();

        expect(result).toEqual({ showMyOrders: false, showInvitedOrders: false });
        expect(app.getTabButton('my-orders').style.display).toBe('none');
        expect(app.getTabButton('taker-orders').style.display).toBe('none');
    });

    it('shows only My Orders when account is maker only', async () => {
        setupTabDom();
        const { app } = createAppWithContext({
            orders: [{ maker: ACCOUNT, taker: OTHER }]
        });

        const result = await app.refreshOrderTabVisibility();

        expect(result).toEqual({ showMyOrders: true, showInvitedOrders: false });
        expect(app.getTabButton('my-orders').style.display).toBe('block');
        expect(app.getTabButton('taker-orders').style.display).toBe('none');
    });

    it('shows only Invited Orders when account is taker only', async () => {
        setupTabDom();
        const { app } = createAppWithContext({
            orders: [{ maker: OTHER, taker: ACCOUNT }]
        });

        const result = await app.refreshOrderTabVisibility();

        expect(result).toEqual({ showMyOrders: false, showInvitedOrders: true });
        expect(app.getTabButton('my-orders').style.display).toBe('none');
        expect(app.getTabButton('taker-orders').style.display).toBe('block');
    });

    it('shows both tabs when account has both maker and invited orders', async () => {
        setupTabDom();
        const { app } = createAppWithContext({
            orders: [
                { maker: ACCOUNT, taker: OTHER },
                { maker: OTHER, taker: ACCOUNT }
            ]
        });

        const result = await app.refreshOrderTabVisibility();

        expect(result).toEqual({ showMyOrders: true, showInvitedOrders: true });
        expect(app.getTabButton('my-orders').style.display).toBe('block');
        expect(app.getTabButton('taker-orders').style.display).toBe('block');
    });

    it('shows connected order tabs even when the wallet is on a different network', async () => {
        setupTabDom();
        const { app } = createAppWithContext({
            networkMatch: false,
            orders: [{ maker: ACCOUNT, taker: OTHER }]
        });

        const result = await app.refreshOrderTabVisibility();

        expect(result).toEqual({ showMyOrders: true, showInvitedOrders: false });
        expect(app.getTabButton('my-orders').style.display).toBe('block');
        expect(app.getTabButton('taker-orders').style.display).toBe('none');
    });

    it('redirects to View Orders if current order tab becomes hidden', async () => {
        setupTabDom();
        const { app } = createAppWithContext({
            orders: [],
            currentTab: 'my-orders'
        });

        await app.refreshOrderTabVisibility();

        expect(app.showTab).toHaveBeenCalledWith('view-orders');
        expect(app.getTabButton('my-orders').style.display).toBe('none');
    });
});
