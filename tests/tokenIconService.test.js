import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_ICON_CONFIG } from '../js/config/index.js';
import { TokenIconService } from '../js/services/TokenIconService.js';

const VALID_TOKEN = '0xAbCdEfabcdefABCDefAbcdefabcdefABCDefABCD';
const NORMALIZED_TOKEN = VALID_TOKEN.toLowerCase();
const VERSIONED_PNG_PATH = `img/token-logos/${NORMALIZED_TOKEN}.png?v=${encodeURIComponent(
    TOKEN_ICON_CONFIG.LOCAL_ICON_VERSION
)}`;

afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('TokenIconService', () => {
    it('builds a single normalized PNG candidate for a token address', () => {
        const service = new TokenIconService();

        expect(service.buildLocalIconCandidates(VALID_TOKEN, '0x89')).toEqual([
            `img/token-logos/${NORMALIZED_TOKEN}.png`
        ]);
    });

    it('checks only the versioned PNG path when resolving a local icon', async () => {
        const service = new TokenIconService();
        const existsSpy = vi.spyOn(service, 'doesLocalIconExist').mockResolvedValue(true);

        const iconUrl = await service.getLocalIconUrl(VALID_TOKEN, '0x89');

        expect(iconUrl).toBe(VERSIONED_PNG_PATH);
        expect(existsSpy).toHaveBeenCalledOnce();
        expect(existsSpy).toHaveBeenCalledWith(VERSIONED_PNG_PATH);
    });

    it('falls back cleanly for invalid token parameters', async () => {
        const service = new TokenIconService();

        await expect(service.getIconUrl(null, '0x89')).resolves.toBe('fallback');
        await expect(service.getIconUrl('0x1234', '0x89')).resolves.toBe('fallback');
        await expect(service.getIconUrl(VALID_TOKEN, null)).resolves.toBe('fallback');
    });
});
