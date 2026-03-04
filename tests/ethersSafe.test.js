import { afterEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { safeBigNumberFrom, safeFormatUnits, safeGetAddress } from '../js/utils/ethersSafe.js';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ethersSafe utils', () => {
    it('returns checksummed address when valid, fallback when invalid', () => {
        const valid = '0x1111111111111111111111111111111111111111';

        expect(safeGetAddress(valid, null)).toBe(valid);
        expect(safeGetAddress('invalid-address', 'fallback')).toBe('fallback');
    });

    it('returns BigNumber from input or fallback on parse failure', () => {
        expect(safeBigNumberFrom('123').toString()).toBe('123');
        expect(safeBigNumberFrom('not-a-number', 7).toString()).toBe('7');
        expect(safeBigNumberFrom('still-bad', 'also-bad').toString()).toBe('0');
    });

    it('returns fallback string when formatUnits throws', () => {
        vi.spyOn(ethers.utils, 'formatUnits').mockImplementation(() => {
            throw new Error('format failed');
        });

        expect(safeFormatUnits('1', 18, 'fallback')).toBe('fallback');
    });
});
