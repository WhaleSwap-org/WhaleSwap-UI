import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletUI } from '../js/components/WalletUI.js';
import { walletManager } from '../js/services/WalletManager.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';

function setupDom() {
    document.body.innerHTML = `
        <div id="wallet-container"></div>
        <button id="walletConnect" type="button">Connect Wallet</button>
        <div id="walletInfo" class="hidden"></div>
        <span id="accountAddress"></span>
        <div id="wallet-popup-container"></div>
        <div class="swap-section"></div>
    `;
}

function createContextStub() {
    return {
        getWebSocket: () => ({}),
        getWallet: () => null,
        showError: vi.fn(),
        showSuccess: vi.fn(),
        showWarning: vi.fn(),
        showInfo: vi.fn()
    };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('WalletUI compatibility notice', () => {
    it('marks wallet-button connects as user-initiated', async () => {
        setupDom();

        const component = new WalletUI();
        const ctx = createContextStub();
        component.setContext(ctx);

        vi.spyOn(walletManager, 'connect').mockResolvedValue({ account: ACCOUNT, userInitiated: true });

        await component.connectWallet();

        expect(walletManager.connect).toHaveBeenCalledWith({ userInitiated: true });
    });
});
