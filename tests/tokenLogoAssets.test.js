import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('token logo assets', () => {
    it('stores every token logo as a PNG file', () => {
        const tokenLogoDir = join(process.cwd(), 'img', 'token-logos');
        const files = readdirSync(tokenLogoDir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name);

        expect(files.length).toBeGreaterThan(0);
        expect(files.every((name) => name.toLowerCase().endsWith('.png'))).toBe(true);
    });
});
