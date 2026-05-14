import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cleanup } from '../js/components/Cleanup.js';

let originalApp;

function createWebSocketStub() {
    return {
        contract: {
            provider: {
                getNetwork: vi.fn(async () => ({ chainId: 1 }))
            }
        },
        getOrders: vi.fn(() => []),
        ensureChainTimeInitialized: vi.fn(async () => {}),
        getCurrentTimestamp: vi.fn(() => 1000),
        subscribe: vi.fn(),
        unsubscribe: vi.fn()
    };
}

function createWalletStub() {
    return {
        isWalletConnected: vi.fn(() => false),
        connect: vi.fn(async () => ({ account: '0xabc' })),
        addListener: vi.fn()
    };
}

function createContext({ wallet = createWalletStub(), ws = createWebSocketStub() } = {}) {
    return {
        getWebSocket: () => ws,
        getWallet: () => wallet,
        showError: vi.fn(),
        showSuccess: vi.fn(),
        showWarning: vi.fn(),
        showInfo: vi.fn(),
        isWalletActionInFlight: vi.fn(() => false),
        beginWalletAction: vi.fn(),
        endWalletAction: vi.fn()
    };
}

beforeEach(() => {
    originalApp = window.app;
});

afterEach(() => {
    window.app = originalApp;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('Cleanup wallet picker integration', () => {
    it('opens the shared wallet picker from the read-only cleanup connect button', async () => {
        document.body.innerHTML = '<div id="cleanup-container"></div>';
        const showWalletSelection = vi.fn(async () => {});
        window.app = { walletUI: { showWalletSelection } };

        const wallet = createWalletStub();
        const component = new Cleanup();
        component.setContext(createContext({ wallet }));

        await component.initialize(true);
        const documentClickSpy = vi.fn();
        document.addEventListener('click', documentClickSpy);
        try {
            document.getElementById('cleanup-button').click();
            await new Promise(resolve => setTimeout(resolve, 0));
        } finally {
            document.removeEventListener('click', documentClickSpy);
        }

        expect(showWalletSelection).toHaveBeenCalledTimes(1);
        expect(wallet.connect).not.toHaveBeenCalled();
        expect(documentClickSpy).not.toHaveBeenCalled();

        component.cleanup();
    });

    it('opens the shared wallet picker when cleanup is invoked while disconnected', async () => {
        document.body.innerHTML = '<div id="cleanup-container"></div>';
        const showWalletSelection = vi.fn(async () => {});
        window.app = { walletUI: { showWalletSelection } };

        const wallet = createWalletStub();
        const ctx = createContext({ wallet });
        const component = new Cleanup();
        component.setContext(ctx);
        component.cleanupButton = document.createElement('button');
        vi.spyOn(component, 'checkCleanupOpportunities').mockResolvedValue();

        await component.performCleanup();

        expect(showWalletSelection).toHaveBeenCalledTimes(1);
        expect(wallet.connect).not.toHaveBeenCalled();
        expect(ctx.beginWalletAction).toHaveBeenCalledTimes(1);
        expect(ctx.endWalletAction).toHaveBeenCalledTimes(1);
    });
});
