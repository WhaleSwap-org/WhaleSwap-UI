import { describe, expect, it, vi } from 'vitest';
import { buildOrderRowContext } from '../js/utils/ordersComponentHelpers.js';

const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function createWsStub({ status = 'Active', currentTimestamp = 1_700_000_000 } = {}) {
    return {
        getOrderStatus: vi.fn(() => status),
        getCurrentTimestamp: vi.fn(() => currentTimestamp)
    };
}

describe('ordersComponentHelpers', () => {
    it('builds row context from dealMetrics values when present', async () => {
        const ws = createWsStub();
        const pricing = {
            getPrice: vi.fn(() => 999),
            isPriceEstimated: vi.fn((address) => address.toLowerCase() === TOKEN_A),
            getTokenInfo: vi.fn(async (address) => {
                if (address.toLowerCase() === TOKEN_A) {
                    return { address: TOKEN_A, symbol: 'AAA', decimals: 18 };
                }
                return { address: TOKEN_B, symbol: 'BBB', decimals: 6 };
            })
        };
        const tokenDisplaySymbolMap = new Map([
            [TOKEN_A, 'AAA.issuer'],
            [TOKEN_B, 'BBB']
        ]);
        const order = {
            sellToken: TOKEN_A,
            buyToken: TOKEN_B,
            sellAmount: '1000000000000000000',
            buyAmount: '1230000',
            timings: {
                expiresAt: 1_700_003_600
            },
            dealMetrics: {
                formattedSellAmount: '1.00',
                formattedBuyAmount: '1.23',
                sellTokenUsdPrice: 10,
                buyTokenUsdPrice: 20,
                deal: 2
            }
        };

        const result = await buildOrderRowContext({ order, ws, pricing, tokenDisplaySymbolMap });

        expect(result.sellDisplaySymbol).toBe('AAA.issuer');
        expect(result.buyDisplaySymbol).toBe('BBB');
        expect(result.formattedSellAmount).toBe('1.00');
        expect(result.formattedBuyAmount).toBe('1.23');
        expect(result.resolvedSellPrice).toBe(10);
        expect(result.resolvedBuyPrice).toBe(20);
        expect(result.sellPriceClass).toBe('price-estimate');
        expect(result.buyPriceClass).toBe('');
        expect(result.orderStatus).toBe('Active');
        expect(result.expiryText).toBe('1H 0M');
        expect(result.buyerDealRatio).toBe(0.5);
    });

    it('builds row context from fallback amount and pricing when metrics are absent', async () => {
        const ws = createWsStub({ status: 'Filled' });
        const pricing = {
            getPrice: vi.fn((address) => (address.toLowerCase() === TOKEN_A ? 3 : 7)),
            isPriceEstimated: vi.fn(() => false),
            getTokenInfo: vi.fn(async (address) => {
                if (address.toLowerCase() === TOKEN_A) {
                    return { address: TOKEN_A, symbol: 'AAA', decimals: 18 };
                }
                return { address: TOKEN_B, symbol: 'BBB', decimals: 6 };
            })
        };
        const order = {
            sellToken: TOKEN_A,
            buyToken: TOKEN_B,
            sellAmount: '2000000',
            buyAmount: '900000',
            timings: {
                expiresAt: 1_700_003_600
            }
        };

        const result = await buildOrderRowContext({
            order,
            ws,
            pricing,
            tokenDisplaySymbolMap: new Map()
        });

        expect(result.formattedSellAmount).toBe('0.000000000002');
        expect(result.formattedBuyAmount).toBe('0.9');
        expect(result.resolvedSellPrice).toBe(3);
        expect(result.resolvedBuyPrice).toBe(7);
        expect(result.expiryText).toBe('');
        expect(result.buyerDealRatio).toBeUndefined();
    });

    it('prefers fresh token decimals over stale cached formatted amounts', async () => {
        const ws = createWsStub();
        const pricing = {
            getPrice: vi.fn(() => undefined),
            isPriceEstimated: vi.fn(() => false),
            getTokenInfo: vi.fn(async (address) => {
                if (address.toLowerCase() === TOKEN_A) {
                    return { address: TOKEN_A, symbol: 'AAA', decimals: 6, name: 'Token A' };
                }
                return { address: TOKEN_B, symbol: 'BBB', decimals: 6, name: 'Token B' };
            })
        };
        const order = {
            sellToken: TOKEN_A,
            buyToken: TOKEN_B,
            sellAmount: '1000000',
            buyAmount: '2000000',
            dealMetrics: {
                formattedSellAmount: '0.000000000001',
                formattedBuyAmount: '0.000000000002'
            }
        };

        const result = await buildOrderRowContext({
            order,
            ws,
            pricing,
            tokenDisplaySymbolMap: new Map()
        });

        expect(result.formattedSellAmount).toBe('1.0');
        expect(result.formattedBuyAmount).toBe('2.0');
    });
});
