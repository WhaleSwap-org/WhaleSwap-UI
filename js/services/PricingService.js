import { ethers } from 'ethers';
import { ORDER_CONSTANTS, TOKEN_ICON_CONFIG } from '../config/index.js';
import { isDebugEnabled } from '../config/debug.js';
import { getNetworkConfig } from '../config/networks.js';
import { erc20Abi } from '../abi/erc20.js';
import { createLogger } from './LogService.js';
import { contractService } from './ContractService.js';
import { tokenIconService } from './TokenIconService.js';

export class PricingService {
    constructor() {
        this.prices = new Map();
        this.orderCache = new Map();
        this.tokenCache = new Map();
        this.lastUpdate = null;
        this.updating = false;
        this.subscribers = new Set();
        this.rateLimitDelay = 250; // Ensure we stay under 300 requests/minute
        this.networkConfig = getNetworkConfig();

        // Simplified: Track allowed tokens for pre-fetching
        this.allowedTokens = new Set();
        this.allowedTokensLastFetched = null;

        // Performance optimizations
        this.pendingRequests = new Map();
        this.lastPriceFetch = new Map();
        this.priceCacheExpiry = 5 * 60 * 1000;
        this.orderSyncPromise = null;
        this.hasCompletedOrderSync = false;
        this.refreshPromise = null; // Track current refresh promise
        this.initializationPromise = null;
        this.initialPriceLoadPending = false;
        this.hasAttemptedInitialPriceLoad = false;
        this.httpProvider = null;
        this.httpContract = null;
        this.httpRpcUrl = null;
        this.orderExpiry = null;
        this.gracePeriod = null;
        this.httpOrderReadConcurrency = 5;
        this.tokenInfoRequests = new Map();

        const logger = createLogger('PRICING');
        this.debug = logger.debug.bind(logger);
        this.error = logger.error.bind(logger);
        this.warn = logger.warn.bind(logger);
    }

    async initialize(options = {}) {
        const { deferInitialRefresh = false } = options;
        if (deferInitialRefresh) {
            this.debug('Deferring initial pricing refresh until allowed tokens are available');
            return { success: true, message: 'Initial pricing refresh deferred' };
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = (async () => {
            try {
                this.debug('Starting HTTP bootstrap for pricing, orders, and deals');
                this.ensureContractServiceInitialized();
                await this.getAllowedTokens();
                const priceResult = await this.refreshPrices();
                const ordersResult = await this.syncAllOrders();
                await this.updateAllDeals();

                return {
                    success: priceResult?.success !== false && ordersResult !== false,
                    message: 'HTTP bootstrap complete',
                    updatedCount: this.prices.size,
                    ordersCount: this.orderCache.size
                };
            } catch (error) {
                return this.handleFetchError(error, 'initialize');
            } finally {
                this.initializationPromise = null;
            }
        })();

        return this.initializationPromise;
    }

    ensureContractServiceInitialized() {
        contractService.initialize();
    }

    getRpcUrls() {
        this.networkConfig = getNetworkConfig();
        return [...new Set([
            this.httpRpcUrl,
            this.networkConfig?.rpcUrl,
            ...(this.networkConfig?.fallbackRpcUrls || [])
        ].filter(Boolean))];
    }

    clearHttpContext() {
        this.httpProvider = null;
        this.httpContract = null;
        this.httpRpcUrl = null;
        this.orderExpiry = null;
        this.gracePeriod = null;
    }

    async readViaHttp(readFn) {
        this.ensureContractServiceInitialized();

        const rpcUrls = this.getRpcUrls();
        if (rpcUrls.length === 0) {
            throw new Error('No HTTP RPC URL configured for current network');
        }

        let lastError = null;
        for (const url of rpcUrls) {
            try {
                if (!this.httpProvider || !this.httpContract || this.httpRpcUrl !== url) {
                    this.networkConfig = getNetworkConfig();
                    this.httpProvider = new ethers.providers.JsonRpcProvider(url);
                    this.httpContract = new ethers.Contract(
                        this.networkConfig.contractAddress,
                        this.networkConfig.contractABI,
                        this.httpProvider
                    );
                    this.httpRpcUrl = url;
                    this.orderExpiry = null;
                    this.gracePeriod = null;
                }

                return await readFn(this.httpContract, this.httpProvider);
            } catch (error) {
                lastError = error;
                this.warn(`HTTP read failed (${url}):`, error?.message || error);
                if (this.httpRpcUrl === url) {
                    this.clearHttpContext();
                }
            }
        }

        throw lastError || new Error('All HTTP RPC URLs failed');
    }

    async ensureContractConstants() {
        if (this.orderExpiry && this.gracePeriod) {
            return;
        }

        const [orderExpiry, gracePeriod] = await this.readViaHttp(contract => Promise.all([
            contract.ORDER_EXPIRY(),
            contract.GRACE_PERIOD()
        ]));

        this.orderExpiry = orderExpiry;
        this.gracePeriod = gracePeriod;
    }

    subscribe(callback) {
        this.subscribers.add(callback);
    }

    unsubscribe(callback) {
        this.subscribers.delete(callback);
    }

    notifySubscribers(event, data) {
        this.subscribers.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                this.debug('Error in PricingService subscriber:', error);
            }
        });
    }

    async getAllowedTokens() {
        try {
            this.debug('Fetching allowed tokens from contract via HTTP RPC...');
            this.ensureContractServiceInitialized();
            const allowedTokenAddresses = await contractService.getAllowedTokens();

            this.allowedTokens.clear();
            allowedTokenAddresses.forEach(addr => this.allowedTokens.add(String(addr || '').toLowerCase()));
            this.allowedTokensLastFetched = Date.now();

            this.debug(`Fetched ${allowedTokenAddresses.length} allowed tokens:`, allowedTokenAddresses);
            return allowedTokenAddresses;
        } catch (error) {
            this.error('Failed to get allowed tokens:', error);
            throw error;
        }
    }

    async fetchTokenPrices(tokenAddresses) {
        this.debug('Fetching prices for tokens:', tokenAddresses);
        const prices = new Map();

        const validAddresses = this.validateTokenAddresses(tokenAddresses);
        if (validAddresses.length === 0) {
            this.warn('No valid token addresses provided for price fetching');
            return prices;
        }

        await this.fetchTokenPricesFromGeckoTerminal(validAddresses, prices);

        let missingTokens = validAddresses.filter(addr => !prices.has(addr));
        if (missingTokens.length > 0) {
            this.debug(`Falling back to DefiLlama for ${missingTokens.length} unresolved tokens`);
            await this.fetchTokenPricesFromDefiLlama(missingTokens, prices);
        }

        missingTokens = validAddresses.filter(addr => !prices.has(addr));
        if (missingTokens.length > 0) {
            this.debug(`Falling back to DexScreener for ${missingTokens.length} unresolved tokens`);
            await this.fetchTokenPricesFromDexScreener(missingTokens, prices);
        }

        missingTokens = validAddresses.filter(addr => !prices.has(addr));
        if (missingTokens.length > 0) {
            this.debug(`Falling back to CoinGecko ID map for ${missingTokens.length} unresolved tokens`);
            await this.fetchTokenPricesFromCoinGeckoIds(missingTokens, prices);
        }

        return prices;
    }

    getGeckoTerminalNetworkId() {
        const slug = this.networkConfig?.slug;
        const chainId = this.networkConfig?.chainId
            ? parseInt(this.networkConfig.chainId, 16).toString()
            : null;

        const slugMap = {
            ethereum: 'eth',
            bnb: 'bsc',
            polygon: 'polygon_pos'
        };

        const chainIdMap = {
            '1': 'eth',
            '56': 'bsc',
            '137': 'polygon_pos'
        };

        return slugMap[slug] || chainIdMap[chainId] || null;
    }

    async fetchTokenPricesFromGeckoTerminal(tokenAddresses, prices) {
        const geckoNetworkId = this.getGeckoTerminalNetworkId();
        if (!geckoNetworkId) {
            this.warn('GeckoTerminal network mapping unavailable; skipping GeckoTerminal price fetch');
            return;
        }

        const chunks = this.createSmartBatches(tokenAddresses, 30);

        for (const chunk of chunks) {
            try {
                const addresses = chunk.join(',');
                const url = `https://api.geckoterminal.com/api/v2/simple/networks/${geckoNetworkId}/token_price/${addresses}`;
                const response = await fetch(url);

                if (!response.ok) {
                    this.warn('GeckoTerminal chunk request failed', {
                        status: response.status,
                        statusText: response.statusText,
                        chunkSize: chunk.length
                    });
                    continue;
                }

                const data = await response.json();
                const tokenPrices = data?.data?.attributes?.token_prices || {};

                for (const [address, rawPrice] of Object.entries(tokenPrices)) {
                    const normalizedAddress = address.toLowerCase();
                    const price = parseFloat(rawPrice);

                    if (!prices.has(normalizedAddress) && this.validatePrice(price, normalizedAddress)) {
                        prices.set(normalizedAddress, {
                            price,
                            liquidity: 0
                        });
                    }
                }
            } catch (error) {
                this.error('Error fetching GeckoTerminal chunk prices:', error);
            }

            await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }
    }

    async fetchTokenPricesFromDexScreener(tokenAddresses, prices) {
        const chunks = this.createSmartBatches(tokenAddresses, 30);

        for (const chunk of chunks) {
            try {
                const addresses = chunk.join(',');
                const url = `https://api.dexscreener.com/latest/dex/tokens/${addresses}`;
                const response = await fetch(url);
                const data = await response.json();

                if (data.pairs) {
                    this.processTokenPairs(data.pairs, prices);
                }
            } catch (error) {
                this.error('Error fetching DexScreener chunk prices:', error);
            }

            await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }

        const missingTokens = tokenAddresses.filter(addr => !prices.has(addr));
        if (missingTokens.length === 0) {
            return;
        }

        this.debug('Fetching missing token prices individually from DexScreener:', missingTokens);

        for (const addr of missingTokens) {
            try {
                const url = `https://api.dexscreener.com/latest/dex/tokens/${addr}`;
                const response = await fetch(url);
                const data = await response.json();

                if (data.pairs && data.pairs.length > 0) {
                    this.processTokenPairs(data.pairs, prices);
                }
            } catch (error) {
                this.error('Error fetching individual DexScreener token price:', { token: addr, error });
            }

            await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }
    }

    getDefiLlamaChainKey() {
        const slug = this.networkConfig?.slug;
        const chainId = this.networkConfig?.chainId
            ? parseInt(this.networkConfig.chainId, 16).toString()
            : null;

        const slugMap = {
            ethereum: 'ethereum',
            bnb: 'bsc',
            polygon: 'polygon'
        };

        const chainIdMap = {
            '1': 'ethereum',
            '56': 'bsc',
            '137': 'polygon'
        };

        return slugMap[slug] || chainIdMap[chainId] || null;
    }

    async fetchTokenPricesFromDefiLlama(tokenAddresses, prices) {
        const defiLlamaChain = this.getDefiLlamaChainKey();
        if (!defiLlamaChain) {
            this.warn('DefiLlama chain mapping unavailable; skipping DefiLlama price fetch');
            return;
        }

        const chunks = this.createSmartBatches(tokenAddresses, 50);
        for (const chunk of chunks) {
            try {
                const coinKeys = chunk.map(address => `${defiLlamaChain}:${address}`).join(',');
                const url = `https://coins.llama.fi/prices/current/${coinKeys}`;
                const response = await fetch(url);

                if (!response.ok) {
                    this.warn('DefiLlama chunk request failed', {
                        status: response.status,
                        statusText: response.statusText,
                        chunkSize: chunk.length
                    });
                    continue;
                }

                const data = await response.json();
                const coins = data?.coins || {};

                for (const [coinKey, coinData] of Object.entries(coins)) {
                    const [, rawAddress = ''] = coinKey.split(':');
                    const address = rawAddress.toLowerCase();
                    const price = parseFloat(coinData?.price);

                    if (!prices.has(address) && this.validatePrice(price, address)) {
                        prices.set(address, {
                            price,
                            liquidity: 0
                        });
                    }
                }
            } catch (error) {
                this.error('Error fetching DefiLlama chunk prices:', error);
            }

            await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }
    }

    async fetchTokenPricesFromCoinGeckoIds(tokenAddresses, prices) {
        const priceIds = TOKEN_ICON_CONFIG?.COINGECKO_PRICE_IDS || {};
        const mappedAddresses = tokenAddresses.filter(address => priceIds[address]);
        if (mappedAddresses.length === 0) {
            return;
        }

        const uniqueIds = [...new Set(mappedAddresses.map(address => priceIds[address]))];
        const idChunks = this.createSmartBatches(uniqueIds, 100);
        const coinGeckoPrices = new Map();

        for (const idChunk of idChunks) {
            try {
                const idParam = encodeURIComponent(idChunk.join(','));
                const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idParam}&vs_currencies=usd`;
                const response = await fetch(url);
                if (!response.ok) {
                    this.warn('CoinGecko ID chunk request failed', {
                        status: response.status,
                        statusText: response.statusText,
                        chunkSize: idChunk.length
                    });
                    continue;
                }

                const data = await response.json();
                for (const [tokenId, priceData] of Object.entries(data || {})) {
                    const price = parseFloat(priceData?.usd);
                    if (this.validatePrice(price, tokenId)) {
                        coinGeckoPrices.set(tokenId, price);
                    }
                }
            } catch (error) {
                this.error('Error fetching CoinGecko ID chunk prices:', error);
            }

            await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }

        for (const address of mappedAddresses) {
            if (prices.has(address)) {
                continue;
            }

            const tokenId = priceIds[address];
            const mappedPrice = coinGeckoPrices.get(tokenId);
            if (this.validatePrice(mappedPrice, address)) {
                prices.set(address, {
                    price: mappedPrice,
                    liquidity: 0
                });
            }
        }
    }

    async fetchPricesForTokens(tokenAddresses) {
        if (!Array.isArray(tokenAddresses) || tokenAddresses.length === 0) {
            this.debug('No token addresses provided for price fetching');
            return new Map();
        }

        this.debug('Fetching prices for specific tokens:', tokenAddresses);

        const newPrices = await this.deduplicatedPriceFetch(tokenAddresses);

        for (const [address, data] of newPrices.entries()) {
            this.prices.set(address, data.price);
            this.debug(`Updated price for ${address}: ${data.price}`);
        }

        return newPrices;
    }

    processTokenPairs(pairs, prices) {
        const sortedPairs = pairs.sort((a, b) =>
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        );

        for (const pair of sortedPairs) {
            const baseAddr = pair.baseToken.address.toLowerCase();
            const quoteAddr = pair.quoteToken.address.toLowerCase();
            const priceUsd = parseFloat(pair.priceUsd);

            if (!Number.isNaN(priceUsd) && this.validatePrice(priceUsd, baseAddr)) {
                if (!prices.has(baseAddr)) {
                    prices.set(baseAddr, {
                        price: priceUsd,
                        liquidity: pair.liquidity?.usd || 0
                    });
                }

                if (!prices.has(quoteAddr)) {
                    const basePrice = prices.get(baseAddr).price;
                    const priceNative = parseFloat(pair.priceNative);
                    if (!Number.isNaN(priceNative) && priceNative > 0) {
                        const quotePrice = basePrice / priceNative;
                        if (this.validatePrice(quotePrice, quoteAddr)) {
                            prices.set(quoteAddr, {
                                price: quotePrice,
                                liquidity: pair.liquidity?.usd || 0
                            });
                        }
                    }
                }
            }
        }
    }

    async refreshPrices() {
        if (this.updating) {
            return this.refreshPromise;
        }

        const isInitialAttempt = !this.hasAttemptedInitialPriceLoad;
        if (isInitialAttempt) {
            this.initialPriceLoadPending = true;
        }

        this.updating = true;
        this.notifySubscribers('refreshStart');

        this.refreshPromise = (async () => {
            try {
                const tokenAddresses = Array.from(this.allowedTokens);

                if (tokenAddresses.length === 0) {
                    this.warn('No allowed tokens to fetch prices for');
                    this.lastUpdate = Date.now();
                    await this.updateAllDeals();
                    this.notifySubscribers('refreshComplete');
                    return { success: true, message: 'No tokens to update', updatedCount: 0 };
                }

                this.debug('Fetching prices for allowed tokens:', tokenAddresses);
                const prices = await this.fetchTokenPrices(tokenAddresses);

                this.prices.clear();
                for (const [address, data] of prices.entries()) {
                    this.prices.set(address, data.price);
                    this.lastPriceFetch.set(address, Date.now());
                }

                await this.updateAllDeals();

                this.lastUpdate = Date.now();
                this.notifySubscribers('refreshComplete');

                this.debug('Prices updated:', Object.fromEntries(this.prices));
                return {
                    success: true,
                    message: 'Prices updated successfully',
                    updatedCount: this.prices.size
                };
            } catch (error) {
                const errorResult = this.handleFetchError(error, 'refreshPrices');
                this.notifySubscribers('refreshError', errorResult);
                return errorResult;
            } finally {
                if (isInitialAttempt) {
                    this.initialPriceLoadPending = false;
                    this.hasAttemptedInitialPriceLoad = true;
                }
                this.updating = false;
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    getPrice(tokenAddress) {
        const price = this.prices.get(String(tokenAddress || '').toLowerCase());

        if (price === undefined) {
            if (isDebugEnabled('PRICING_DEFAULT_TO_ONE')) {
                return 1;
            }
            return undefined;
        }

        return price;
    }

    isPriceEstimated(tokenAddress) {
        return !this.prices.has(String(tokenAddress || '').toLowerCase());
    }

    isInitialPriceLoadPending() {
        return this.initialPriceLoadPending;
    }

    getLastUpdateTime() {
        return this.lastUpdate ? new Date(this.lastUpdate).toLocaleTimeString() : 'Never';
    }

    isPriceStale(tokenAddress) {
        const lastFetch = this.lastPriceFetch.get(String(tokenAddress || '').toLowerCase());
        return !lastFetch || (Date.now() - lastFetch) > this.priceCacheExpiry;
    }

    async deduplicatedPriceFetch(tokenAddresses) {
        const uniqueAddresses = [...new Set(tokenAddresses.map(addr => addr.toLowerCase()))];
        const addressesToFetch = uniqueAddresses
            .filter(addr => !this.prices.has(addr) || this.isPriceStale(addr))
            .filter(addr => !this.pendingRequests.has(addr));

        if (addressesToFetch.length === 0) {
            this.debug('No new addresses to fetch, using cached prices');
            return new Map();
        }

        addressesToFetch.forEach(addr => this.pendingRequests.set(addr, Date.now()));

        try {
            const newPrices = await this.fetchTokenPrices(addressesToFetch);
            const now = Date.now();
            addressesToFetch.forEach(addr => this.lastPriceFetch.set(addr, now));
            return newPrices;
        } finally {
            addressesToFetch.forEach(addr => this.pendingRequests.delete(addr));
        }
    }

    handleFetchError(error, context) {
        const errorInfo = {
            message: error?.message || String(error),
            context,
            timestamp: new Date().toISOString(),
            stack: error?.stack
        };

        this.error('Price fetching error:', errorInfo);

        return {
            success: false,
            error: errorInfo,
            message: `Failed to fetch prices: ${errorInfo.message}`
        };
    }

    async waitForOrderSync({ triggerIfNeeded = true } = {}) {
        if (this.orderSyncPromise) {
            return this.orderSyncPromise;
        }
        if (this.hasCompletedOrderSync) {
            return true;
        }
        if (this.initializationPromise) {
            const result = await this.initializationPromise;
            return result?.success !== false;
        }
        if (!triggerIfNeeded) {
            return false;
        }
        return this.syncAllOrders();
    }

    normalizeOrderData(orderId, order) {
        return {
            id: Number(orderId),
            maker: order.maker,
            taker: order.taker,
            sellToken: order.sellToken,
            sellAmount: order.sellAmount,
            buyToken: order.buyToken,
            buyAmount: order.buyAmount,
            timestamp: Number(order.timestamp?.toString?.() ?? order.timestamp ?? 0),
            status: ORDER_CONSTANTS.STATUS_MAP[Number(order.status)] || 'Unknown',
            feeToken: order.feeToken,
            orderCreationFee: order.orderCreationFee
        };
    }

    async fetchOrdersBatch(startIndex, endIndex, concurrency = this.httpOrderReadConcurrency) {
        const indices = [];
        for (let i = startIndex; i < endIndex; i++) {
            indices.push(i);
        }

        const results = [];
        let cursor = 0;

        const worker = async () => {
            while (true) {
                const current = cursor++;
                if (current >= indices.length) {
                    break;
                }

                const orderId = indices[current];
                try {
                    const order = await this.readViaHttp(contract => contract.orders(orderId));
                    if (order?.maker === ethers.constants.AddressZero) {
                        continue;
                    }
                    results.push(this.normalizeOrderData(orderId, order));
                } catch (error) {
                    this.debug(`Failed to read order ${orderId} via HTTP`, error);
                }
            }
        };

        const workers = Array.from(
            { length: Math.min(concurrency, Math.max(indices.length, 1)) },
            () => worker()
        );
        await Promise.all(workers);
        results.sort((a, b) => a.id - b.id);
        return results;
    }

    async syncAllOrders() {
        if (this.orderSyncPromise) {
            this.debug('Order sync already in progress; waiting for existing sync');
            return this.orderSyncPromise;
        }

        this.orderSyncPromise = (async () => {
            try {
                await this.ensureContractConstants();

                const nextOrderId = await this.readViaHttp(contract => contract.nextOrderId());
                const totalOrders = Number(nextOrderId?.toString?.() ?? nextOrderId ?? 0);
                const batchSize = 50;
                const totalBatches = totalOrders === 0 ? 1 : Math.ceil(totalOrders / batchSize);
                let processedOrders = 0;

                this.orderCache.clear();

                for (let batch = 0; batch < totalBatches; batch++) {
                    const startIndex = batch * batchSize;
                    const endIndex = Math.min(startIndex + batchSize, totalOrders);
                    const batchOrders = totalOrders === 0
                        ? []
                        : await this.fetchOrdersBatch(startIndex, endIndex, this.httpOrderReadConcurrency);

                    for (const order of batchOrders) {
                        this.orderCache.set(order.id, {
                            ...order,
                            timings: this.buildOrderTimings(order.timestamp)
                        });
                    }

                    processedOrders = endIndex;
                    this.notifySubscribers('orderSyncProgress', {
                        fetched: processedOrders,
                        total: totalOrders,
                        batch: batch + 1,
                        totalBatches
                    });
                }

                this.hasCompletedOrderSync = true;
                this.notifySubscribers('orderSyncComplete', Object.fromEntries(this.orderCache));
                this.notifySubscribers('ordersUpdated', this.getOrders());
                return true;
            } catch (error) {
                this.debug('Order sync failed:', error);
                this.orderCache.clear();
                this.hasCompletedOrderSync = false;
                this.notifySubscribers('orderSyncComplete', {});
                this.notifySubscribers('ordersUpdated', []);
                return false;
            } finally {
                this.orderSyncPromise = null;
            }
        })();

        return this.orderSyncPromise;
    }

    getOrders(filterStatus = null) {
        const orders = Array.from(this.orderCache.values());
        if (!filterStatus) {
            return orders;
        }
        return orders.filter(order => order.status === filterStatus);
    }

    async upsertOrder(orderData, { computeDeal = true } = {}) {
        const normalizedOrder = {
            ...orderData,
            id: Number(orderData.id),
            timestamp: Number(orderData.timestamp),
            timings: orderData.timings || this.buildOrderTimings(orderData.timestamp)
        };

        let finalOrder = normalizedOrder;
        if (computeDeal) {
            try {
                finalOrder = await this.calculateDealMetrics(normalizedOrder);
            } catch (error) {
                this.debug('Failed to calculate deal metrics during upsert:', error);
            }
        }

        this.orderCache.set(finalOrder.id, finalOrder);
        this.notifySubscribers('ordersUpdated', this.getOrders());
        return finalOrder;
    }

    updateOrderStatus(orderId, status) {
        const normalizedOrderId = Number(orderId);
        const order = this.orderCache.get(normalizedOrderId);
        if (!order) {
            return null;
        }

        const updatedOrder = {
            ...order,
            status
        };

        this.orderCache.set(normalizedOrderId, updatedOrder);
        this.notifySubscribers('ordersUpdated', this.getOrders());
        return updatedOrder;
    }

    removeOrder(orderId) {
        const normalizedOrderId = Number(orderId);
        const didDelete = this.orderCache.delete(normalizedOrderId);
        if (didDelete) {
            this.notifySubscribers('ordersUpdated', this.getOrders());
        }
        return didDelete;
    }

    removeOrders(orderIds) {
        if (!Array.isArray(orderIds)) {
            this.warn('removeOrders called with non-array:', orderIds);
            return false;
        }

        let removedAny = false;
        for (const orderId of orderIds) {
            removedAny = this.orderCache.delete(Number(orderId)) || removedAny;
        }

        if (removedAny) {
            this.notifySubscribers('ordersUpdated', this.getOrders());
        }

        return removedAny;
    }

    async getTokenInfo(tokenAddress) {
        const normalizedAddress = String(tokenAddress || '').toLowerCase();
        if (!normalizedAddress) {
            return null;
        }

        if (this.tokenCache.has(normalizedAddress)) {
            return this.tokenCache.get(normalizedAddress);
        }

        if (this.tokenInfoRequests.has(normalizedAddress)) {
            return this.tokenInfoRequests.get(normalizedAddress);
        }

        const request = (async () => {
            try {
                const tokenInfo = await this.readViaHttp(async (_, provider) => {
                    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
                    const [symbolResult, decimalsResult, nameResult] = await Promise.allSettled([
                        contract.symbol(),
                        contract.decimals(),
                        contract.name()
                    ]);

                    const fallbackSymbol = `${normalizedAddress.slice(0, 4)}...${normalizedAddress.slice(-4)}`;
                    const decimalsValue = decimalsResult.status === 'fulfilled'
                        ? Number(decimalsResult.value?.toString?.() ?? decimalsResult.value)
                        : 18;

                    let iconUrl = null;
                    try {
                        const chainId = Number.parseInt(getNetworkConfig().chainId, 16) || 137;
                        iconUrl = await tokenIconService.getIconUrl(tokenAddress, chainId);
                    } catch (error) {
                        this.debug(`Failed to get icon for token ${tokenAddress}:`, error);
                    }

                    return {
                        address: normalizedAddress,
                        symbol: symbolResult.status === 'fulfilled' ? symbolResult.value : fallbackSymbol,
                        decimals: Number.isFinite(decimalsValue) ? decimalsValue : 18,
                        name: nameResult.status === 'fulfilled' ? nameResult.value : 'Unknown Token',
                        iconUrl
                    };
                });

                this.tokenCache.set(normalizedAddress, tokenInfo);
                return tokenInfo;
            } catch (error) {
                this.debug('Error getting token info:', error);
                return {
                    address: normalizedAddress,
                    symbol: `${normalizedAddress.slice(0, 4)}...${normalizedAddress.slice(-4)}`,
                    decimals: 18,
                    name: 'Unknown Token'
                };
            } finally {
                this.tokenInfoRequests.delete(normalizedAddress);
            }
        })();

        this.tokenInfoRequests.set(normalizedAddress, request);
        return request;
    }

    async calculateDealMetrics(orderData) {
        const buyTokenInfo = await this.getTokenInfo(orderData.buyToken);
        const sellTokenInfo = await this.getTokenInfo(orderData.sellToken);

        const buyTokenDecimals = Number.isInteger(buyTokenInfo?.decimals) ? buyTokenInfo.decimals : 18;
        const sellTokenDecimals = Number.isInteger(sellTokenInfo?.decimals) ? sellTokenInfo.decimals : 18;

        const formattedBuyAmount = ethers.utils.formatUnits(orderData.buyAmount || 0, buyTokenDecimals);
        const formattedSellAmount = ethers.utils.formatUnits(orderData.sellAmount || 0, sellTokenDecimals);

        const buyAmount = Number(formattedBuyAmount);
        const sellAmount = Number(formattedSellAmount);

        if (!Number.isFinite(buyAmount) || !Number.isFinite(sellAmount) || sellAmount <= 0) {
            return {
                ...orderData,
                dealMetrics: {
                    ...orderData.dealMetrics,
                    formattedBuyAmount,
                    formattedSellAmount
                }
            };
        }

        const buyTokenUsdPrice = this.getPrice(orderData.buyToken);
        const sellTokenUsdPrice = this.getPrice(orderData.sellToken);
        if (
            buyTokenUsdPrice === undefined ||
            sellTokenUsdPrice === undefined ||
            buyTokenUsdPrice <= 0 ||
            sellTokenUsdPrice <= 0
        ) {
            return {
                ...orderData,
                dealMetrics: {
                    ...orderData.dealMetrics,
                    formattedBuyAmount,
                    formattedSellAmount,
                    buyTokenUsdPrice,
                    sellTokenUsdPrice
                }
            };
        }

        const buyValue = buyAmount * buyTokenUsdPrice;
        const sellValue = sellAmount * sellTokenUsdPrice;

        if (!Number.isFinite(buyValue) || !Number.isFinite(sellValue) || sellValue <= 0) {
            return {
                ...orderData,
                dealMetrics: {
                    ...orderData.dealMetrics,
                    formattedBuyAmount,
                    formattedSellAmount,
                    buyTokenUsdPrice,
                    sellTokenUsdPrice
                }
            };
        }

        const deal = buyValue / sellValue;

        return {
            ...orderData,
            dealMetrics: {
                ...orderData.dealMetrics,
                formattedBuyAmount,
                formattedSellAmount,
                buyTokenUsdPrice,
                sellTokenUsdPrice,
                buyValue,
                sellValue,
                deal
            }
        };
    }

    async updateAllDeals() {
        if (this.orderCache.size === 0) {
            return;
        }

        this.debug('Updating deal metrics for all orders...');
        for (const [orderId, order] of this.orderCache.entries()) {
            try {
                const updatedOrder = await this.calculateDealMetrics(order);
                this.orderCache.set(orderId, updatedOrder);
            } catch (error) {
                this.debug('Error updating deal metrics for order:', orderId, error);
            }
        }

        this.notifySubscribers('ordersUpdated', this.getOrders());
    }

    buildOrderTimings(createdAtInput) {
        const createdAt = Number(createdAtInput);
        if (!Number.isFinite(createdAt)) {
            return {
                createdAt: null,
                expiresAt: null,
                graceEndsAt: null
            };
        }

        const orderExpirySecs = this.orderExpiry
            ? Number(this.orderExpiry.toString())
            : ORDER_CONSTANTS.DEFAULT_ORDER_EXPIRY_SECS;
        const gracePeriodSecs = this.gracePeriod
            ? Number(this.gracePeriod.toString())
            : ORDER_CONSTANTS.DEFAULT_GRACE_PERIOD_SECS;

        return {
            createdAt,
            expiresAt: createdAt + orderExpirySecs,
            graceEndsAt: createdAt + orderExpirySecs + gracePeriodSecs
        };
    }

    validateTokenAddresses(tokenAddresses) {
        if (!Array.isArray(tokenAddresses)) {
            throw new Error('Token addresses must be an array');
        }

        const validAddresses = [];
        const invalidAddresses = [];

        for (const addr of tokenAddresses) {
            if (typeof addr === 'string' && addr.length === 42 && addr.startsWith('0x')) {
                validAddresses.push(addr.toLowerCase());
            } else {
                invalidAddresses.push(addr);
            }
        }

        if (invalidAddresses.length > 0) {
            this.warn('Invalid token addresses found:', invalidAddresses);
        }

        return validAddresses;
    }

    validatePrice(price, tokenAddress) {
        if (typeof price !== 'number' || Number.isNaN(price)) {
            this.warn(`Invalid price for token ${tokenAddress}: ${price}`);
            return false;
        }

        if (price <= 0) {
            this.warn(`Non-positive price for token ${tokenAddress}: ${price}`);
            return false;
        }

        if (price > 1000000) {
            this.warn(`Suspiciously high price for token ${tokenAddress}: ${price}`);
            return false;
        }

        return true;
    }

    createSmartBatches(tokenAddresses, maxBatchSize = 30) {
        const batches = [];
        const currentBatch = [];

        for (const addr of tokenAddresses) {
            currentBatch.push(addr);

            if (currentBatch.length >= maxBatchSize) {
                batches.push([...currentBatch]);
                currentBatch.length = 0;
            }
        }

        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        this.debug(`Created ${batches.length} batches for ${tokenAddresses.length} tokens`);
        return batches;
    }
}
