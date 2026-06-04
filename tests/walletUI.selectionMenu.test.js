import { afterEach, describe, expect, it } from 'vitest';
import { WalletUI } from '../js/components/WalletUI.js';

let ui = null;

afterEach(() => {
    ui?.cleanup();
    ui = null;
    document.body.innerHTML = '';
});

describe('WalletUI wallet selection menu', () => {
    it('closes on outside click while disconnected', () => {
        document.body.innerHTML = `
            <div id="wallet-container"></div>
            <button id="walletConnect">Connect Wallet</button>
            <div id="walletInfo" class="hidden"></div>
            <span id="accountAddress"></span>
            <div id="wallet-popup-container"></div>
            <button id="outside">Outside</button>
        `;

        ui = new WalletUI();
        ui.initializeElements();
        ui.setupEventListeners();

        ui.walletSelectionMenu.classList.remove('hidden');
        ui.walletSelectionMenu.append(ui.createWalletSelectionMessage('Select Wallet'));
        ui.walletPopup = null;

        document.getElementById('outside').click();

        expect(ui.walletSelectionMenu.classList.contains('hidden')).toBe(true);
    });

    it('renders wallet logo images beside wallet names', () => {
        document.body.innerHTML = `
            <div id="wallet-container"></div>
            <button id="walletConnect">Connect Wallet</button>
            <div id="walletInfo" class="hidden"></div>
            <span id="accountAddress"></span>
            <div id="wallet-popup-container"></div>
        `;

        ui = new WalletUI();
        ui.initializeElements();

        const option = ui.createWalletOption({
            id: 'legacy:default',
            info: {
                name: 'MetaMask',
                icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
            },
        });

        const image = option.querySelector('.wallet-selection-icon img');
        expect(image?.getAttribute('src')).toContain('data:image/svg+xml');
        expect(option.querySelector('.wallet-selection-name')?.textContent).toBe('MetaMask');
    });

    it('shows only truncated address in connected wallet badge', () => {
        document.body.innerHTML = `
            <div id="wallet-container"></div>
            <button id="walletConnect">Connect Wallet</button>
            <div id="walletInfo" class="wallet-info">
                <span id="accountAddress" class="account-address"></span>
            </div>
            <div id="wallet-popup-container"></div>
        `;

        ui = new WalletUI();
        ui.initializeElements();
        ui.renderConnectedWalletInfo('0x6587...2361');

        expect(ui.walletInfo.children).toHaveLength(1);
        expect(ui.walletInfo.textContent).toBe('0x6587...2361');
    });
});
