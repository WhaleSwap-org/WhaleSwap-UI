import { afterEach, describe, expect, it } from 'vitest';
import { CreateOrder } from '../js/components/CreateOrder.js';

function setupCreateOrderDom() {
    document.body.innerHTML = '<div id="create-order"></div>';
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('CreateOrder taker address input', () => {
    it('sanitizes live taker input to 0x plus hex characters', () => {
        setupCreateOrderDom();

        const component = new CreateOrder();
        component.container.innerHTML = component.render();
        component.initializeTakerAddressInput();

        const takerAddressInput = document.getElementById('takerAddress');
        takerAddressInput.value = '0X12g-34 yz';
        takerAddressInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(takerAddressInput.value).toBe('0x1234');
    });

    it('limits taker input to a 42-character address length', () => {
        setupCreateOrderDom();

        const component = new CreateOrder();
        component.container.innerHTML = component.render();
        component.initializeTakerAddressInput();

        const takerAddressInput = document.getElementById('takerAddress');
        takerAddressInput.value = `0x${'a'.repeat(50)}`;
        takerAddressInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(takerAddressInput.maxLength).toBe(42);
        expect(takerAddressInput.value).toBe(`0x${'a'.repeat(40)}`);
    });
});
