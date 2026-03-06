import { ethers } from 'ethers';
import { ORDER_CONSTANTS } from '../config/index.js';
import { getNetworkConfig } from '../config/networks.js';
import { createLogger } from './LogService.js';

export class WebSocketService {
    constructor(options = {}) {
        this.provider = null;
        this.subscribers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.reconnectPromise = null;
        this.reconnectTimer = null;
        this.isInitialized = false;
        this.contractAddress = null;
        this.contractABI = null;
        this.contract = null;
        
        // Injected dependencies (preferred over window globals)
        this.pricingService = options.pricingService || null;
        
        // Add rate limiting properties
        this.requestQueue = [];
        this.processingQueue = false;
        this.lastRequestTime = 0;
        this.minRequestInterval = 100; // Increase from 100ms to 500ms between requests
        this.maxConcurrentRequests = 2; // Reduce from 3 to 1 concurrent request
        this.activeRequests = 0;
        
        // Add contract constants
        this.orderExpiry = null;
        this.gracePeriod = null;

        // Periodic websocket health checks catch stale-open sockets that never emit close.
        this.healthCheckIntervalMs = 15000;
        this.healthCheckTimeoutMs = 5000;
        this.connectTimeoutMs = 10000;
        this.healthCheckTimer = null;
        this.healthCheckPromise = null;
        
        // Chain-time cache (authoritative source for expiry/grace checks)
        this.lastKnownChainTimestamp = null;
        this.chainTimeSyncedAtMonotonicMs = null;
        this.chainTimeSyncPromise = null;
        this.chainTimeMaxAgeMs = 120000;
        this.chainTimeRetryCooldownMs = 10000;
        this.lastChainTimeBootstrapFailureAtMonotonicMs = null;

        // Contract disabled-state cache
        this.contractDisabledCache = null;
        this.contractDisabledFetchedAt = 0;
        this.contractDisabledInFlight = null;
        this.contractDisabledInFlightRequestId = 0;
        this.contractDisabledRequestSeq = 0;
        this.contractDisabledReadError = false;
        

        const logger = createLogger('WEBSOCKET');
        this.debug = logger.debug.bind(logger);
        this.error = logger.error.bind(logger);
        this.warn = logger.warn.bind(logger);
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    queueReconnect(reason = 'socket-close', delayMs = 5000) {
        if (this.reconnectPromise || this.reconnectTimer) {
            return;
        }

        this.debug(`Scheduling reconnect in ${delayMs}ms due to ${reason}`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnect(reason).catch((error) => {
                this.debug('Scheduled reconnect failed:', error);
            });
        }, delayMs);
    }

    isSocketOpen() {
        return this.provider?._websocket?.readyState === 1;
    }

    async socketIsWorking(timeoutMs = this.healthCheckTimeoutMs) {
        if (!this.provider || !this.isSocketOpen()) {
            return false;
        }

        try {
            const blockNumber = await this.withTimeout(
                this.provider.getBlockNumber(),
                timeoutMs,
                'WebSocket health check timeout'
            );
            return Number.isFinite(Number(blockNumber));
        } catch (_) {
            return false;
        }
    }

    startHealthMonitor() {
        if (this.healthCheckTimer) {
            return;
        }

        this.healthCheckTimer = setInterval(() => {
            void this.monitorConnectionHealth().catch((error) => {
                this.debug('WebSocket health monitor failed:', error);
            });
        }, this.healthCheckIntervalMs);
    }

    stopHealthMonitor() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    async monitorConnectionHealth() {
        if (this.healthCheckPromise) {
            return await this.healthCheckPromise;
        }

        this.healthCheckPromise = (async () => {
            if (!this.isInitialized || !this.provider || !this.contract) {
                return true;
            }

            if (this.initializationPromise || this.reconnectPromise) {
                return true;
            }

            const isWorking = await this.socketIsWorking();
            if (isWorking) {
                return true;
            }

            this.warn('WebSocket health check failed; reconnecting');
            return await this.reconnect('health-check');
        })().finally(() => {
            this.healthCheckPromise = null;
        });

        return await this.healthCheckPromise;
    }

    async handleInitializationFailure(error, allowReconnect) {
        this.error('Initialization failed:', {
            message: error.message,
            stack: error.stack
        });

        if (!allowReconnect) {
            return false;
        }

        return this.reconnect('initialize-failed');
    }

    resetContractDisabledStateCache() {
        this.contractDisabledCache = null;
        this.contractDisabledFetchedAt = 0;
        this.contractDisabledInFlight = null;
        this.contractDisabledInFlightRequestId = 0;
        this.contractDisabledReadError = false;
    }

    markContractDisabledStateReadError() {
        this.contractDisabledReadError = true;
        this.contractDisabledCache = null;
        this.contractDisabledFetchedAt = 0;
    }

    hasContractEvent(contract, eventName) {
        if (!contract?.interface?.getEvent) {
            return false;
        }
        try {
            contract.interface.getEvent(eventName);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Monotonic clock helper for elapsed-time calculations.
     * Uses `performance.now()` when available and falls back to `Date.now()`.
     * @returns {number} Milliseconds since an arbitrary monotonic origin.
     */
    getMonotonicNowMs() {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    /**
     * Check whether chain time has been initialized.
     * @returns {boolean} True when chain timestamp and sync time are both present.
     */
    hasChainTime() {
        return Number.isFinite(this.lastKnownChainTimestamp) &&
            Number.isFinite(this.chainTimeSyncedAtMonotonicMs);
    }

    /**
     * Age of the cached chain timestamp.
     * @returns {number} Milliseconds since last successful bootstrap, or `Infinity` if unavailable.
     */
    getChainTimeAgeMs() {
        if (!this.hasChainTime()) {
            return Infinity;
        }
        return Math.max(0, this.getMonotonicNowMs() - this.chainTimeSyncedAtMonotonicMs);
    }

    /**
     * Bootstrap the chain-time cache from the latest block timestamp.
     * @returns {Promise<number|null>} Synced chain timestamp in seconds, or `null` on failure.
     */
    async bootstrapChainTime() {
        if (!this.provider) {
            return null;
        }

        if (this.chainTimeSyncPromise) {
            return this.chainTimeSyncPromise;
        }

        this.chainTimeSyncPromise = (async () => {
            try {
                const block = await this.provider.getBlock('latest');
                const blockTimestamp = Number(block?.timestamp);

                if (!Number.isFinite(blockTimestamp)) {
                    this.lastChainTimeBootstrapFailureAtMonotonicMs = this.getMonotonicNowMs();
                    return null;
                }

                this.lastKnownChainTimestamp = blockTimestamp;
                this.chainTimeSyncedAtMonotonicMs = this.getMonotonicNowMs();
                this.lastChainTimeBootstrapFailureAtMonotonicMs = null;

                return this.lastKnownChainTimestamp;
            } catch (error) {
                this.lastChainTimeBootstrapFailureAtMonotonicMs = this.getMonotonicNowMs();
                this.debug('Failed to bootstrap chain time:', error);
                return null;
            } finally {
                this.chainTimeSyncPromise = null;
            }
        })();

        return this.chainTimeSyncPromise;
    }

    /**
     * Get best-known current chain timestamp by extrapolating from last synced block time.
     * @returns {number|null} Current chain time in seconds, or `null` if unknown.
     */
    getCurrentTimestamp() {
        if (this.hasChainTime()) {
            const elapsedSecs = Math.floor(
                (this.getMonotonicNowMs() - this.chainTimeSyncedAtMonotonicMs) / 1000
            );
            return this.lastKnownChainTimestamp + Math.max(0, elapsedSecs);
        }

        return null;
    }

    /**
     * Ensure chain time is initialized before relying on local monotonic extrapolation.
     * @returns {Promise<number|null>} Current chain timestamp in seconds, or `null` if sync failed.
     */
    async ensureChainTimeInitialized() {
        const hasCachedChainTime = this.hasChainTime();
        const needsBootstrap = !hasCachedChainTime ||
            this.getChainTimeAgeMs() > this.chainTimeMaxAgeMs;

        if (needsBootstrap) {
            const lastFailureAt = this.lastChainTimeBootstrapFailureAtMonotonicMs;
            if (lastFailureAt !== null) {
                const msSinceLastFailure = this.getMonotonicNowMs() - lastFailureAt;
                if (hasCachedChainTime && msSinceLastFailure < this.chainTimeRetryCooldownMs) {
                    return this.getCurrentTimestamp();
                }
            }
            await this.bootstrapChainTime();
        }

        return this.getCurrentTimestamp();
    }

    /**
     * Compare a timestamp against best-known current chain time.
     * @param {number|string|null|undefined} targetTimestamp - Target unix timestamp (seconds).
     * @returns {boolean} True when current time is greater than target.
     * Falls back to local wall-clock time if chain time is temporarily unavailable.
     */
    isPastTimestamp(targetTimestamp) {
        const timestamp = Number(targetTimestamp);
        if (!Number.isFinite(timestamp)) {
            return false;
        }

        const chainTime = this.getCurrentTimestamp();
        if (Number.isFinite(chainTime)) {
            return chainTime > timestamp;
        }

        return Math.floor(Date.now() / 1000) > timestamp;
    }

    /**
     * Build derived timing fields for an order using configured expiry and grace constants.
     * @param {number|string|null|undefined} createdAtInput - Order creation unix timestamp (seconds).
     * @returns {{createdAt:number|null, expiresAt:number|null, graceEndsAt:number|null}} Derived timings.
     */
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
            ? this.orderExpiry.toNumber()
            : ORDER_CONSTANTS.DEFAULT_ORDER_EXPIRY_SECS;
        const gracePeriodSecs = this.gracePeriod
            ? this.gracePeriod.toNumber()
            : ORDER_CONSTANTS.DEFAULT_GRACE_PERIOD_SECS;

        return {
            createdAt,
            expiresAt: createdAt + orderExpirySecs,
            graceEndsAt: createdAt + orderExpirySecs + gracePeriodSecs
        };
    }

    /**
     * Resolve order grace-end timestamp from cached timings or base order timestamp.
     * @param {Object} order - Order-like object from cache.
     * @returns {number|null} Grace-end unix timestamp (seconds), or `null` when unavailable.
     */
    getOrderGraceEndTime(order) {
        const graceEndsAt = Number(order?.timings?.graceEndsAt);
        if (Number.isFinite(graceEndsAt)) {
            return graceEndsAt;
        }

        if (Number.isFinite(Number(order?.timestamp))) {
            return this.buildOrderTimings(order.timestamp).graceEndsAt;
        }

        return null;
    }

    async queueRequest(callback) {
        while (this.activeRequests >= this.maxConcurrentRequests) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Increase wait time
        }
        
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(resolve => 
                setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
            );
        }
        
        try {
            this.activeRequests++;
            this.debug(`Making request (active: ${this.activeRequests})`);
            const result = await callback();
            this.lastRequestTime = Date.now();
            return result;
        } catch (error) {
            if (error?.error?.code === -32005) {
                this.warn('Rate limit hit, waiting before retry...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.queueRequest(callback);
            }
            this.error('Request failed:', error);
            throw error;
        } finally {
            this.activeRequests--;
        }
    }

    withTimeout(promise, timeoutMs, message) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(message));
            }, timeoutMs);

            promise.then(
                (result) => {
                    clearTimeout(timeoutId);
                    resolve(result);
                },
                (error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            );
        });
    }

    async getContractDisabledState({ maxAgeMs = 10000, timeoutMs = 4000, force = false } = {}) {
        const now = Date.now();
        if (
            !force &&
            !this.contractDisabledReadError &&
            this.contractDisabledCache !== null &&
            (now - this.contractDisabledFetchedAt) < maxAgeMs
        ) {
            return this.contractDisabledCache;
        }

        if (!this.contractDisabledInFlight) {
            const requestId = ++this.contractDisabledRequestSeq;
            this.contractDisabledInFlightRequestId = requestId;
            const requestPromise = this.queueRequest(async () => {
                if (!this.contract) {
                    throw new Error('Contract not initialized');
                }

                // Timeout must apply to the queued RPC itself so queue slots are released.
                const isDisabled = await this.withTimeout(
                    Promise.resolve(this.contract.isDisabled()),
                    timeoutMs,
                    'isDisabled timeout'
                );
                return Boolean(isDisabled);
            })
                .then((isDisabled) => {
                    // Ignore stale completions from older requests.
                    if (this.contractDisabledInFlightRequestId !== requestId) {
                        return isDisabled;
                    }
                    this.contractDisabledCache = isDisabled;
                    this.contractDisabledFetchedAt = Date.now();
                    this.contractDisabledReadError = false;
                    return isDisabled;
                })
                .catch((error) => {
                    // Ignore stale completions from older requests.
                    if (this.contractDisabledInFlightRequestId === requestId) {
                        this.markContractDisabledStateReadError();
                    }
                    throw error;
                });

            this.contractDisabledInFlight = requestPromise.finally(() => {
                if (this.contractDisabledInFlightRequestId === requestId) {
                    this.contractDisabledInFlight = null;
                    this.contractDisabledInFlightRequestId = 0;
                }
            });
        }

        const inFlightPromise = this.contractDisabledInFlight;
        return await inFlightPromise;
    }

    async initialize(allowReconnect = true) {
        if (this.isInitialized) {
            this.debug('Already initialized, skipping...');
            return true;
        }

        if (this.initializationPromise) {
            try {
                return await this.initializationPromise;
            } catch (error) {
                return await this.handleInitializationFailure(error, allowReconnect);
            }
        }

        let initializationPromise = null;

        try {
            this.debug('Starting initialization...');
            this.clearReconnectTimer();
            initializationPromise = (async () => {
                // Wait for provider connection
                const config = getNetworkConfig();
                
                const wsUrls = [config.wsUrl, ...config.fallbackWsUrls];
                let connected = false;
                
                for (const url of wsUrls) {
                    try {
                        this.debug('Attempting to connect to WebSocket URL:', url);
                        this.provider = new ethers.providers.WebSocketProvider(url);
                        
                        // Wait for provider to be ready
                        await this.withTimeout(
                            this.provider.ready,
                            this.connectTimeoutMs,
                            `WebSocket connect timeout for ${url}`
                        );
                        this.debug('Connected to WebSocket:', url);
                        connected = true;
                        break;
                    } catch (error) {
                        this.debug('Failed to connect to WebSocket URL:', url, error);
                        try {
                            if (this.provider?._websocket) {
                                this.provider._websocket.onopen = null;
                                this.provider._websocket.onerror = null;
                                this.provider._websocket.onclose = null;
                                this.provider._websocket.close();
                            }
                        } catch (_) {}
                        this.provider = null;
                    }
                }
                
                if (!connected) {
                    throw new Error('Failed to connect to any WebSocket URL');
                }

                await this.bootstrapChainTime();

                // Initialize contract before fetching constants
                this.debug('Initializing contract...');
                this.contractAddress = config.contractAddress;
                this.contractABI = config.contractABI;

                if (!this.contractABI) {
                    throw new Error('Contract ABI not found in network config');
                }

                this.contract = new ethers.Contract(
                    this.contractAddress,
                    this.contractABI,
                    this.provider
                );

                this.debug('Contract initialized:', {
                    address: this.contract.address,
                    abi: this.contract.interface.format()
                });

                this.debug('Fetching contract constants...');
                this.orderExpiry = await this.contract.ORDER_EXPIRY();
                this.gracePeriod = await this.contract.GRACE_PERIOD();
                this.debug('Contract constants loaded:', {
                    orderExpiry: this.orderExpiry.toString(),
                    gracePeriod: this.gracePeriod.toString()
                });

                await this.setupEventListeners(this.contract);
                
                this.isInitialized = true;
                this.startHealthMonitor();
                this.debug('Initialization complete');
                this.reconnectAttempts = 0;
                
                return true;
            })();

            this.initializationPromise = initializationPromise;
            return await initializationPromise;
        } catch (error) {
            return await this.handleInitializationFailure(error, allowReconnect);
        } finally {
            if (this.initializationPromise === initializationPromise) {
                this.initializationPromise = null;
            }
        }
    }

    async waitForInitialization() {
        if (this.isInitialized) return true;
        return this.initialize();
    }

    async setupEventListeners(contract) {
        try {
            this.debug('Setting up event listeners for contract:', contract.address);
            
            // Test event subscription
            const filter = contract.filters.OrderCreated();
            this.debug('Created filter:', filter);

            // Add error handling for WebSocket connection
            const socket = this.provider?._websocket;
            if (socket) {
                socket.onopen = () => {
                    this.debug('WebSocket connected');
                };

                socket.onerror = (error) => {
                    this.debug('WebSocket error:', error);
                };

                socket.onclose = (event) => {
                    if (socket !== this.provider?._websocket) {
                        this.debug('Ignoring close event from stale websocket instance');
                        return;
                    }

                    this.debug('WebSocket closed:', event);
                    if (event.code !== 1000) {
                        this.debug('WebSocket closed unexpectedly, attempting to reconnect...');
                        this.queueReconnect('socket-close', 5000);
                    }
                };
            }

            contract.on("OrderCreated", async (...args) => {
                try {
                    const event = args[args.length - 1];
                    if (!event || !event.args) {
                        this.debug('Invalid OrderCreated event, missing event.args:', event);
                        return;
                    }
                    const { orderId, maker, taker, sellToken, sellAmount, buyToken, buyAmount, timestamp, feeToken, orderCreationFee } = event.args;
                    const createdAt = timestamp.toNumber();
                    
                    let orderData = {
                        id: orderId.toNumber(),
                        maker,
                        taker,
                        sellToken,
                        sellAmount,
                        buyToken,
                        buyAmount,
                        timestamp: createdAt,
                        timings: this.buildOrderTimings(createdAt),
                        status: 'Active',
                        feeToken,
                        orderCreationFee
                    };

                    const pricing = this.pricingService;
                    orderData = await pricing.upsertOrder(orderData, { computeDeal: true });
                    
                    // Notify subscribers
                    this.notifySubscribers("OrderCreated", orderData);
                } catch (error) {
                    this.debug('Error in OrderCreated handler:', error);
                    console.error('Failed to process OrderCreated event:', error);
                }
            });

            contract.on("OrderFilled", (...args) => {
                const [orderId] = args;
                const orderIdNum = orderId.toNumber();
                const pricing = this.pricingService;
                const order = pricing.updateOrderStatus(orderIdNum, 'Filled');
                if (order) {
                    this.debug('Cache updated for filled order:', order);
                    this.notifySubscribers("OrderFilled", order);
                }
            });

            contract.on("OrderCanceled", (orderId, maker, timestamp, event) => {
                const orderIdNum = orderId.toNumber();
                const pricing = this.pricingService;
                const order = pricing.updateOrderStatus(orderIdNum, 'Canceled');
                if (order) {
                    this.debug('Updated order to Canceled:', orderIdNum);
                    this.notifySubscribers("OrderCanceled", order);
                }
            });

            contract.on("OrderCleanedUp", orderId => {
                const orderIdNum = orderId.toNumber();
                const pricing = this.pricingService;
                const didRemove = pricing.removeOrder(orderIdNum);
                if (didRemove) {
                    this.debug('Removed cleaned up order:', orderIdNum);
                    this.notifySubscribers("OrderCleanedUp", { id: orderIdNum });
                }
            });

            if (this.hasContractEvent(contract, "ContractDisabled")) {
                contract.on("ContractDisabled", () => {
                    this.contractDisabledCache = true;
                    this.contractDisabledFetchedAt = Date.now();
                    this.contractDisabledReadError = false;
                    this.notifySubscribers("ContractDisabled", { disabled: true });
                });
            } else {
                this.debug('ContractDisabled event not found in ABI, skipping listener registration');
            }

            if (this.hasContractEvent(contract, "FeeConfigUpdated")) {
                contract.on("FeeConfigUpdated", (feeToken, feeAmount, timestamp) => {
                    this.notifySubscribers("FeeConfigUpdated", {
                        feeToken,
                        feeAmount: feeAmount?.toString?.() ?? String(feeAmount ?? '0'),
                        timestamp: timestamp?.toString?.() ?? String(timestamp ?? '0')
                    });
                });
            } else {
                this.debug('FeeConfigUpdated event not found in ABI, skipping listener registration');
            }

            if (this.hasContractEvent(contract, "AllowedTokensUpdated")) {
                contract.on("AllowedTokensUpdated", (tokens, allowed, timestamp) => {
                    const normalizedTokens = Array.isArray(tokens)
                        ? tokens.map(token => String(token || '').toLowerCase())
                        : [];
                    const normalizedAllowed = Array.isArray(allowed)
                        ? allowed.map(flag => Boolean(flag))
                        : [];
                    const eventPayload = {
                        tokens: normalizedTokens,
                        allowed: normalizedAllowed,
                        timestamp: timestamp?.toString?.() ?? String(timestamp ?? '0')
                    };

                    this.notifySubscribers("AllowedTokensUpdated", eventPayload);

                    const pricing = this.pricingService;
                    void pricing.getAllowedTokens()
                        .then(() => pricing.refreshPrices())
                        .catch(error => {
                            this.debug('Failed to refresh pricing after AllowedTokensUpdated:', error);
                        });
                });
            } else {
                this.debug('AllowedTokensUpdated event not found in ABI, skipping listener registration');
            }
            
            if (this.hasContractEvent(contract, "ClaimCredited")) {
                contract.on("ClaimCredited", (beneficiary, token, amount, orderId, reason, timestamp) => {
                    const creditedEvent = {
                        beneficiary,
                        token,
                        amount: amount?.toString?.() ?? String(amount ?? '0'),
                        orderId: orderId?.toString?.() ?? String(orderId ?? '0'),
                        reason: reason || '',
                        timestamp: timestamp?.toString?.() ?? String(timestamp ?? '0')
                    };

                    this.notifySubscribers("ClaimCredited", creditedEvent);
                    this.notifySubscribers("claimsUpdated", {
                        beneficiary,
                        token,
                        amount: creditedEvent.amount,
                        source: "ClaimCredited"
                    });
                });
            } else {
                this.debug('ClaimCredited event not found in ABI, skipping listener registration');
            }

            if (this.hasContractEvent(contract, "ClaimWithdrawn")) {
                contract.on("ClaimWithdrawn", (beneficiary, token, amount, timestamp) => {
                    const withdrawnEvent = {
                        beneficiary,
                        token,
                        amount: amount?.toString?.() ?? String(amount ?? '0'),
                        timestamp: timestamp?.toString?.() ?? String(timestamp ?? '0')
                    };

                    this.notifySubscribers("ClaimWithdrawn", withdrawnEvent);
                    this.notifySubscribers("claimsUpdated", {
                        beneficiary,
                        token,
                        amount: withdrawnEvent.amount,
                        source: "ClaimWithdrawn"
                    });
                });
            } else {
                this.debug('ClaimWithdrawn event not found in ABI, skipping listener registration');
            }
            
            this.debug('Event listeners setup complete');
        } catch (error) {
            this.debug('Error setting up event listeners:', error);
        }
    }

    cleanup() {
        try {
            this.debug('Cleaning up WebSocket service...');
            this.stopHealthMonitor();
            this.clearReconnectTimer();
            
            // Remove provider event listeners
            if (this.provider) {
                if (this.provider._websocket) {
                    this.provider._websocket.onopen = null;
                    this.provider._websocket.onerror = null;
                    this.provider._websocket.onclose = null;
                }
            }
            
            // Remove contract event listeners
            if (this.contract) {
                this.contract.removeAllListeners("OrderCreated");
                this.contract.removeAllListeners("OrderFilled");
                this.contract.removeAllListeners("OrderCanceled");
                this.contract.removeAllListeners("OrderCleanedUp");
                if (this.hasContractEvent(this.contract, "ContractDisabled")) {
                    this.contract.removeAllListeners("ContractDisabled");
                }
                if (this.hasContractEvent(this.contract, "FeeConfigUpdated")) {
                    this.contract.removeAllListeners("FeeConfigUpdated");
                }
                if (this.hasContractEvent(this.contract, "AllowedTokensUpdated")) {
                    this.contract.removeAllListeners("AllowedTokensUpdated");
                }
                if (this.hasContractEvent(this.contract, "ClaimCredited")) {
                    this.contract.removeAllListeners("ClaimCredited");
                }
                if (this.hasContractEvent(this.contract, "ClaimWithdrawn")) {
                    this.contract.removeAllListeners("ClaimWithdrawn");
                }
            }
            
            this.lastKnownChainTimestamp = null;
            this.chainTimeSyncedAtMonotonicMs = null;
            this.chainTimeSyncPromise = null;
            this.lastChainTimeBootstrapFailureAtMonotonicMs = null;
            this.isInitialized = false;
            this.provider = null;
            this.contract = null;
            this.initializationPromise = null;
            this.orderExpiry = null;
            this.gracePeriod = null;
            this.activeRequests = 0;
            this.lastRequestTime = 0;
            this.resetContractDisabledStateCache();
            this.healthCheckPromise = null;
            this.reconnectPromise = null;
            
            this.debug('WebSocket service cleanup complete');
        } catch (error) {
            this.debug('Error during cleanup:', error);
        }
    }

    subscribe(eventName, callback) {
        if (!this.subscribers.has(eventName)) {
            this.subscribers.set(eventName, new Set());
        }
        this.subscribers.get(eventName).add(callback);
    }

    unsubscribe(eventName, callback) {
        if (this.subscribers.has(eventName)) {
            this.subscribers.get(eventName).delete(callback);
        }
    }

    // Example method to listen to contract events
    listenToContractEvents(contract, eventName) {
        if (!this.provider) {
            throw new Error('WebSocket not initialized');
        }

        contract.on(eventName, (...args) => {
            const event = args[args.length - 1]; // Last argument is the event object
            const subscribers = this.subscribers.get(eventName);
            if (subscribers) {
                subscribers.forEach(callback => callback(event));
            }
        });
    }

    notifySubscribers(eventName, data) {
        this.debug('Notifying subscribers for event:', eventName);
        const subscribers = this.subscribers.get(eventName);
        if (subscribers) {
            this.debug('Found', subscribers.size, 'subscribers');
            subscribers.forEach(callback => {
                try {
                    this.debug('Calling subscriber callback');
                    callback(data);
                    this.debug('Subscriber callback completed');
                } catch (error) {
                    this.debug('Error in subscriber callback:', error);
                }
            });
        } else {
            this.debug('No subscribers found for event:', eventName);
        }
    }

    isOrderExpired(order) {
        try {
            const expiryTime = this.getOrderExpiryTime(order);
            return this.isPastTimestamp(expiryTime);
        } catch (error) {
            this.debug('Error checking order expiry:', error);
            return false;
        }
    }

    getOrderExpiryTime(order) {
        const expiresAt = Number(order?.timings?.expiresAt);
        if (Number.isFinite(expiresAt)) {
            return expiresAt;
        }

        const createdAt = Number(order?.timestamp);
        if (Number.isFinite(createdAt)) {
            return this.buildOrderTimings(createdAt).expiresAt;
        }

        return null;
    }


    // Check if an order can be filled by the current account
    // Use this to determine to provide a fill button in the UI
    canFillOrder(order, currentAccount) {
        if (order.status !== 'Active') return false;
        if (this.isPastTimestamp(this.getOrderExpiryTime(order))) return false;
        if (order.maker?.toLowerCase() === currentAccount?.toLowerCase()) return false;
        return order.taker === ethers.constants.AddressZero || 
               order.taker?.toLowerCase() === currentAccount?.toLowerCase();
    }

    // Check if an order can be canceled by the current account
    // Use this to determine to provide a cancel button in the UI
    canCancelOrder(order, currentAccount) {
        if (order.status !== 'Active') return false;
        if (this.isPastTimestamp(this.getOrderGraceEndTime(order))) return false;
        return order.maker?.toLowerCase() === currentAccount?.toLowerCase();
    }

    // Get the status of an order
    // Use this to determine to provide a fill button in the UI
    getOrderStatus(order) {
        // Check explicit status first
        if (order.status === 'Canceled') return 'Canceled';
        if (order.status === 'Filled') return 'Filled';

        // Then check timing using cached timings
        const currentTime = this.getCurrentTimestamp();
        const expiresAt = this.getOrderExpiryTime(order);
        const graceEndsAt = this.getOrderGraceEndTime(order);

        this.debug(`Checking order ${order.id} status: currentTime=${currentTime}, expiresAt=${expiresAt}, graceEndsAt=${graceEndsAt}`);

        if (this.isPastTimestamp(graceEndsAt)) {
            this.debug(`Order ${order.id} status: Expired (past grace period)`);
            return 'Expired';
        }
        if (this.isPastTimestamp(expiresAt)) {
            this.debug(`Order ${order.id} status: Expired (past expiry time)`);
            return 'Expired';
        }

        this.debug(`Order ${order.id} status: Active`);
        return 'Active';
    }

    // Reconnect method for handling WebSocket disconnections
    async reconnect(reason = 'manual') {
        if (this.reconnectPromise) {
            return await this.reconnectPromise;
        }

        let retryCycleDelay = null;

        this.reconnectPromise = (async () => {
            this.stopHealthMonitor();
            this.healthCheckPromise = null;
            this.clearReconnectTimer();

            while (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const attempt = this.reconnectAttempts;
                const delay = this.reconnectDelay * Math.pow(2, attempt - 1);
                this.debug(`Reconnecting in ${delay}ms... (attempt ${attempt}/${this.maxReconnectAttempts}, reason: ${reason})`);

                // Clean up existing connection
                if (this.provider) {
                    try {
                        if (this.provider._websocket) {
                            this.provider._websocket.onopen = null;
                            this.provider._websocket.onerror = null;
                            this.provider._websocket.onclose = null;
                        }
                        this.provider.removeAllListeners();
                        if (this.provider._websocket) {
                            this.provider._websocket.close();
                        }
                    } catch (error) {
                        this.debug('Error cleaning up old connection:', error);
                    }
                }

                // Reset state for the next attempt
                this.isInitialized = false;
                this.provider = null;
                this.contract = null;
                this.initializationPromise = null;
                this.lastKnownChainTimestamp = null;
                this.chainTimeSyncedAtMonotonicMs = null;
                this.chainTimeSyncPromise = null;
                this.lastChainTimeBootstrapFailureAtMonotonicMs = null;
                this.resetContractDisabledStateCache();

                await new Promise(resolve => setTimeout(resolve, delay));

                const initialized = await this.initialize(false);
                if (initialized) {
                    return true;
                }
            }

            retryCycleDelay = this.reconnectDelay * Math.pow(2, this.maxReconnectAttempts - 1);
            this.debug(`Max reconnection attempts reached; scheduling another reconnect cycle in ${retryCycleDelay}ms`);
            this.reconnectAttempts = 0;
            return false;
        })().finally(() => {
            this.reconnectPromise = null;
            if (retryCycleDelay !== null && !this.isInitialized && !this.reconnectTimer) {
                this.queueReconnect('retry-cycle', retryCycleDelay);
            }
        });

        return await this.reconnectPromise;
    }
}
