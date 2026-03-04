import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketService } from '../js/services/WebSocket.js';
import { CreateOrder } from '../js/components/CreateOrder.js';
import { Admin } from '../js/components/Admin.js';
import { ContractParams } from '../js/components/ContractParams.js';

const TOKEN_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

function flushAsync() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function createSubscriptionHarness() {
    const callbacks = new Map();
    const ws = {
        subscribe: vi.fn((eventName, callback) => {
            callbacks.set(eventName, callback);
        }),
        unsubscribe: vi.fn((eventName) => {
            callbacks.delete(eventName);
        })
    };

    return { ws, callbacks };
}

function createBaseContext(overrides = {}) {
    return {
        getWebSocket: () => overrides.ws,
        getPricing: () => null,
        getWallet: () => ({
            isWalletConnected: () => true,
            getAccount: () => '0x1111111111111111111111111111111111111111'
        }),
        getWalletChainId: () => '0x89',
        showError: () => {},
        showSuccess: () => {},
        showWarning: () => {},
        showInfo: () => {},
        ...overrides
    };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('AllowedTokensUpdated behavior coverage', () => {
    it('given websocket listeners are setup when AllowedTokensUpdated fires then it notifies subscribers with normalized payload and refreshes pricing', async () => {
        const pricing = {
            getAllowedTokens: vi.fn(async () => []),
            fetchAllowedTokensPrices: vi.fn(async () => ({ success: true }))
        };
        const service = new WebSocketService({ pricingService: pricing });
        const notifySpy = vi.spyOn(service, 'notifySubscribers');

        const eventHandlers = new Map();
        const contract = {
            address: '0x0000000000000000000000000000000000000001',
            filters: {
                OrderCreated: vi.fn(() => ({}))
            },
            on: vi.fn((eventName, callback) => {
                eventHandlers.set(eventName, callback);
            }),
            interface: {
                getEvent: vi.fn((eventName) => {
                    if (eventName === 'AllowedTokensUpdated') {
                        return { name: eventName };
                    }
                    throw new Error(`Missing event: ${eventName}`);
                })
            }
        };

        await service.setupEventListeners(contract);
        const handler = eventHandlers.get('AllowedTokensUpdated');
        expect(typeof handler).toBe('function');

        handler([TOKEN_A, TOKEN_B], [1, 0], { toString: () => '1700000000' });
        await flushAsync();

        expect(notifySpy).toHaveBeenCalledWith('AllowedTokensUpdated', {
            tokens: [TOKEN_A.toLowerCase(), TOKEN_B.toLowerCase()],
            allowed: [true, false],
            timestamp: '1700000000'
        });
        expect(pricing.getAllowedTokens).toHaveBeenCalledTimes(1);
        expect(pricing.fetchAllowedTokensPrices).toHaveBeenCalledTimes(1);
    });

    it('given CreateOrder subscribed to AllowedTokensUpdated when event fires then it requests forced token refresh', () => {
        document.body.innerHTML = '<div id="create-order"></div>';
        const { ws, callbacks } = createSubscriptionHarness();

        const component = new CreateOrder();
        component.setContext(createBaseContext({ ws }));

        const refreshSpy = vi
            .spyOn(component, 'requestAllowedTokensRefresh')
            .mockResolvedValue([]);

        component.subscribeToAllowedTokensUpdates();
        const handler = callbacks.get('AllowedTokensUpdated');
        expect(typeof handler).toBe('function');

        handler();

        expect(refreshSpy).toHaveBeenCalledWith({
            forceFresh: true,
            source: 'AllowedTokensUpdated'
        });
    });

    it('given Admin has cached delete tokens when AllowedTokensUpdated fires then it invalidates cache and refreshes open picker', async () => {
        document.body.innerHTML = '<div id="admin"></div>';
        const { ws, callbacks } = createSubscriptionHarness();

        const component = new Admin();
        component.setContext(createBaseContext({ ws }));
        component.deleteAllowedTokens = [{ address: TOKEN_A.toLowerCase(), symbol: 'AAA' }];
        component.deleteAllowedTokensLoadedAt = Date.now();

        const refreshSpy = vi
            .spyOn(component, 'refreshDeleteTokenPickerIfOpen')
            .mockResolvedValue();

        component.subscribeToAllowedTokensUpdates();
        const handler = callbacks.get('AllowedTokensUpdated');
        expect(typeof handler).toBe('function');

        handler();
        await flushAsync();

        expect(component.deleteAllowedTokens).toEqual([]);
        expect(component.deleteAllowedTokensLoadedAt).toBe(0);
        expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    it('given ContractParams has cached values and active tab when AllowedTokensUpdated fires then it invalidates cache and reinitializes', async () => {
        document.body.innerHTML = '<div id="contract-params"></div>';
        const { ws, callbacks } = createSubscriptionHarness();

        const component = new ContractParams();
        component.setContext(createBaseContext({ ws }));
        component.container.classList.add('active');
        component.cachedParams = { allowedTokensCount: 4 };
        component.lastFetchTime = Date.now();

        const initSpy = vi.spyOn(component, 'initialize').mockResolvedValue();

        component.setupAllowedTokensSubscription(ws);
        const handler = callbacks.get('AllowedTokensUpdated');
        expect(typeof handler).toBe('function');

        handler();
        await flushAsync();

        expect(component.cachedParams).toBeNull();
        expect(component.lastFetchTime).toBe(0);
        expect(initSpy).toHaveBeenCalledTimes(1);
    });
});
