import { afterEach, describe, expect, it, vi } from 'vitest';
import { Intro } from '../js/components/Intro.js';
import { WALLET_COMPATIBILITY_NOTICE } from '../js/config/index.js';

function createContextStub() {
    return {
        getWebSocket: () => ({
            waitForInitialization: vi.fn(async () => true),
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
            contract: null
        }),
        showError: vi.fn(),
        showSuccess: vi.fn(),
        showWarning: vi.fn(),
        showInfo: vi.fn()
    };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('Intro wallet compatibility FAQ copy', () => {
    it('renders the wallet compatibility FAQ entry with the shared notice', async () => {
        document.body.innerHTML = '<div id="intro"></div>';

        const component = new Intro();
        component.setContext(createContextStub());

        await component.initialize();

        expect(component.container.textContent).toContain('Wallet Compatibility');
        expect(component.container.textContent).toContain(WALLET_COMPATIBILITY_NOTICE);
    });
});
