const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const TOKEN_DISPLAY_PATH = path.join(__dirname, '..', 'js', 'utils', 'tokenDisplay.js');

async function loadTokenDisplayModule() {
    const source = fs.readFileSync(TOKEN_DISPLAY_PATH, 'utf8');
    const patchedSource = source.replace(
        "import { getNetworkConfig } from '../config/networks.js';",
        "const getNetworkConfig = () => ({ chainId: '0x89' });"
    );
    const dataUrl = `data:text/javascript;base64,${Buffer.from(patchedSource).toString('base64')}`;
    return import(dataUrl);
}

let tokenDisplayModule;

test.before(async () => {
    tokenDisplayModule = await loadTokenDisplayModule();
});

test('resolveDisplayChainId parses numeric and hex inputs', () => {
    const { resolveDisplayChainId } = tokenDisplayModule;
    assert.equal(resolveDisplayChainId(137), 137);
    assert.equal(resolveDisplayChainId('137'), 137);
    assert.equal(resolveDisplayChainId('0x89'), 137);
});

test('buildTokenDisplaySymbolMap keeps unique symbols unchanged', () => {
    const { buildTokenDisplaySymbolMap } = tokenDisplayModule;
    const tokens = [
        { address: '0x1111111111111111111111111111111111111111', symbol: 'USDC' },
        { address: '0x2222222222222222222222222222222222222222', symbol: 'WETH' }
    ];

    const map = buildTokenDisplaySymbolMap(tokens, 137);
    assert.equal(map.get(tokens[0].address.toLowerCase()), 'USDC');
    assert.equal(map.get(tokens[1].address.toLowerCase()), 'WETH');
});

test('buildTokenDisplaySymbolMap adds issuer postfix only for mapped collisions', () => {
    const { buildTokenDisplaySymbolMap } = tokenDisplayModule;
    const polygonPosLink = '0x53E0bca35eC356BD5ddDFebBD1Fc0fD03FaBad39';
    const otherLink = '0x1111111111111111111111111111111111111111';
    const tokens = [
        { address: polygonPosLink, symbol: 'LINK' },
        { address: otherLink, symbol: 'LINK' }
    ];

    const map = buildTokenDisplaySymbolMap(tokens, '0x89');
    assert.equal(map.get(polygonPosLink.toLowerCase()), 'LINK.pol');
    assert.equal(map.get(otherLink.toLowerCase()), 'LINK');
});

test('buildTokenDisplaySymbolMap does not append address suffix for unmapped collisions', () => {
    const { buildTokenDisplaySymbolMap } = tokenDisplayModule;
    const tokenA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const tokenB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const tokens = [
        { address: tokenA, symbol: 'ABC' },
        { address: tokenB, symbol: 'ABC' }
    ];

    const map = buildTokenDisplaySymbolMap(tokens, 137);
    assert.equal(map.get(tokenA), 'ABC');
    assert.equal(map.get(tokenB), 'ABC');
});

test('getDisplaySymbol prefers map value, then token displaySymbol, then symbol', () => {
    const { getDisplaySymbol } = tokenDisplayModule;
    const map = new Map([
        ['0xabc0000000000000000000000000000000000000', 'ABC.pol']
    ]);

    assert.equal(
        getDisplaySymbol({ address: '0xAbC0000000000000000000000000000000000000', symbol: 'ABC' }, map),
        'ABC.pol'
    );
    assert.equal(
        getDisplaySymbol({ symbol: 'ABC', displaySymbol: 'ABC.issuer' }, null),
        'ABC.issuer'
    );
    assert.equal(getDisplaySymbol({ symbol: 'ABC' }, null), 'ABC');
});
