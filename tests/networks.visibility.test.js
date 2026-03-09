import { afterEach, describe, expect, it, vi } from 'vitest';

const loadNetworksModule = async ({ hostname = 'whaleswap.finance', search = '' } = {}) => {
    vi.resetModules();
    vi.stubGlobal('window', {
        location: {
            hostname,
            search
        }
    });

    return import('../js/config/networks.js');
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('network visibility', () => {
    it('hides Amoy on non-local hosts without an explicit override', async () => {
        const networks = await loadNetworksModule();

        expect(networks.getAllNetworks().map((network) => network.slug)).not.toContain('amoy');
        expect(networks.getNetworkBySlug('amoy')).toBeNull();
    });

    it('shows Amoy on localhost', async () => {
        const networks = await loadNetworksModule({
            hostname: 'localhost'
        });

        expect(networks.getAllNetworks().map((network) => network.slug)).toContain('amoy');
        expect(networks.getNetworkBySlug('amoy')?.slug).toBe('amoy');
    });

    it('shows Amoy on 127.0.0.1', async () => {
        const networks = await loadNetworksModule({
            hostname: '127.0.0.1'
        });

        expect(networks.getAllNetworks().map((network) => network.slug)).toContain('amoy');
        expect(networks.getNetworkBySlug('amoy')?.slug).toBe('amoy');
    });

    it('shows and selects Amoy when explicitly requested in the URL', async () => {
        const networks = await loadNetworksModule({
            hostname: 'whaleswap.finance',
            search: '?chain=amoy'
        });

        expect(networks.getRequestedNetworkSlugFromUrl()).toBe('amoy');
        expect(networks.getAllNetworks().map((network) => network.slug)).toContain('amoy');
        expect(networks.getNetworkBySlug('amoy')?.slug).toBe('amoy');
    });
});
