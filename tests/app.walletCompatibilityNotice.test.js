import { afterEach, describe, expect, it, vi } from 'vitest';
import { WALLET_COMPATIBILITY_NOTICE } from '../js/config/index.js';
import '../js/app.js';

const ORIGINAL_APP = window.app;

function createApp({ selectedNetworkSlug = 'polygon' } = {}) {
    const AppCtor = ORIGINAL_APP.constructor;
    const app = new AppCtor();

    app.ctx = {
        setWalletChainId: vi.fn(),
        getSelectedChainSlug: () => selectedNetworkSlug
    };
    app.updateTabVisibility = vi.fn();
    app.refreshAdminTabVisibility = vi.fn(async () => {});
    app.refreshClaimTabVisibility = vi.fn(async () => {});
    app.refreshOrderTabVisibility = vi.fn(async () => {});
    app.reinitializeComponents = vi.fn(async () => {});
    app.switchWalletToNetworkWithReload = vi.fn(async () => true);
    app.showWarning = vi.fn();

    window.app = app;
    return app;
}

afterEach(() => {
    sessionStorage.clear();
    window.app = ORIGINAL_APP;
    vi.restoreAllMocks();
});

describe('App wallet compatibility notice', () => {
    it('shows the warning immediately for manual connects on the selected network', async () => {
        const app = createApp({ selectedNetworkSlug: 'polygon' });

        await app.handleWalletConnectEvent({
            account: '0x1111111111111111111111111111111111111111',
            chainId: '0x89',
            userInitiated: true
        });

        expect(app.showWarning).toHaveBeenCalledWith(WALLET_COMPATIBILITY_NOTICE);
        expect(app.switchWalletToNetworkWithReload).not.toHaveBeenCalled();
        expect(app.reinitializeComponents).toHaveBeenCalledWith(true);
    });

    it('queues the warning for replay when manual connects require a network-switch reload', async () => {
        const app = createApp({ selectedNetworkSlug: 'bnb' });

        await app.handleWalletConnectEvent({
            account: '0x1111111111111111111111111111111111111111',
            chainId: '0x89',
            userInitiated: true
        });

        expect(app.showWarning).not.toHaveBeenCalledWith(WALLET_COMPATIBILITY_NOTICE);
        expect(app.switchWalletToNetworkWithReload).toHaveBeenCalledWith(
            expect.objectContaining({ slug: 'bnb' })
        );

        expect(app.flushPendingWalletCompatibilityNotice()).toBe(true);
        expect(app.showWarning).toHaveBeenCalledWith(WALLET_COMPATIBILITY_NOTICE);
        expect(app.flushPendingWalletCompatibilityNotice()).toBe(false);
    });

    it('does not show the warning for restored non-user-initiated wallet sessions', async () => {
        const app = createApp({ selectedNetworkSlug: 'polygon' });

        await app.handleWalletConnectEvent({
            account: '0x1111111111111111111111111111111111111111',
            chainId: '0x89',
            userInitiated: false
        });

        expect(app.showWarning).not.toHaveBeenCalledWith(WALLET_COMPATIBILITY_NOTICE);
    });
});
