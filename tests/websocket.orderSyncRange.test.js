import { afterEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { WebSocketService } from '../js/services/WebSocket.js';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('WebSocketService startup order sync', () => {
    it('syncs the startup snapshot over HTTP without requiring a websocket contract', async () => {
        const service = new WebSocketService();
        const httpProvider = { name: 'http-provider' };
        const order = {
            id: 7,
            maker: '0x0000000000000000000000000000000000000011',
            taker: ethers.constants.AddressZero,
            sellToken: '0x00000000000000000000000000000000000000a1',
            sellAmount: ethers.BigNumber.from(10),
            buyToken: '0x00000000000000000000000000000000000000b1',
            buyAmount: ethers.BigNumber.from(20),
            timestamp: 1700000000,
            status: 'Active'
        };

        vi.spyOn(service, 'initialize').mockResolvedValue(false);
        vi.spyOn(service, 'loadStartupSnapshotViaHttp').mockResolvedValue({
            provider: httpProvider,
            startOrderId: 7,
            endOrderIdExclusive: 12,
            orderExpiry: ethers.BigNumber.from(3600),
            gracePeriod: ethers.BigNumber.from(300),
            fetchedOrders: [order]
        });
        vi.spyOn(service, 'calculateDealMetrics').mockImplementation(async (orderData, options = {}) => {
            expect(options.provider).toBe(httpProvider);
            return {
                ...orderData,
                dealMetrics: { deal: 1 }
            };
        });
        vi.spyOn(service, 'notifySubscribers').mockImplementation(() => {});
        const ensureEventListenersReadySpy = vi
            .spyOn(service, 'ensureEventListenersReady')
            .mockResolvedValue(true);

        const syncResult = await service.syncAllOrders();

        expect(syncResult).toBe(true);
        expect(service.loadStartupSnapshotViaHttp).toHaveBeenCalledTimes(1);
        expect(service.orderCache.has(7)).toBe(true);
        expect(service.hasCompletedOrderSync).toBe(true);
        expect(service.orderExpiry.toString()).toBe('3600');
        expect(service.gracePeriod.toString()).toBe('300');
        expect(ensureEventListenersReadySpy).not.toHaveBeenCalled();
    });

    it('triggers order sync without waiting for websocket initialization first', async () => {
        const service = new WebSocketService();
        const waitForInitializationSpy = vi.spyOn(service, 'waitForInitialization');
        const syncAllOrdersSpy = vi.spyOn(service, 'syncAllOrders').mockResolvedValue(true);

        const syncResult = await service.waitForOrderSync({ triggerIfNeeded: true });

        expect(syncResult).toBe(true);
        expect(waitForInitializationSpy).not.toHaveBeenCalled();
        expect(syncAllOrdersSpy).toHaveBeenCalledTimes(1);
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

        expect(multicallSpy).toHaveBeenNthCalledWith(
            1,
            5,
            7,
            expect.objectContaining({
                contract: service.contract
            })
        );
        expect(multicallSpy).toHaveBeenNthCalledWith(
            2,
            7,
            9,
            expect.objectContaining({
                contract: service.contract
            })
        );
        expect(orders).toEqual([{ id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }]);
    });
});
