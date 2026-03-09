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
    it('accepts a standalone Phantom provider', () => {
        const phantomProvider = {
            isPhantom: true,
            request: async () => []
        };

        setEthereum(phantomProvider);

        const manager = new WalletManager();

        expect(manager.hasInjectedProvider()).toBe(true);
        expect(manager.getInjectedProvider()).toBe(phantomProvider);
    });

    it('selects Phantom when it is the only provider in a providers array', () => {
        const phantomProvider = {
            isPhantom: true,
            request: async () => []
        };

        setEthereum({
            providers: [phantomProvider]
        });

        const manager = new WalletManager();

        expect(manager.getInjectedProvider()).toBe(phantomProvider);
    });

    it('still prefers MetaMask when both MetaMask and Phantom are injected', () => {
        const phantomProvider = {
            isPhantom: true,
            request: async () => []
        };
        const metaMaskProvider = {
            isMetaMask: true,
            request: async () => []
        };

        setEthereum({
            providers: [phantomProvider, metaMaskProvider]
        });

        const manager = new WalletManager();

        expect(manager.getInjectedProvider()).toBe(metaMaskProvider);
    });
});
