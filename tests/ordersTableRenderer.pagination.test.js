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
        renderer: new OrdersTableRenderer(component, { showRefreshButton: false })
    };
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('OrdersTableRenderer pagination controls', () => {
    it('renders page size selectors in both top and bottom filter controls', async () => {
        const { component, renderer } = createRenderer();

        await renderer.setupTable(() => {});

        expect(component.container.querySelectorAll('.page-size-select')).toHaveLength(2);
        expect(component.container.querySelector('.bottom-controls .page-size-select')).not.toBeNull();
    });

    it('syncs page size changes between both controls before refreshing', async () => {
        const { component, renderer } = createRenderer();
        const onRefresh = vi.fn();

        await renderer.setupTable(onRefresh);

        const [topSelect, bottomSelect] = component.container.querySelectorAll('.page-size-select');
        component.currentPage = 4;

        bottomSelect.value = '50';
        bottomSelect.dispatchEvent(new Event('change', { bubbles: true }));

        expect(topSelect.value).toBe('50');
        expect(bottomSelect.value).toBe('50');
        expect(component.currentPage).toBe(1);
        expect(onRefresh).toHaveBeenCalledOnce();

        renderer.updatePaginationControls(component.totalOrders);
        expect(
            Array.from(component.container.querySelectorAll('.page-info')).map((element) => element.textContent)
        ).toEqual([
            '1-50 of 120 orders (Page 1 of 3)',
            '1-50 of 120 orders (Page 1 of 3)'
        ]);
    });
});
