import { describe, expect, it } from 'vitest';
import {
    buildTokenDisplaySymbolMap,
    getDisplaySymbol,
    resolveDisplayChainId
} from '../js/utils/tokenDisplay.js';

describe('tokenDisplay utilities', () => {
    it('parses numeric and hex chain IDs', () => {
        expect(resolveDisplayChainId(137)).toBe(137);
        expect(resolveDisplayChainId('137')).toBe(137);
        expect(resolveDisplayChainId('0x89')).toBe(137);
    });

    it('keeps unique symbols unchanged', () => {
        const tokens = [
            { address: '0x1111111111111111111111111111111111111111', symbol: 'USDC' },
            { address: '0x2222222222222222222222222222222222222222', symbol: 'WETH' }
        ];

        const map = buildTokenDisplaySymbolMap(tokens, 137);
        expect(map.get(tokens[0].address.toLowerCase())).toBe('USDC');
        expect(map.get(tokens[1].address.toLowerCase())).toBe('WETH');
    });

    it('applies issuer postfix only for mapped collisions', () => {
        const polygonPosLink = '0x53E0bca35eC356BD5ddDFebBD1Fc0fD03FaBad39';
        const otherLink = '0x1111111111111111111111111111111111111111';
        const tokens = [
            { address: polygonPosLink, symbol: 'LINK' },
            { address: otherLink, symbol: 'LINK' }
        ];

        const map = buildTokenDisplaySymbolMap(tokens, '0x89');
        expect(map.get(polygonPosLink.toLowerCase())).toBe('LINK.pol');
        expect(map.get(otherLink.toLowerCase())).toBe('LINK');
    });

    it('does not append address suffix for unmapped collisions', () => {
        const tokenA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const tokenB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
        const tokens = [
            { address: tokenA, symbol: 'ABC' },
            { address: tokenB, symbol: 'ABC' }
        ];

        const map = buildTokenDisplaySymbolMap(tokens, 137);
        expect(map.get(tokenA)).toBe('ABC');
        expect(map.get(tokenB)).toBe('ABC');
    });

    it('prefers map value, then token displaySymbol, then symbol', () => {
        const map = new Map([
            ['0xabc0000000000000000000000000000000000000', 'ABC.pol']
        ]);

        expect(
            getDisplaySymbol(
                { address: '0xAbC0000000000000000000000000000000000000', symbol: 'ABC' },
                map
            )
        ).toBe('ABC.pol');
        expect(getDisplaySymbol({ symbol: 'ABC', displaySymbol: 'ABC.issuer' }, null)).toBe('ABC.issuer');
        expect(getDisplaySymbol({ symbol: 'ABC' }, null)).toBe('ABC');
    });
});
