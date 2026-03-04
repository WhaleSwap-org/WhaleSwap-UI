import { describe, expect, it } from 'vitest';
import {
    getOrderTabVisibility,
    hasInvitedOrdersForAccount,
    hasMakerOrdersForAccount
} from '../js/utils/orderTabs.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

describe('order tab visibility utils', () => {
    it('detects maker orders for account', () => {
        const orders = [
            { maker: OTHER, taker: '0x0000000000000000000000000000000000000000' },
            { maker: ACCOUNT, taker: OTHER }
        ];

        expect(hasMakerOrdersForAccount(orders, ACCOUNT)).toBe(true);
        expect(hasMakerOrdersForAccount(orders, OTHER)).toBe(true);
    });

    it('detects invited orders from taker match', () => {
        const orders = [
            { maker: OTHER, taker: ACCOUNT },
            { maker: ACCOUNT, taker: '0x0000000000000000000000000000000000000000' }
        ];

        expect(hasInvitedOrdersForAccount(orders, ACCOUNT)).toBe(true);
        expect(hasInvitedOrdersForAccount(orders, OTHER)).toBe(false);
    });

    it('returns both visibilities from a single pass input', () => {
        const orders = [
            { maker: ACCOUNT, taker: '0x0000000000000000000000000000000000000000' },
            { maker: OTHER, taker: ACCOUNT }
        ];

        expect(getOrderTabVisibility(orders, ACCOUNT)).toEqual({
            showMyOrders: true,
            showInvitedOrders: true
        });
        expect(getOrderTabVisibility([], ACCOUNT)).toEqual({
            showMyOrders: false,
            showInvitedOrders: false
        });
    });
});
