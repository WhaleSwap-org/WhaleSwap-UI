import { afterEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { Cleanup } from '../js/components/Cleanup.js';
import { contractService } from '../js/services/ContractService.js';

const OLD_FEE_TOKEN = '0x1111111111111111111111111111111111111111';
const NEW_FEE_TOKEN = '0x2222222222222222222222222222222222222222';

function createContext() {
    return {
        getWallet: () => ({
            isWalletConnected: () => false,
            addListener: () => {}
        }),
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

describe('Cleanup order fee token display', () => {
    it('shows the fee token from the next cleanup order instead of the current fee config', async () => {
        document.body.innerHTML = `
            <div id="cleanup-container"></div>
            <span id="current-reward">Loading...</span>
            <span id="cleanup-ready">Loading...</span>
            <button id="cleanup-button"></button>
        `;

        const getFeeConfigSpy = vi
            .spyOn(contractService, 'getFeeConfig')
            .mockRejectedValue(new Error('current fee config should not be used'));

        const getTokenInfo = vi.fn(async (address) => {
            if (address === OLD_FEE_TOKEN) {
                return {
                    symbol: 'OLD',
                    decimals: 6,
                    iconUrl: 'img/token-logos/old-fee-token.png'
                };
            }
            return {
                symbol: 'NEW',
                decimals: 18,
                iconUrl: 'img/token-logos/new-fee-token.png'
            };
        });

        const component = new Cleanup();
        component.setContext(createContext());
        component.webSocket = {
            contract: {},
            getOrders: vi.fn(() => [
                {
                    id: 9,
                    timings: { graceEndsAt: 100 },
                    feeToken: NEW_FEE_TOKEN,
                    orderCreationFee: ethers.utils.parseEther('1')
                },
                {
                    id: 3,
                    timings: { graceEndsAt: 100 },
                    feeToken: OLD_FEE_TOKEN,
                    orderCreationFee: ethers.BigNumber.from('2500000')
                }
            ]),
            ensureChainTimeInitialized: vi.fn(async () => {}),
            getCurrentTimestamp: vi.fn(() => 200),
            getTokenInfo
        };

        await component.checkCleanupOpportunities();

        expect(getFeeConfigSpy).not.toHaveBeenCalled();
        expect(getTokenInfo).toHaveBeenCalledTimes(1);
        expect(getTokenInfo).toHaveBeenCalledWith(OLD_FEE_TOKEN);
        expect(document.getElementById('cleanup-ready').textContent).toBe('2');
        expect(document.querySelector('.cleanup-reward-amount').textContent).toBe('2.500000 OLD');
        expect(
            document.querySelector('.cleanup-reward-icon img').getAttribute('src')
        ).toBe('img/token-logos/old-fee-token.png');
        expect(document.getElementById('current-reward').getAttribute('aria-label')).toBe('2.500000 OLD');
    });
});
