import { describe, expect, it } from 'vitest';
import { WebSocketService } from '../js/services/WebSocket.js';

describe('WebSocketService queueRequest', () => {
    it('enforces the configured concurrency limit', async () => {
        const service = new WebSocketService();
        service.minRequestInterval = 0;
        service.maxConcurrentRequests = 2;

        let activeRequests = 0;
        let maxObservedConcurrency = 0;

        const results = await Promise.all(
            Array.from({ length: 6 }, (_, index) => service.queueRequest(async () => {
                activeRequests++;
                maxObservedConcurrency = Math.max(maxObservedConcurrency, activeRequests);
                await new Promise((resolve) => setTimeout(resolve, 20));
                activeRequests--;
                return index;
            }))
        );

        expect(results).toEqual([0, 1, 2, 3, 4, 5]);
        expect(maxObservedConcurrency).toBeLessThanOrEqual(2);
    });
});
