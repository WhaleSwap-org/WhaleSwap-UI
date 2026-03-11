import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete window.ethereum;
});

describe('WalletManager provider initialization', () => {
    it('uses any-network mode for the injected Web3Provider', async () => {
        const mockWeb3Provider = vi.fn(() => ({
            listAccounts: vi.fn(async () => []),
            getSigner: vi.fn(),
        }));
        const injectedProvider = {
            request: vi.fn(async ({ method }) => {
                if (method === 'eth_accounts') {
                    return [];
                }
                return null;
            }),
            on: vi.fn(),
        };

        vi.doMock('ethers', () => ({
            ethers: {
                providers: {
                    Web3Provider: mockWeb3Provider,
                    JsonRpcProvider: vi.fn(),
                },
                Contract: vi.fn(),
            },
        }));

        window.ethereum = injectedProvider;

        const { WalletManager } = await import('../js/services/WalletManager.js');
        const manager = new WalletManager();
        await manager.init();

        expect(mockWeb3Provider).toHaveBeenCalledWith(injectedProvider, 'any');
    });
});
