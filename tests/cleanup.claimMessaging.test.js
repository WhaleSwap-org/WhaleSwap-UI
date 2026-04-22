import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cleanup } from '../js/components/Cleanup.js';

describe('Cleanup claim-directed messaging', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.app;
        document.body.innerHTML = '';
    });

    it('directs users to Claim tab when cleanup reward is credited', async () => {
        document.body.innerHTML = '<div id="cleanup-container"></div>';
        const component = new Cleanup();
        component.webSocket = {
            getTokenInfo: vi.fn(async () => ({
                symbol: 'USDC',
                decimals: 6,
            })),
            removeOrders: vi.fn(),
        };
        component.showSuccess = vi.fn();
        component.showInfo = vi.fn();
        component.debug = vi.fn();

        const scheduleClaimTabVisibilityRefresh = vi.fn();
        window.app = { scheduleClaimTabVisibilityRefresh };

        await component.handleCleanupResult({
            feeEvents: [
                {
                    recipient: '0x1111111111111111111111111111111111111111',
                    feeToken: '0x2222222222222222222222222222222222222222',
                    amount: '1000000',
                },
            ],
            cleanedEvents: [
                { orderId: '7' },
            ],
            userAddress: '0x1111111111111111111111111111111111111111',
        });

        expect(component.showSuccess).toHaveBeenCalledTimes(1);
        const successMessage = component.showSuccess.mock.calls[0][0];
        expect(successMessage).toContain('Reward added to your Claim balance');
        expect(successMessage).toContain('Go to the Claim tab to withdraw');
        expect(successMessage.toLowerCase()).not.toContain('check your wallet');
        expect(scheduleClaimTabVisibilityRefresh).toHaveBeenCalledWith(null, { force: true });
    });
});
