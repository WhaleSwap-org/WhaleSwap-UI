import { afterEach, describe, expect, it, vi } from 'vitest';
import '../js/app.js';
import { Cleanup } from '../js/components/Cleanup.js';
import { ContractParams } from '../js/components/ContractParams.js';

function createBaseContext(overrides = {}) {
    return {
        getWebSocket: () => overrides.ws,
        getWallet: () => ({
            isWalletConnected: () => false,
            addListener: () => {},
        }),
        showError: () => {},
        showSuccess: () => {},
        showWarning: () => {},
        showInfo: () => {},
        ...overrides,
    };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('WS recovery behavior', () => {
    it('Cleanup initialize schedules a single retry when websocket contract is not ready', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="cleanup-container"></div>';

        const ws = { contract: null };
        const component = new Cleanup();
        component.setContext(createBaseContext({ ws }));

        await component.initialize(true);
        const firstRetryTimer = component.initializationRetryTimer;

        await component.initialize(true);
        const secondRetryTimer = component.initializationRetryTimer;

        expect(firstRetryTimer).toBeTruthy();
        expect(secondRetryTimer).toBe(firstRetryTimer);
        expect(component.container.textContent).toContain('Connecting to order feed...');

        component.cleanup();
        expect(component.initializationRetryTimer).toBeNull();
    });

    it('Cleanup replaces a pending retry when mode changes before timer fires', () => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="cleanup-container"></div>';

        const component = new Cleanup();
        const initSpy = vi.spyOn(component, 'initialize').mockResolvedValue();

        component.scheduleInitializationRetry(true);
        const firstRetryTimer = component.initializationRetryTimer;
        expect(component.initializationRetryMode).toBe(true);

        component.scheduleInitializationRetry(false);
        const secondRetryTimer = component.initializationRetryTimer;
        expect(secondRetryTimer).toBeTruthy();
        expect(secondRetryTimer).not.toBe(firstRetryTimer);
        expect(component.initializationRetryMode).toBe(false);

        vi.advanceTimersByTime(300);
        expect(initSpy).toHaveBeenCalledTimes(1);
        expect(initSpy).toHaveBeenCalledWith(false);
        expect(component.initializationRetryTimer).toBeNull();
        expect(component.initializationRetryMode).toBeNull();
    });

    it('App reinitializeComponents replaces Cleanup pending retry mode during wallet connect', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="cleanup-container"></div>';

        const ws = { contract: null };
        const cleanupComponent = new Cleanup();
        cleanupComponent.setContext(createBaseContext({ ws }));

        await cleanupComponent.initialize(true);
        const firstRetryTimer = cleanupComponent.initializationRetryTimer;
        expect(firstRetryTimer).toBeTruthy();
        expect(cleanupComponent.initializationRetryMode).toBe(true);

        const AppCtor = window.app.constructor;
        const app = new AppCtor();
        app.currentTab = 'cleanup-orders';
        app.tabReady = new Set();
        app.showTab = vi.fn(async () => {});
        app.components = {
            'create-order': {
                resetState: vi.fn(),
                initialize: vi.fn(async () => {}),
            },
            'cleanup-orders': cleanupComponent,
        };
        app.ctx = {
            getWallet: () => ({
                isWalletConnected: () => true,
            }),
            getWebSocket: () => ({
                orderCache: new Map(),
                waitForInitialization: vi.fn(async () => true),
                syncAllOrders: vi.fn(async () => {}),
            }),
        };

        await app.reinitializeComponents({ preserveOrders: true });

        const secondRetryTimer = cleanupComponent.initializationRetryTimer;
        expect(secondRetryTimer).toBeTruthy();
        expect(secondRetryTimer).not.toBe(firstRetryTimer);
        expect(cleanupComponent.initializationRetryMode).toBe(false);

        const retryInitSpy = vi.spyOn(cleanupComponent, 'initialize').mockResolvedValue();
        vi.advanceTimersByTime(300);
        expect(retryInitSpy).toHaveBeenCalledTimes(1);
        expect(retryInitSpy).toHaveBeenCalledWith(false);
        expect(cleanupComponent.initializationRetryTimer).toBeNull();
        expect(cleanupComponent.initializationRetryMode).toBeNull();
    });

    it('ContractParams recovery waits for initialization when websocket is not initialized yet', async () => {
        document.body.innerHTML = '<div id="contract-params"></div>';

        const component = new ContractParams();
        const waitForInitialization = vi.fn(async () => true);
        const reconnect = vi.fn(async () => true);

        const recovered = await component.waitForWsRecovery({
            isInitialized: false,
            waitForInitialization,
            reconnect,
        });

        expect(recovered).toBe(true);
        expect(waitForInitialization).toHaveBeenCalledTimes(1);
        expect(reconnect).not.toHaveBeenCalled();
    });

    it('ContractParams recovery reconnects when websocket is already initialized', async () => {
        document.body.innerHTML = '<div id="contract-params"></div>';

        const component = new ContractParams();
        const waitForInitialization = vi.fn(async () => true);
        const reconnect = vi.fn(async () => true);

        const recovered = await component.waitForWsRecovery({
            isInitialized: true,
            waitForInitialization,
            reconnect,
        });

        expect(recovered).toBe(true);
        expect(reconnect).toHaveBeenCalledTimes(1);
        expect(waitForInitialization).not.toHaveBeenCalled();
    });
});
