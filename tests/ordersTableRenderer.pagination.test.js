import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdersTableRenderer } from '../js/services/OrdersTableRenderer.js';

function createRenderer() {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const component = {
        container,
        currentPage: 1,
        totalOrders: 120,
        createElement(tag, className = '') {
            const element = document.createElement(tag);
            if (className) {
                element.className = className;
            }
            return element;
        },
        ctx: {
            getWebSocket: () => ({
                tokenCache: new Map()
            }),
            getWalletChainId: () => '0x89'
        }
    };

    return {
        component,
        renderer: new OrdersTableRenderer(component, { showRefreshButton: true })
    };
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('OrdersTableRenderer pagination controls', () => {
    it('renders refresh controls at the top and pagination only at the bottom', async () => {
        const { component, renderer } = createRenderer();

        await renderer.setupTable(() => {});

        expect(component.container.querySelectorAll('.page-size-select')).toHaveLength(1);
        expect(component.container.querySelector('.filter-controls .refresh-prices-button')).not.toBeNull();
        expect(component.container.querySelector('.bottom-controls .page-size-select')).not.toBeNull();
        expect(component.container.querySelector('.bottom-controls .page-size-select')?.value).toBe('10');
    });

    it('refreshes and updates the single bottom pagination control when page size changes', async () => {
        const { component, renderer } = createRenderer();
        const onRefresh = vi.fn();

        await renderer.setupTable(onRefresh);

        const bottomSelect = component.container.querySelector('.bottom-controls .page-size-select');
        component.currentPage = 4;

        bottomSelect.value = '50';
        bottomSelect.dispatchEvent(new Event('change', { bubbles: true }));

        expect(bottomSelect.value).toBe('50');
        expect(component.currentPage).toBe(1);
        expect(onRefresh).toHaveBeenCalledOnce();

        renderer.updatePaginationControls(component.totalOrders);
        expect(component.container.querySelectorAll('.page-info')).toHaveLength(1);
        expect(component.container.querySelector('.page-info')?.textContent).toBe(
            '1-50 of 120 orders (Page 1 of 3)'
        );
    });
});
