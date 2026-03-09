import { afterEach, describe, expect, it } from 'vitest';
import { WalletManager } from '../js/services/WalletManager.js';

function setEthereum(value) {
    Object.defineProperty(window, 'ethereum', {
        configurable: true,
        writable: true,
        value
    });
}

afterEach(() => {
    setEthereum(undefined);
});

describe('WalletManager injected provider selection', () => {
    it('accepts a standalone injected provider with request support', () => {
        const walletProvider = {
            isCoinbaseWallet: true,
            request: async () => []
        };

        setEthereum(walletProvider);

        const manager = new WalletManager();

        expect(manager.hasInjectedProvider()).toBe(true);
        expect(manager.getInjectedProvider()).toBe(walletProvider);
    });

    it('selects the first request-capable provider when MetaMask is absent', () => {
        const walletProvider = {
            isCoinbaseWallet: true,
            request: async () => []
        };

        setEthereum({
            providers: [{}, walletProvider]
        });

        const manager = new WalletManager();

        expect(manager.getInjectedProvider()).toBe(walletProvider);
    });

    it('still prefers MetaMask when MetaMask and another EVM wallet are injected', () => {
        const walletProvider = {
            isCoinbaseWallet: true,
            request: async () => []
        };
        const metaMaskProvider = {
            isMetaMask: true,
            request: async () => []
        };

        setEthereum({
            providers: [walletProvider, metaMaskProvider]
        });

        const manager = new WalletManager();

        expect(manager.getInjectedProvider()).toBe(metaMaskProvider);
    });
});
