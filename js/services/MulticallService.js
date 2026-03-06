import { ethers } from 'ethers';
import { getNetworkConfig } from '../config/networks.js';
import { createLogger } from './LogService.js';

// Logger (behind DEBUG_CONFIG via LogService)
const logger = createLogger('MULTICALL');
const debug = logger.debug.bind(logger);
const error = logger.error.bind(logger);

// Multicall2 ABI
const MULTICALL2_ABI = [
	'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])'
];

const httpProviderCache = new Map();

function getRpcUrls() {
	const networkCfg = getNetworkConfig();
	return [...new Set([
		networkCfg?.rpcUrl,
		...(networkCfg?.fallbackRpcUrls || [])
	].filter(Boolean))];
}

function getHttpProvider(url) {
	if (!url) {
		return null;
	}

	if (!httpProviderCache.has(url)) {
		httpProviderCache.set(url, new ethers.providers.JsonRpcProvider(url));
	}

	return httpProviderCache.get(url);
}

export async function readViaRpcProviders(readFn) {
	const rpcUrls = getRpcUrls();
	if (rpcUrls.length === 0) {
		throw new Error('No HTTP RPC URL configured for current network');
	}

	let lastError = null;
	for (const url of rpcUrls) {
		try {
			return await readFn(getHttpProvider(url), url);
		} catch (e) {
			lastError = e;
			httpProviderCache.delete(url);
			debug(`HTTP RPC read failed (${url}), trying next provider:`, e?.message || e);
		}
	}

	throw lastError || new Error('All HTTP RPC URLs failed');
}

/**
 * Execute a batch of read-only calls via Multicall2.
 * @param {Array<{ target: string, callData: string }>} calls
 * @param {{ requireSuccess?: boolean }} options
 * @returns {Promise<Array<{ success: boolean, returnData: string }>> | null} Returns null if multicall is not available
 */
export async function tryAggregate(calls, options = {}) {
	const requireSuccess = options.requireSuccess === true;
	const networkCfg = getNetworkConfig();
	const multicallAddress = networkCfg.multicallAddress;
	if (!multicallAddress) {
		debug('No multicallAddress configured for current network');
		return null;
	}

	if (!Array.isArray(calls) || calls.length === 0) {
		return [];
	}

	try {
		return await readViaRpcProviders(async (provider) => {
			const multicallContract = new ethers.Contract(multicallAddress, MULTICALL2_ABI, provider);
			return await multicallContract.tryAggregate(requireSuccess, calls);
		});
	} catch (e) {
		debug('Multicall tryAggregate failed, will fallback to per-call path:', e?.message || e);
		return null;
	}
}

/**
 * Helper to check if multicall is configured and provider is available.
 */
export function isMulticallAvailable() {
	try {
		const networkCfg = getNetworkConfig();
		return !!(networkCfg.multicallAddress && getRpcUrls().length > 0);
	} catch {
		return false;
	}
}
