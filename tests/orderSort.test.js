import { describe, expect, it } from 'vitest';
import {
    ORDER_SORTS,
    getNextOrderSort,
    sortOrdersByCurrentSort
} from '../js/utils/orderSort.js';

function createOrder(id, { dealValue, expiresAt }) {
    return {
        id,
        dealValue,
        expiresAt
    };
}

describe('orderSort helpers', () => {
    const orders = [
        createOrder(1, { dealValue: 4, expiresAt: 300 }),
        createOrder(2, { dealValue: 2, expiresAt: 100 }),
        createOrder(3, { dealValue: undefined, expiresAt: undefined }),
        createOrder(4, { dealValue: 2, expiresAt: 100 })
    ];

    const sort = (sortValue) => sortOrdersByCurrentSort(orders, {
        sortValue,
        getDealSortValue: (order) => order.dealValue,
        getExpirySortValue: (order) => order.expiresAt
    }).map((order) => order.id);

    it('sorts each supported direction and keeps missing values last', () => {
        expect(sort(ORDER_SORTS.BEST_DEAL)).toEqual([1, 4, 2, 3]);
        expect(sort(ORDER_SORTS.WORST_DEAL)).toEqual([4, 2, 1, 3]);
        expect(sort(ORDER_SORTS.EXPIRES_NEWEST)).toEqual([1, 4, 2, 3]);
        expect(sort(ORDER_SORTS.EXPIRES_OLDEST)).toEqual([4, 2, 1, 3]);
    });

    it('toggles sort direction by column using the shared state machine', () => {
        expect(getNextOrderSort(ORDER_SORTS.BEST_DEAL, 'deal')).toBe(ORDER_SORTS.WORST_DEAL);
        expect(getNextOrderSort(ORDER_SORTS.WORST_DEAL, 'deal')).toBe(ORDER_SORTS.BEST_DEAL);
        expect(getNextOrderSort(ORDER_SORTS.BEST_DEAL, 'expires')).toBe(ORDER_SORTS.EXPIRES_NEWEST);
        expect(getNextOrderSort(ORDER_SORTS.EXPIRES_NEWEST, 'expires')).toBe(ORDER_SORTS.EXPIRES_OLDEST);
        expect(getNextOrderSort(ORDER_SORTS.EXPIRES_OLDEST, 'deal')).toBe(ORDER_SORTS.BEST_DEAL);
    });
});
