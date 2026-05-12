import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
    delete window.ethereum;
});

function mockEthers() {
    const mockWeb3Provider = vi.fn((injectedProvider) => ({
        injectedProvider,
        listAccounts: vi.fn(async () => []),
        getSigner: vi.fn(() => ({ address: 'signer' })),
    }));
    const mockContract = vi.fn(() => ({
        interface: {
            format: vi.fn(() => []),
        },
    }));

    vi.doMock('ethers', () => ({
        ethers: {
            providers: {
                Web3Provider: mockWeb3Provider,
                JsonRpcProvider: vi.fn(),
            },
            Contract: mockContract,
        },
    }));

    return { mockWeb3Provider, mockContract };
}

describe('WalletManager provider initialization', () => {
    it('discovers wallets without probing or creating a Web3Provider when there is no saved session', async () => {
        const { mockWeb3Provider } = mockEthers();
        const injectedProvider = {
            request: vi.fn(async ({ method }) => {
                if (method === 'eth_accounts') {
                    return [];
                }
                return null;
            }),
            on: vi.fn(),
            removeListener: vi.fn(),
        };

        window.ethereum = injectedProvider;

        const { WalletManager } = await import('../js/services/WalletManager.js');
        const manager = new WalletManager();
        await manager.init();

        expect(injectedProvider.request).not.toHaveBeenCalled();
        expect(mockWeb3Provider).not.toHaveBeenCalled();
        expect(manager.getProvider()).toBeNull();
    });

    it('uses any-network mode for the saved wallet session provider', async () => {
        const { mockWeb3Provider } = mockEthers();
        const account = '0x00000000000000000000000000000000000000aa';
        const injectedProvider = {
            request: vi.fn(async ({ method }) => {
                if (method === 'eth_accounts') {
                    return [account];
                }
                if (method === 'eth_chainId') {
                    return '0x89';
                }
                return null;
            }),
            on: vi.fn(),
            removeListener: vi.fn(),
        };

        localStorage.setItem('whaleswap-ui:wallet-session', JSON.stringify({ walletId: 'legacy:globalthis' }));
        window.ethereum = injectedProvider;

        const { WalletManager } = await import('../js/services/WalletManager.js');
        const manager = new WalletManager();
        await manager.init();

        expect(mockWeb3Provider).toHaveBeenCalledWith(injectedProvider, 'any');
        expect(manager.getAccount()).toBe(account);
        expect(manager.chainId).toBe('0x89');
    });

    it('recreates ethers provider state when the selected injected provider changes', async () => {
        const { mockWeb3Provider } = mockEthers();
        const providerA = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
        const providerB = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
        let activeProvider = providerA;

        const { WalletManager } = await import('../js/services/WalletManager.js');
        const manager = new WalletManager();
        manager.walletCore = {
            getEip1193Provider: vi.fn(() => activeProvider),
            getState: vi.fn(() => ({
                account: '0x00000000000000000000000000000000000000cc',
                chainId: 137,
            })),
        };

        manager.syncConnectedStateFromWalletCore();
        const firstProvider = manager.getProvider();
        manager.signer = { stale: true };
        manager.contract = { stale: true };
        manager.contractInitialized = true;

        activeProvider = providerB;
        manager.syncConnectedStateFromWalletCore();
        const secondProvider = manager.getProvider();

        expect(firstProvider).not.toBe(secondProvider);
        expect(mockWeb3Provider).toHaveBeenNthCalledWith(1, providerA, 'any');
        expect(mockWeb3Provider).toHaveBeenNthCalledWith(2, providerB, 'any');
        expect(manager.signer).toBeNull();
        expect(manager.contract).toBeNull();
        expect(manager.contractInitialized).toBe(false);
    });

    it('connects an EIP-6963-only wallet before creating the ethers provider', async () => {
        const { mockWeb3Provider } = mockEthers();
        const injectedProvider = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
        const account = '0x00000000000000000000000000000000000000bb';

        const { WalletManager } = await import('../js/services/WalletManager.js');
        const manager = new WalletManager();
        manager.walletCore = {
            discoverWallets: vi.fn(async () => [{
                id: 'eip6963:mock',
                info: { name: 'Mock Wallet' },
            }]),
            connect: vi.fn(async () => account),
            getState: vi.fn(() => ({
                account,
                chainId: 137,
                selectedWalletId: 'eip6963:mock',
            })),
            getEip1193Provider: vi.fn(() => injectedProvider),
            disconnect: vi.fn(),
            hasWalletSession: vi.fn(() => false),
            subscribe: vi.fn(() => () => {}),
            sync: vi.fn(),
        };

        const result = await manager.connect({ userInitiated: true, walletId: 'eip6963:mock' });

        expect(manager.walletCore.connect).toHaveBeenCalledWith({ walletId: 'eip6963:mock' });
        expect(mockWeb3Provider).toHaveBeenCalledWith(injectedProvider, 'any');
        expect(result).toMatchObject({
            account,
            chainId: '0x89',
            userInitiated: true,
        });
    });
});
