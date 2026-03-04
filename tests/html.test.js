import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeHtmlAttribute, escapeHtmlText } from '../js/utils/html.js';

describe('html utils', () => {
    it('escapes full html entities with quotes for general output', () => {
        expect(escapeHtml(`5 < 6 & "quoted" 'single'`))
            .toBe('5 &lt; 6 &amp; &quot;quoted&quot; &#39;single&#39;');
    });

    it('escapes text content without quoting changes', () => {
        expect(escapeHtmlText(`5 < 6 & "quoted"`))
            .toBe('5 &lt; 6 &amp; "quoted"');
    });

    it('escapes html attribute values and normalizes newlines', () => {
        expect(escapeHtmlAttribute('line 1\nline "2" <x> & ok'))
            .toBe('line 1&#10;line &quot;2&quot; &lt;x&gt; &amp; ok');
    });
});
