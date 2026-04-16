import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyOrders } from '../js/components/MyOrders.js';
import { Cleanup } from '../js/components/Cleanup.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('tab initialization without websocket readiness', () => {
    it('initializes MyOrders without waiting for websocket readiness', async () => {
        document.body.innerHTML = '<div id="my-orders"></div>';

        const component = new MyOrders();
        component.setContext({
            getWebSocket: () => ({
                isInitialized: false,
                orderCache: new Map(),
                tokenCache: new Map(),
                subscribe: vi.fn(),
                unsubscribe: vi.fn(),
                ensureChainTimeInitialized: vi.fn(async () => null),
                getCurrentTimestamp: vi.fn(() => null),
            }),
            getWallet: () => ({
                isWalletConnected: () => true,
                getAccount: () => '0x1111111111111111111111111111111111111111',
            }),
            getWalletChainId: () => '0x89',
            getPricing: () => ({
                subscribe: vi.fn(),
                unsubscribe: vi.fn(),
            }),
            showError: vi.fn(),
            showSuccess: vi.fn(),
            showWarning: vi.fn(),
            showInfo: vi.fn(),
        });

        component.setupTable = vi.fn(async () => {});
        component.setupWebSocket = vi.fn(async () => {});
        component.refreshOrdersView = vi.fn(async () => {});

        await expect(Promise.race([
            component.initialize(false),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 50)),
        ])).resolves.toBeUndefined();

        expect(component.refreshOrdersView).toHaveBeenCalledTimes(1);
    });

    it('initializes Cleanup without awaiting cleanup-opportunity polling', async () => {
        document.body.innerHTML = '<div id="cleanup-container"></div>';

        const component = new Cleanup();
        component.setContext({
            getWebSocket: () => ({
                isInitialized: false,
                contract: null,
                subscribe: vi.fn(),
                unsubscribe: vi.fn(),
            }),
            getWallet: () => ({
                addListener: vi.fn(),
                isWalletConnected: () => false,
            }),
            showError: vi.fn(),
            showSuccess: vi.fn(),
            showWarning: vi.fn(),
            showInfo: vi.fn(),
        });

        component.checkCleanupOpportunities = vi.fn(() => new Promise(() => {}));

        await expect(Promise.race([
            component.initialize(true),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 50)),
        ])).resolves.toBeUndefined();

        expect(component.checkCleanupOpportunities).toHaveBeenCalledTimes(1);
        expect(component.isInitialized).toBe(true);

        if (component.intervalId) {
            clearInterval(component.intervalId);
        }
    });
});
