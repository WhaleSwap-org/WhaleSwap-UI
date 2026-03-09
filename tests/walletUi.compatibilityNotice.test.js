import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletUI } from '../js/components/WalletUI.js';
import { WALLET_COMPATIBILITY_NOTICE } from '../js/config/index.js';

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
    it('shows the wallet compatibility warning after a successful manual connect', async () => {
        setupDom();

        const component = new WalletUI();
        const ctx = createContextStub();
        component.setContext(ctx);

        vi.spyOn(component, 'connectWallet').mockResolvedValue({ account: ACCOUNT });
        vi.spyOn(component, 'checkInitialConnectionState').mockResolvedValue();

        await component.initialize();
        await component.handleConnectClick({
            preventDefault() {},
            stopPropagation() {}
        });

        expect(ctx.showWarning).toHaveBeenCalledWith(WALLET_COMPATIBILITY_NOTICE, 5000);
        expect(document.getElementById('accountAddress')?.textContent).toBe('0x1111...1111');

        component.cleanup();
    });
});
