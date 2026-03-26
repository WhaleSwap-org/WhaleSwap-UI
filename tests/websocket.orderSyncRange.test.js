import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { WebSocketService } from '../js/services/WebSocket.js';

describe('WebSocketService order sync range', () => {
    it('uses firstOrderId as the lower bound for initial sync', async () => {
        const service = new WebSocketService();
        service.contract = {
            address: '0x0000000000000000000000000000000000000001',
            firstOrderId: vi.fn().mockResolvedValue(ethers.BigNumber.from(7)),
            nextOrderId: vi.fn().mockResolvedValue(ethers.BigNumber.from(12))
        };

        const fetchOrdersInRangeSpy = vi
            .spyOn(service, 'fetchOrdersInRange')
            .mockResolvedValue([
                {
                    id: 7,
                    maker: '0x0000000000000000000000000000000000000011',
                    taker: ethers.constants.AddressZero,
                    sellToken: '0x00000000000000000000000000000000000000a1',
                    sellAmount: ethers.BigNumber.from(10),
                    buyToken: '0x00000000000000000000000000000000000000b1',
                    buyAmount: ethers.BigNumber.from(20),
                    timestamp: 1700000000,
                    status: 'Active'
                }
            ]);
        vi.spyOn(service, 'calculateDealMetrics').mockImplementation(async (orderData) => ({
            ...orderData,
            dealMetrics: { deal: 1 }
        }));
        vi.spyOn(service, 'setupEventListeners').mockResolvedValue();
        vi.spyOn(service, 'notifySubscribers').mockImplementation(() => {});

        const syncResult = await service.syncAllOrders();

        expect(syncResult).toBe(true);
        expect(service.contract.firstOrderId).toHaveBeenCalledTimes(1);
        expect(service.contract.nextOrderId).toHaveBeenCalledTimes(1);
        expect(fetchOrdersInRangeSpy).toHaveBeenCalledWith(7, 12, 50);
        expect(service.orderCache.has(7)).toBe(true);
    });

    it('batches reads from a non-zero start order id', async () => {
        const service = new WebSocketService();
        service.contract = {
            address: '0x0000000000000000000000000000000000000001'
        };

        const multicallSpy = vi
            .spyOn(service, 'fetchOrdersViaMulticall')
            .mockResolvedValueOnce([{ id: 5 }, { id: 6 }])
            .mockResolvedValueOnce([{ id: 7 }, { id: 8 }]);
        vi.spyOn(service, 'notifySubscribers').mockImplementation(() => {});

        const orders = await service.fetchOrdersInRange(5, 9, 2);

        expect(multicallSpy).toHaveBeenNthCalledWith(1, 5, 7);
        expect(multicallSpy).toHaveBeenNthCalledWith(2, 7, 9);
        expect(orders).toEqual([{ id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }]);
    });
});
