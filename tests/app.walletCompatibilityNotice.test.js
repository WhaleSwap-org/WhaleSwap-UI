import { afterEach, describe, expect, it, vi } from 'vitest';
import '../js/app.js';
import { WALLET_COMPATIBILITY_NOTICE } from '../js/config/index.js';
import { walletManager } from '../js/services/WalletManager.js';

function createAppHarness() {
    const AppCtor = window.app.constructor;
    const app = new AppCtor();
    app.ctx = {
        setWalletChainId: vi.fn(),
    };
    app.showWarning = vi.fn();
    app.updateTabVisibility = vi.fn();
    app.refreshAdminTabVisibility = vi.fn(async () => {});
    app.refreshClaimTabVisibility = vi.fn(async () => {});
    app.refreshOrderTabVisibility = vi.fn(async () => {});
    app.reinitializeComponents = vi.fn(async () => {});
    return app;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('App wallet compatibility notice behavior', () => {
    it('does not show compatibility warning for user-initiated MetaMask connections', async () => {
        const app = createAppHarness();
        vi.spyOn(walletManager, 'isConnectedWalletMetaMask').mockReturnValue(true);

        await app.handleWalletConnectEvent({
            userInitiated: true,
            chainId: '0x89',
            isMetaMaskWallet: true,
        });

        expect(app.showWarning).not.toHaveBeenCalled();
    });

    it('shows compatibility warning for user-initiated non-MetaMask connections', async () => {
        const app = createAppHarness();
        vi.spyOn(walletManager, 'isConnectedWalletMetaMask').mockReturnValue(false);

        await app.handleWalletConnectEvent({
            userInitiated: true,
            chainId: '0x89',
            isMetaMaskWallet: false,
        });

        expect(app.showWarning).toHaveBeenCalledWith(WALLET_COMPATIBILITY_NOTICE);
    });
});
