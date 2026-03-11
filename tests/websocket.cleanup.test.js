import { describe, expect, it, vi } from 'vitest';
import { WebSocketService } from '../js/services/WebSocket.js';

describe('WebSocketService cleanup', () => {
    it('closes the underlying websocket connection during cleanup', () => {
        const service = new WebSocketService();
        const close = vi.fn();
        const removeAllListeners = vi.fn();

        service.provider = {
            _websocket: {
                readyState: 1,
                onopen: vi.fn(),
                onerror: vi.fn(),
                onclose: vi.fn(),
                close,
            },
            removeAllListeners,
        };
        service.contract = {
            removeAllListeners: vi.fn(),
        };

        service.cleanup();

        expect(removeAllListeners).toHaveBeenCalled();
        expect(close).toHaveBeenCalledWith(1000);
        expect(service.provider).toBeNull();
    });
});
