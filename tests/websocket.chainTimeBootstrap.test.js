import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { WebSocketService } from '../js/services/WebSocket.js';

/**
 * Regression tests for the deadlock that left the "Preparing interface..."
 * loader stuck on Polygon:
 *
 *   refreshOrdersView()
 *     -> await ensureChainTimeInitialized()
 *       -> await bootstrapChainTime()
 *         -> await provider.getBlock('latest')  // hung forever
 *
 * The hang was caused by closeProviderConnection() nulling out
 * socket.onclose, which stripped ethers' own handler that rejects pending
 * requests when the socket closes. We now (a) leave ethers' socket handlers
 * alone so in-flight requests settle on close, and (b) bound
 * bootstrapChainTime with a short timeout as defense in depth.
 */
describe('WebSocketService.bootstrapChainTime', () => {
    it('does not deadlock when provider.getBlock never resolves', async () => {
        vi.useFakeTimers();
        const service = new WebSocketService();
        service.chainTimeBootstrapTimeoutMs = 50;
        service.provider = {
            // getBlock intentionally never settles: simulates an orphaned
            // request on a WS socket that was closed without ethers' onclose
            // handler running.
            getBlock: vi.fn(() => new Promise(() => {})),
        };

        const bootstrap = service.bootstrapChainTime();
        await vi.advanceTimersByTimeAsync(100);
        const result = await bootstrap;

        expect(result).toBeNull();
        expect(service.chainTimeSyncPromise).toBeNull();
        expect(service.lastKnownChainTimestamp).toBeNull();
        expect(service.lastChainTimeBootstrapFailureAtMonotonicMs).not.toBeNull();
        vi.useRealTimers();
    });

    it('returns the block timestamp when getBlock resolves in time', async () => {
        const service = new WebSocketService();
        service.chainTimeBootstrapTimeoutMs = 1000;
        const now = Math.floor(Date.now() / 1000);
        // bootstrapChainTime now prefers HTTP reads (JsonRpcProvider) to keep
        // WS "events only". Stub the HTTP provider so the test is deterministic.
        const httpGetBlock = vi.fn().mockResolvedValue({ timestamp: now });
        const providerCtor = vi
            .spyOn(ethers.providers, 'JsonRpcProvider')
            .mockImplementation(() => ({ getBlock: httpGetBlock }));

        service.provider = { getBlock: vi.fn() }; // unused when HTTP is configured

        const result = await service.bootstrapChainTime();

        expect(result).toBe(now);
        expect(service.lastKnownChainTimestamp).toBe(now);
        expect(service.lastChainTimeBootstrapFailureAtMonotonicMs).toBeNull();

        providerCtor.mockRestore();
    });

    it('returns null immediately when no provider is attached', async () => {
        const service = new WebSocketService();
        service.provider = null;
        const result = await service.bootstrapChainTime();
        expect(result).toBeNull();
    });
});

describe('WebSocketService.closeProviderConnection', () => {
    it('preserves ethers socket handlers so pending requests can settle', () => {
        const service = new WebSocketService();
        const onopen = vi.fn();
        const onerror = vi.fn();
        // Simulates ethers' own socket.onclose that rejects _requests. The fix
        // must leave it in place so ethers can run its cleanup when we call
        // socket.close() below.
        const onclose = vi.fn();
        const close = vi.fn();
        const provider = {
            _websocket: { readyState: 1, onopen, onerror, onclose, close },
            removeAllListeners: vi.fn(),
        };

        service.closeProviderConnection(provider);

        expect(provider.removeAllListeners).toHaveBeenCalled();
        expect(close).toHaveBeenCalledWith(1000);
        expect(provider._websocket.onopen).toBe(onopen);
        expect(provider._websocket.onerror).toBe(onerror);
        expect(provider._websocket.onclose).toBe(onclose);
    });

    it('is a no-op when no provider is supplied', () => {
        const service = new WebSocketService();
        expect(() => service.closeProviderConnection(null)).not.toThrow();
    });
});
