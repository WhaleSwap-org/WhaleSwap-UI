import { abi as CONTRACT_ABI } from './abi/OTCSwap.js';

export const APP_BRAND = 'WhaleSwap';
export const APP_LOGO = 'img/whaleSwap.png';

const networkConfig = {
    "56": {
        slug: "bnb",
        name: "BNB Chain",
        displayName: "BNB Chain",
        logo: "img/token-logos/0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c.png",
        isDefault: false,
        contractAddress: "0x324d9b90A07D587B4FA0D68c22645B9c8D321079",
        contractABI: CONTRACT_ABI,
        explorer: "https://bscscan.com",
        rpcUrl: "https://bsc-dataseed.binance.org",
        fallbackRpcUrls: [
            "https://bsc-dataseed1.binance.org",
            "https://bsc-dataseed1.defibit.io",
            "https://rpc.ankr.com/bsc"
        ],
        chainId: "0x38",
        nativeCurrency: {
            name: "BNB",
            symbol: "BNB",
            decimals: 18
        },
        // Multicall3
        multicallAddress: "0xca11bde05977b3631167028862be2a173976ca11",
        wsUrl: "wss://bsc-rpc.publicnode.com",
        fallbackWsUrls: [
            "wss://bsc.publicnode.com"
        ]
    },
    "137": {
        slug: "polygon",
        name: "Polygon",
        displayName: "Polygon Mainnet",
        logo: "img/token-logos/0x0000000000000000000000000000000000001010.png",
        isDefault: true,
        contractAddress: "0x324d9b90A07D587B4FA0D68c22645B9c8D321079",
        contractABI: CONTRACT_ABI,
        explorer: "https://polygonscan.com",
        rpcUrl: "https://polygon-rpc.com",
        fallbackRpcUrls: [
            "https://rpc-mainnet.matic.network",
            "https://polygon-bor.publicnode.com",
            "https://polygon.api.onfinality.io/public"
        ],
        chainId: "0x89",
        nativeCurrency: {
            name: "MATIC",
            symbol: "MATIC",
            decimals: 18
        },
        // Multicall2 contract (Uniswap) deployed on Polygon mainnet
        multicallAddress: "0x275617327c958bD06b5D6b871E7f491D76113dd8",
        wsUrl: "wss://polygon.gateway.tenderly.co",
        fallbackWsUrls: [
            "wss://polygon-bor.publicnode.com",
            "wss://polygon-bor-rpc.publicnode.com",
            "wss://polygon.api.onfinality.io/public-ws"
        ]
    },
};

const normalizeChainId = (chainId) => {
    if (chainId === null || chainId === undefined) {
        return null;
    }

    const chainIdStr = String(chainId).toLowerCase();
    if (/^0x[0-9a-f]+$/.test(chainIdStr)) {
        const decimalValue = parseInt(chainIdStr, 16);
        return Number.isNaN(decimalValue) ? null : String(decimalValue);
    }

    if (/^\d+$/.test(chainIdStr)) {
        return chainIdStr;
    }

    return null;
};


export const DEBUG_CONFIG = {
    APP: false,
    WEBSOCKET: true, // Enable to debug status calculation
    WALLET: false,
    VIEW_ORDERS: true, // Enable to debug status updates
    CREATE_ORDER: false,
    MY_ORDERS: false,
    TAKER_ORDERS: false,
    CLEANUP_ORDERS: false,
    WALLET_UI: false,
    BASE_COMPONENT: false,
    PRICING: false,
    TOKENS: false,
    TOKEN_ICON_SERVICE: false, // Add token icon service debugging
    TOAST: false, // Enable toast debugging for testing
    PRICING_DEFAULT_TO_ONE: false, // Default missing prices to 1 for testing, false for production
    LIBERDUS_VALIDATION: true, // Enable frontend Liberdus token validation
    ADMIN_BYPASS_OWNER_CHECK: false, // Temporary: bypass owner gating for Admin tab access
    // Add more specific flags as needed
};

// Centralized order-related constants
export const ORDER_CONSTANTS = {
    STATUS_MAP: ['Active', 'Filled', 'Canceled'],
    DEFAULT_ORDER_EXPIRY_SECS: 7 * 24 * 60 * 60, // 7 days
    DEFAULT_GRACE_PERIOD_SECS: 7 * 24 * 60 * 60 // 7 days
};

// Token Icon Service Configuration
export const TOKEN_ICON_CONFIG = {
    // CoinGecko API configuration
    COINGECKO_API_BASE: 'https://api.coingecko.com/api/v3',
    COINGECKO_ICON_BASE: 'https://assets.coingecko.com/coins/images',
    
    // CoinGecko chain mapping
    CHAIN_ID_MAP: {
        '1': 'ethereum',
        '137': 'polygon-pos',
        '56': 'binance-smart-chain',
        '42161': 'arbitrum-one',
        '10': 'optimistic-ethereum',
        '43114': 'avalanche',
        '250': 'fantom',
        '25': 'cronos'
    },
    
    // Known token mappings for supported chains
    KNOWN_TOKENS: {
        "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": "usd-coin", // Polygon USDC
        "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6": "wrapped-bitcoin", // Polygon WBTC
        "0x0000000000000000000000000000000000001010": "polygon-ecosystem-token", // Polygon native POL
        "0x3ba4c387f786bfee076a58914f5bd38d668b42c3": "binancecoin", // Polygon BNB (PoS)
        "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39": "chainlink", // Polygon LINK
        "0xb0897686c545045afc77cf20ec7a532e3120e0f1": "chainlink", // Polygon LINK legacy bridge
        "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "usd-coin", // BNB USDC
        "0x0555e30da8f98308edb960aa94c0db47230d2b9c": "wrapped-bitcoin", // BNB WBTC
        "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": "weth", // WETH
        "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": "matic-network", // WMATIC
    },
    
    // Special cases
    SPECIAL_TOKENS: {
        "0x693ed886545970f0a3adf8c59af5ccdb6ddf0a76": "assets/32.png" // Liberdus
    },

    // Local token logo management
    // Runtime icon lookup probes `img/token-logos/{token-address}.{ext}`.
    // Bump LOCAL_ICON_VERSION when replacing existing logo files to invalidate browser cache.
    LOCAL_ICON_VERSION: '2026-02-19',
    
    // Icon validation configuration
    VALIDATION_TIMEOUT: 5000, // 5 seconds timeout for icon validation
    
    // Fallback configuration
    ENABLE_FALLBACK_ICONS: true, // Enable color-based fallback icons
    FALLBACK_COLORS: [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
        '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB'
    ]
};

export const getAllNetworks = () => Object.values(networkConfig);

export const isDebugEnabled = (component) => {
    // Check if debug mode is forced via localStorage
    const localDebug = localStorage.getItem('debug');
    if (localDebug) {
        const debugSettings = JSON.parse(localDebug);
        return debugSettings[component] ?? DEBUG_CONFIG[component];
    }
    return DEBUG_CONFIG[component];
};

export const getDefaultNetwork = () => {
    // Find the first network marked as default
    const defaultNetwork = Object.values(networkConfig).find(net => net.isDefault);
    if (!defaultNetwork) {
        throw new Error('No default network configured');
    }
    return defaultNetwork;
};

let activeNetworkSlug = getDefaultNetwork().slug;

export const getNetworkBySlug = (slug) => {
    if (!slug) return null;
    const normalizedSlug = String(slug).toLowerCase();
    return Object.values(networkConfig).find(net => net.slug === normalizedSlug) || null;
};

export const getNetworkById = (chainId) => {
    const decimalChainId = normalizeChainId(chainId);
    if (!decimalChainId) return null;
    return networkConfig[decimalChainId];
};

export const getActiveNetwork = () => {
    return getNetworkBySlug(activeNetworkSlug) || getDefaultNetwork();
};

export const setActiveNetwork = (networkRef) => {
    let network = null;

    if (networkRef && typeof networkRef === 'object' && networkRef.slug) {
        network = getNetworkBySlug(networkRef.slug);
    } else {
        network = getNetworkBySlug(networkRef) || getNetworkById(networkRef);
    }

    if (!network) {
        throw new Error(`Cannot set active network. Unsupported value: ${networkRef}`);
    }

    activeNetworkSlug = network.slug;
    return network;
};

export const getNetworkConfig = (chainId = null) => {
    if (chainId !== null && chainId !== undefined) {
        const network = getNetworkById(chainId);
        if (!network) {
            throw new Error(`Network configuration not found for chain ID: ${chainId}`);
        }
        return network;
    }
    return getActiveNetwork();
};
