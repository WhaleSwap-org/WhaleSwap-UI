import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast } from '../js/components/Toast.js';
import { createTransactionProgressSession } from '../js/utils/transactionProgress.js';

const createdToasts = [];

function createToast() {
    const toast = new Toast();
    createdToasts.push(toast);
    return toast;
}

function createPointerDownEvent(init = {}) {
    const EventCtor = typeof window.PointerEvent === 'function' ? window.PointerEvent : window.MouseEvent;
    return new EventCtor('pointerdown', {
        bubbles: true,
        button: 0,
        isPrimary: true,
        pointerType: 'mouse',
        ...init,
    });
}

function advanceToastTimers(ms = 0) {
    vi.advanceTimersByTime(ms);
}

describe('Toast outside-click dismissal', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('requestAnimationFrame', callback => {
            callback();
            return 0;
        });
    });

    afterEach(() => {
        while (createdToasts.length > 0) {
            createdToasts.pop().destroy();
        }
        document.body.innerHTML = '';
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('dismisses a standard toast on outside pointerdown', () => {
        const toast = createToast();
        toast.showToast('Saved', 'success', 0, true);

        expect(document.querySelectorAll('.toast')).toHaveLength(1);

        document.body.dispatchEvent(createPointerDownEvent());
        advanceToastTimers(300);

        expect(document.querySelectorAll('.toast')).toHaveLength(0);
    });

    it('does not dismiss a toast when the pointerdown starts inside it', () => {
        const toast = createToast();
        toast.showToast('Saved', 'success', 0, true);

        const toastElement = document.querySelector('.toast');
        toastElement.dispatchEvent(createPointerDownEvent());
        advanceToastTimers(300);

        expect(document.querySelectorAll('.toast')).toHaveLength(1);
    });

    it('dismisses all visible toasts with one outside pointerdown', () => {
        const toast = createToast();
        toast.showToast('One', 'info', 0, true);
        toast.showToast('Two', 'success', 0, true);
        toast.showToast('Three', 'warning', 0, true);

        advanceToastTimers(200);
        expect(document.querySelectorAll('.toast')).toHaveLength(3);

        document.body.dispatchEvent(createPointerDownEvent());
        advanceToastTimers(300);

        expect(document.querySelectorAll('.toast')).toHaveLength(0);
    });

    it('hides an active transaction progress toast and allows reopening it', () => {
        const toast = createToast();
        const session = createTransactionProgressSession(toast, {
            title: 'Creating Order',
            successTitle: 'Order Created',
            failureTitle: 'Order Creation Failed',
            cancelledTitle: 'Order Creation Cancelled',
            summary: 'Complete the steps below.',
            steps: [
                { id: 'submit-order', label: 'Submit order', status: 'active' },
            ],
        });
        const visibilityChanges = [];

        session.onVisibilityChange(update => {
            visibilityChanges.push(update);
        });

        expect(document.querySelectorAll('.toast.toast-transaction')).toHaveLength(1);
        expect(session.isVisible()).toBe(true);

        document.body.dispatchEvent(createPointerDownEvent());

        expect(session.isHidden()).toBe(true);
        expect(session.isActive()).toBe(true);
        expect(visibilityChanges).toEqual([{ hidden: true, active: true }]);

        advanceToastTimers(300);
        expect(document.querySelectorAll('.toast.toast-transaction')).toHaveLength(0);

        session.reopen();

        expect(session.isVisible()).toBe(true);
        expect(document.querySelectorAll('.toast.toast-transaction')).toHaveLength(1);
        expect(visibilityChanges).toEqual([
            { hidden: true, active: true },
            { hidden: false, active: true },
        ]);
    });
});
