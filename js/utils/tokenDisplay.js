import { getNetworkConfig } from '../config/networks.js';

const UNKNOWN_SYMBOL = 'UNKNOWN';

// Chain-specific preferred suffixes for known symbol collisions.
const PREFERRED_SYMBOL_SUFFIXES = {
    137: {
        // Polygon PoS LINK
        '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39': 'pol'
    }
};

function normalizeAddress(address) {
    return typeof address === 'string' ? address.toLowerCase() : '';
}

function parseChainId(chainId) {
    if (typeof chainId === 'number' && Number.isFinite(chainId) && chainId > 0) {
        return Math.trunc(chainId);
    }

    if (typeof chainId === 'string') {
        const trimmed = chainId.trim();
        if (!trimmed) return null;
        const parsed = trimmed.toLowerCase().startsWith('0x')
            ? Number.parseInt(trimmed, 16)
            : Number.parseInt(trimmed, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return null;
}

function getTokenSymbol(token) {
    const symbol = token?.symbol;
    if (typeof symbol !== 'string') {
        return UNKNOWN_SYMBOL;
    }

    const trimmed = symbol.trim();
    return trimmed || UNKNOWN_SYMBOL;
}

function getPreferredSuffix(chainId, tokenAddress) {
    const chainConfig = PREFERRED_SYMBOL_SUFFIXES[chainId];
    if (!chainConfig) return null;
    return chainConfig[normalizeAddress(tokenAddress)] || null;
}

export function resolveDisplayChainId(chainIdCandidate = null) {
    const parsedInput = parseChainId(chainIdCandidate);
    if (parsedInput) return parsedInput;

    const fallback = getNetworkConfig()?.chainId;
    const parsedFallback = parseChainId(fallback);
    if (parsedFallback) return parsedFallback;

    return 137;
}

export function buildTokenDisplaySymbolMap(tokens = [], chainIdCandidate = null) {
    const chainId = resolveDisplayChainId(chainIdCandidate);
    const symbolBuckets = new Map();
    const displaySymbolMap = new Map();

    const tokenList = Array.isArray(tokens) ? tokens : [];
    tokenList.forEach((token) => {
        const address = normalizeAddress(token?.address);
        if (!address) return;

        const symbol = getTokenSymbol(token);
        const symbolKey = symbol.toUpperCase();
        if (!symbolBuckets.has(symbolKey)) {
            symbolBuckets.set(symbolKey, []);
        }
        symbolBuckets.get(symbolKey).push({
            address,
            symbol
        });
    });

    for (const entries of symbolBuckets.values()) {
        if (entries.length === 1) {
            const entry = entries[0];
            displaySymbolMap.set(entry.address, entry.symbol);
            continue;
        }

        entries.forEach((entry) => {
            const preferredSuffix = getPreferredSuffix(chainId, entry.address);
            const displaySymbol = preferredSuffix
                ? `${entry.symbol}.${preferredSuffix}`
                : entry.symbol;
            displaySymbolMap.set(entry.address, displaySymbol);
        });
    }

    return displaySymbolMap;
}

export function getDisplaySymbol(token, displaySymbolMap = null) {
    const address = normalizeAddress(token?.address);
    if (address && displaySymbolMap instanceof Map && displaySymbolMap.has(address)) {
        return displaySymbolMap.get(address);
    }

    if (typeof token?.displaySymbol === 'string' && token.displaySymbol.trim()) {
        return token.displaySymbol.trim();
    }

    return getTokenSymbol(token);
}
