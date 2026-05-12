import { afterEach, describe, expect, it, vi } from 'vitest';
import '../js/app.js';

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
    it('does not show compatibility warning for user-initiated wallet connections', async () => {
        const app = createAppHarness();

        await app.handleWalletConnectEvent({
            userInitiated: true,
            chainId: '0x89',
        });

        expect(app.showWarning).not.toHaveBeenCalled();
    });
});
