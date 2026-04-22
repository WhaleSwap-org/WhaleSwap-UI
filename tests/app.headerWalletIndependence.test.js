/**
 * Regression tests for issue #153
 * Phase 2: Make header/network selector reflect wallet connection only
 * 
 * Key behaviors:
 * - Network badge shows selected app network only, not wallet connection status
 * - Connected-wallet header selection switches the wallet when needed
 * - Disconnected header selection still uses the reload path
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../js/app.js';
import { getNetworkBySlug, getNetworkById } from '../js/config/networks.js';
import { walletManager } from '../js/services/WalletManager.js';

const BNB_CHAIN_ID = '0x38';
const POLYGON_SLUG = 'polygon';
const ETHEREUM_SLUG = 'ethereum';

function setupNetworkSelectorDom() {
	document.body.innerHTML = `
		<button id="addNetworkButton" class="hidden">Add Network</button>
		<div class="network-selector">
			<button class="network-button" type="button">
				<span class="network-badge"></span>
			</button>
			<div class="network-dropdown hidden"></div>
		</div>
	`;
}

function initializeApp({ walletChainId, selectedSlug }) {
	setupNetworkSelectorDom();

	const selectedNetwork = getNetworkBySlug(selectedSlug);
	if (!selectedNetwork) {
		throw new Error(`Unknown network slug: ${selectedSlug}`);
	}

	// Mock URL params
	const originalLocation = window.location;
	delete window.location;
	window.location = {
		...originalLocation,
		href: `http://localhost:3000/?network=${selectedSlug}`,
		search: `?network=${selectedSlug}`,
		pathname: '/',
		reload: vi.fn(),
	};

	// Initialize app context
	const AppCtor = window.app.constructor;
	const app = new AppCtor();
	app.ctx = {
		getSelectedChainSlug: () => selectedSlug,
		getWalletChainId: () => walletChainId,
		getWallet: () => ({
			isWalletConnected: () => !!walletChainId,
			getSigner: () => walletChainId ? {} : null,
		}),
	};
	app.showWarning = vi.fn();
	app.warn = vi.fn();
	app.load = vi.fn(async () => {}); // Prevent full initialization
	app.showGlobalLoader = vi.fn();
	app.hideGlobalLoader = vi.fn();
	window.app = app;

	// Set selected network
	window.selectedNetworkSlug = selectedSlug;

	// Mock wallet manager
	walletManager.chainId = walletChainId;
	walletManager.injectedProvider = walletChainId ? { request: vi.fn() } : null;

	// Mock fetch to prevent version check errors
	vi.stubGlobal('fetch', vi.fn(async () => ({
		ok: true,
		text: async () => ''
	})));

	// Trigger DOMContentLoaded to initialize network badge
	window.history.replaceState({}, '', `/?chain=${selectedSlug}`);
	document.dispatchEvent(new Event('DOMContentLoaded'));

	return app;
}

describe('Header wallet connection independence (issue #153)', () => {
	let originalLocation;

	beforeEach(() => {
		originalLocation = window.location;
		vi.clearAllMocks();
	});

	afterEach(() => {
	document.body.innerHTML = '';
	window.history.replaceState({}, '', '/');
	walletManager.chainId = null;
	walletManager.injectedProvider = null;
	});

	describe('syncNetworkBadgeFromState', () => {
		it('shows selected network without wallet connection status classes', () => {
			const app = initializeApp({
				walletChainId: BNB_CHAIN_ID,
				selectedSlug: POLYGON_SLUG,
			});

			const networkBadge = document.querySelector('.network-badge');
			const networkButton = document.querySelector('.network-button');
			const networkDropdown = document.querySelector('.network-dropdown');

			// Network badge should show selected network (Polygon)
			expect(networkBadge?.textContent).toContain('Polygon');

			// Should NOT have wallet connection status classes
			expect(networkBadge?.classList.contains('connected')).toBe(false);
			expect(networkBadge?.classList.contains('wrong-network')).toBe(false);
			expect(networkBadge?.classList.contains('setup-needed')).toBe(false);
			expect(networkBadge?.classList.contains('disconnected')).toBe(false);

			// Should have default status
			expect(networkButton?.dataset.networkStatus).toBe('default');
			expect(networkDropdown?.dataset.networkStatus).toBe('default');
		});

		it('shows selected network even when wallet is on different chain', () => {
			const app = initializeApp({
				walletChainId: BNB_CHAIN_ID, // Wallet on BNB
				selectedSlug: POLYGON_SLUG, // App on Polygon
			});

			const networkBadge = document.querySelector('.network-badge');

			// Network badge should show selected network (Polygon), not wallet network (BNB)
			expect(networkBadge?.textContent).toContain('Polygon');
			expect(networkBadge?.classList.contains('wrong-network')).toBe(false);
		});

		it('shows selected network even when wallet is on same chain', () => {
			const polygonChainId = getNetworkBySlug(POLYGON_SLUG)?.chainId;
			const app = initializeApp({
				walletChainId: polygonChainId,
				selectedSlug: POLYGON_SLUG,
			});

			const networkBadge = document.querySelector('.network-badge');

			// Network badge should show selected network (Polygon)
			expect(networkBadge?.textContent).toContain('Polygon');
			// Should NOT have 'connected' class (wallet connection status is separate)
			expect(networkBadge?.classList.contains('connected')).toBe(false);
		});

		it('shows selected network when no wallet is connected', () => {
			const app = initializeApp({
				walletChainId: null,
				selectedSlug: POLYGON_SLUG,
			});

			const networkBadge = document.querySelector('.network-badge');

			// Network badge should show selected network (Polygon)
			expect(networkBadge?.textContent).toContain('Polygon');
			// Should NOT have 'disconnected' class
			expect(networkBadge?.classList.contains('disconnected')).toBe(false);
		});
	});

	describe('handleNetworkSelectionCommit', () => {
		it('calls switchWalletToNetwork when a connected wallet changes the selected network', async () => {
			const app = initializeApp({
				walletChainId: BNB_CHAIN_ID, // Wallet on BNB
				selectedSlug: ETHEREUM_SLUG, // App on Ethereum
			});

			const targetNetwork = getNetworkBySlug(POLYGON_SLUG);
			const previousSelectedNetwork = getNetworkBySlug(ETHEREUM_SLUG);
			const switchSpy = vi.spyOn(app, 'switchWalletToNetwork').mockResolvedValue(true);

			await app.handleNetworkSelectionCommit(targetNetwork, {
				selectedChainChanged: true,
				previousSelectedNetwork,
			});

			expect(switchSpy).toHaveBeenCalledWith(targetNetwork, {
				source: 'header:network-selection',
				selectedChainChanged: true,
				previousSelectedNetwork,
			});
			expect(window.location.reload).not.toHaveBeenCalled();
		});

		it('retries wallet alignment from the header without reload when the selected network did not change', async () => {
			const app = initializeApp({
				walletChainId: BNB_CHAIN_ID,
				selectedSlug: POLYGON_SLUG,
			});
			const targetNetwork = getNetworkBySlug(POLYGON_SLUG);
			const switchSpy = vi.spyOn(app, 'switchWalletToNetwork').mockResolvedValue(true);

			await app.handleNetworkSelectionCommit(targetNetwork, {
				selectedChainChanged: false,
				previousSelectedNetwork: targetNetwork,
			});

			expect(switchSpy).toHaveBeenCalledWith(targetNetwork, {
				source: 'header:network-selection',
				selectedChainChanged: false,
				previousSelectedNetwork: targetNetwork,
			});
			expect(window.location.reload).not.toHaveBeenCalled();
		});

		it('does nothing when a connected wallet already matches the unchanged selected network', async () => {
			const polygonChainId = getNetworkBySlug(POLYGON_SLUG)?.chainId;
			const app = initializeApp({
				walletChainId: polygonChainId,
				selectedSlug: POLYGON_SLUG,
			});
			const targetNetwork = getNetworkBySlug(POLYGON_SLUG);
			const switchSpy = vi.spyOn(app, 'switchWalletToNetwork');

			await app.handleNetworkSelectionCommit(targetNetwork, {
				selectedChainChanged: false,
				previousSelectedNetwork: targetNetwork,
			});

			expect(switchSpy).not.toHaveBeenCalled();
			expect(window.location.reload).not.toHaveBeenCalled();
		});

		it('triggers page reload for disconnected users', async () => {
			const app = initializeApp({
				walletChainId: null, // No wallet connected
				selectedSlug: ETHEREUM_SLUG,
			});
			const switchSpy = vi.spyOn(app, 'switchWalletToNetwork');
			const targetNetwork = getNetworkBySlug(POLYGON_SLUG);
			const previousSelectedNetwork = getNetworkBySlug(ETHEREUM_SLUG);

			await app.handleNetworkSelectionCommit(targetNetwork, {
				selectedChainChanged: true,
				previousSelectedNetwork,
			});

			expect(switchSpy).not.toHaveBeenCalled();
			expect(window.location.reload).toHaveBeenCalled();
		});

		it('does not trigger page reload when network is null', async () => {
			const app = initializeApp({
				walletChainId: BNB_CHAIN_ID,
				selectedSlug: ETHEREUM_SLUG,
			});

			await app.handleNetworkSelectionCommit(null);

			expect(window.location.reload).not.toHaveBeenCalled();
		});
	});

	describe('add network button visibility', () => {
		it('hides add network button by default (network selection does not trigger wallet operations)', () => {
			const app = initializeApp({
				walletChainId: BNB_CHAIN_ID,
				selectedSlug: POLYGON_SLUG,
			});

			const addNetworkButton = document.getElementById('addNetworkButton');

			// Add network button should be hidden by default
			expect(addNetworkButton?.classList.contains('hidden')).toBe(true);
		});

		it('shows add network button when network setup is required after failed switch', () => {
			const app = initializeApp({
				walletChainId: BNB_CHAIN_ID,
				selectedSlug: POLYGON_SLUG,
			});

			const targetNetwork = getNetworkBySlug(POLYGON_SLUG);
			const error = Object.assign(new Error('Unrecognized chain'), {
				code: 4902,
				requiresWalletNetworkAddition: true,
			});
			walletManager.injectedProvider = { request: vi.fn() };

			app.handleNetworkSwitchFailure(error, targetNetwork, {
				restoreSelectionNetwork: targetNetwork,
			});

			const addNetworkButton = document.getElementById('addNetworkButton');

			// Add network button should be visible after failed switch
			expect(addNetworkButton?.classList.contains('hidden')).toBe(false);
			expect(addNetworkButton?.textContent).toBe('Add Polygon Mainnet');
		});
	});
});
