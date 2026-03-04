import { describe, expect, it } from 'vitest';
import { createDealCellHTML, createInlineTooltipIcon } from '../js/utils/ui.js';

describe('ui escaping characterization', () => {
    it('escapes tooltip and aria attribute values', () => {
        const html = createInlineTooltipIcon('5 < 6 & "quoted"\nsecond line', {
            ariaLabel: 'Label "value" <tag>'
        });

        expect(html).toContain('data-order-tooltip="5 &lt; 6 &amp; &quot;quoted&quot;&#10;second line"');
        expect(html).toContain('aria-label="Label &quot;value&quot; &lt;tag&gt;"');
    });

    it('escapes deal text content in deal cells', () => {
        const html = createDealCellHTML('<img src=x onerror=1> & done');

        expect(html).toContain('&lt;img src=x onerror=1&gt; &amp; done');
        expect(html).not.toContain('<img src=x onerror=1>');
    });
});
