import { afterEach, describe, expect, it, vi } from 'vitest';
import '../js/app.js';
import { getNetworkBySlug } from '../js/config/networks.js';
import { walletManager } from '../js/services/WalletManager.js';

const POLYGON_CHAIN_ID = '0x89';
const BNB_CHAIN_ID = '0x38';
const POLYGON_SLUG = 'polygon';
const BNB_SLUG = 'bnb';

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

function createAppContext(walletChainId = POLYGON_CHAIN_ID) {
	let selectedChainSlug = null;

	return {
		setSelectedChainSlug(slug) {
			selectedChainSlug = slug;
		},
		getSelectedChainSlug() {
			return selectedChainSlug;
		},
		getWalletChainId() {
			return walletChainId;
		},
		setWalletChainId: vi.fn()
	};
}

function initializeApp({
	walletChainId = POLYGON_CHAIN_ID,
	selectedSlug = BNB_SLUG
} = {}) {
	const AppCtor = window.app.constructor;
	const app = new AppCtor();
	app.ctx = createAppContext(walletChainId);
	app.load = vi.fn(async () => {});
	app.showGlobalLoader = vi.fn();
	app.showWarning = vi.fn();
	app.hideGlobalLoader = vi.fn();
	app.warn = vi.fn();
	window.app = app;
	walletManager.chainId = walletChainId;
	vi.stubGlobal('fetch', vi.fn(async () => ({
		ok: true,
		text: async () => ''
	})));

	setupNetworkSelectorDom();
	window.history.replaceState({}, '', `/?chain=${selectedSlug}`);
	document.dispatchEvent(new Event('DOMContentLoaded'));

	return app;
}

function getSelectedChainFromUrl() {
	return new URL(window.location.href).searchParams.get('chain');
}

afterEach(() => {
	document.body.innerHTML = '';
	window.history.replaceState({}, '', '/');
	walletManager.chainId = null;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('App network switch failure behavior', () => {
	it('restores the selected chain and URL to the previous app selection after a rejected switch', () => {
		const app = initializeApp();
		const targetNetwork = getNetworkBySlug(BNB_SLUG);
		const previousSelection = getNetworkBySlug(POLYGON_SLUG);
		const error = Object.assign(new Error('user rejected request'), { code: 4001 });

		expect(app.ctx.getSelectedChainSlug()).toBe(BNB_SLUG);
		expect(getSelectedChainFromUrl()).toBe(BNB_SLUG);

		app.handleNetworkSwitchFailure(error, targetNetwork, {
			restoreSelectionNetwork: previousSelection,
		});

		expect(app.ctx.getSelectedChainSlug()).toBe(POLYGON_SLUG);
		expect(getSelectedChainFromUrl()).toBe(POLYGON_SLUG);
		expect(app.showWarning).toHaveBeenCalledWith(
			'Wallet request was cancelled. Restored selection to Polygon Mainnet.'
		);
	});

	it('restores the selected chain for missing-network failures and removes retry-specific copy', () => {
		const app = initializeApp();
		const targetNetwork = getNetworkBySlug(BNB_SLUG);
		const previousSelection = getNetworkBySlug(POLYGON_SLUG);
		const error = Object.assign(new Error('Unrecognized chain'), {
			code: 4902,
			requiresWalletNetworkAddition: true
		});

		expect(app.ctx.getSelectedChainSlug()).toBe(BNB_SLUG);
		expect(getSelectedChainFromUrl()).toBe(BNB_SLUG);

		app.handleNetworkSwitchFailure(error, targetNetwork, {
			restoreSelectionNetwork: previousSelection,
		});

		const warningMessage = app.showWarning.mock.calls.at(-1)?.[0];
		expect(app.ctx.getSelectedChainSlug()).toBe(POLYGON_SLUG);
		expect(getSelectedChainFromUrl()).toBe(POLYGON_SLUG);
		expect(warningMessage).toBe(
			'Could not switch wallet to BNB Chain because it is not added in your wallet. Restored selection to Polygon Mainnet.'
		);
		expect(warningMessage).not.toContain('Add Network to retry');
	});

	it('keeps the selected chain when a write-triggered switch is rejected on the current app chain', () => {
		const app = initializeApp({
			walletChainId: BNB_CHAIN_ID,
			selectedSlug: POLYGON_SLUG,
		});
		const targetNetwork = getNetworkBySlug(POLYGON_SLUG);
		const error = Object.assign(new Error('user rejected request'), { code: 4001 });

		expect(app.ctx.getSelectedChainSlug()).toBe(POLYGON_SLUG);
		expect(getSelectedChainFromUrl()).toBe(POLYGON_SLUG);

		app.handleNetworkSwitchFailure(error, targetNetwork, {
			restoreSelectionNetwork: targetNetwork,
		});

		expect(app.ctx.getSelectedChainSlug()).toBe(POLYGON_SLUG);
		expect(getSelectedChainFromUrl()).toBe(POLYGON_SLUG);
		expect(app.showWarning).toHaveBeenCalledWith(
			'Wallet request was cancelled. Kept selection on Polygon Mainnet.'
		);
	});
});
