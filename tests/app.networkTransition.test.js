import { afterEach, describe, expect, it, vi } from 'vitest';
import '../js/app.js';
import { BaseComponent } from '../js/components/BaseComponent.js';
import { getNetworkBySlug, setActiveNetwork } from '../js/config/networks.js';
import { walletManager } from '../js/services/WalletManager.js';

const POLYGON_CHAIN_ID = '0x89';
const BNB_CHAIN_ID = '0x38';

function createConnectedApp({
	currentTab = 'create-order',
	isCurrentTabVisible = true,
} = {}) {
	const AppCtor = window.app.constructor;
	const app = new AppCtor();
	const createOrderComponent = {
		resetState: vi.fn(),
		initialize: vi.fn(async () => {}),
	};

	app.currentTab = currentTab;
	app.ctx = {
		getWallet: () => ({
			isWalletConnected: () => true,
			getSigner: () => ({}),
		}),
		getWalletChainId: () => POLYGON_CHAIN_ID,
		setWalletChainId: vi.fn(),
		getWebSocket: () => ({}),
	};
	app.components = {
		'create-order': createOrderComponent,
	};
	app.showGlobalLoader = vi.fn(() => {
		app.globalLoader = document.createElement('div');
		return app.globalLoader;
	});
	app.hideGlobalLoader = vi.fn(() => {
		app.globalLoader = null;
	});
	app.recreateNetworkServices = vi.fn(async () => {});
	app.reinitializeComponents = vi.fn(async () => {});
	app.refreshActiveComponent = vi.fn(async () => {});
	app.updateTabVisibility = vi.fn();
	app.refreshAdminTabVisibility = vi.fn(async () => false);
	app.refreshClaimTabVisibility = vi.fn(async () => false);
	app.refreshOrderTabVisibility = vi.fn(async () => ({ showMyOrders: false, showInvitedOrders: false }));
	app.isTabVisible = vi.fn(() => isCurrentTabVisible);
	app.showTab = vi.fn(async (tabId) => {
		app.currentTab = tabId;
	});
	app.startInitialOrderSync = vi.fn();
	app.tabReady = new Set(['create-order']);
	window.app = app;

	return { app, createOrderComponent };
}

let originalLocation;

afterEach(() => {
	document.body.innerHTML = '';
	window.history.replaceState({}, '', '/');
	walletManager.chainId = null;
	setActiveNetwork(getNetworkBySlug('polygon'));
	if (originalLocation) {
		Object.defineProperty(window, 'location', {
			configurable: true,
			writable: true,
			value: originalLocation,
		});
		originalLocation = null;
	}
	vi.restoreAllMocks();
});

function stubWindowLocationReload() {
	originalLocation = window.location;
	Object.defineProperty(window, 'location', {
		configurable: true,
		writable: true,
		value: {
			...window.location,
			reload: vi.fn(),
		},
	});
}

describe('App network transition behavior', () => {
	it('triggers a full page reload after a successful wallet network switch', async () => {
		const targetNetwork = getNetworkBySlug('polygon');
		const { app } = createConnectedApp();
		stubWindowLocationReload();
		const switchSpy = vi.spyOn(walletManager, 'switchToNetwork').mockResolvedValue(targetNetwork);
		const prepareSpy = vi.spyOn(app, 'prepareForNetworkReload');

		const result = await app.switchWalletToNetwork(targetNetwork, {
			source: 'write:create the order',
			selectedChainChanged: false,
		});

		expect(result).toBe(true);
		expect(switchSpy).toHaveBeenCalledWith(targetNetwork);
		// No in-page transition code paths should run; the reload gives
		// us a guaranteed clean slate.
		expect(app.recreateNetworkServices).not.toHaveBeenCalled();
		expect(app.reinitializeComponents).not.toHaveBeenCalled();
		expect(app.refreshActiveComponent).not.toHaveBeenCalled();
		expect(prepareSpy).toHaveBeenCalledTimes(1);
		expect(window.location.reload).toHaveBeenCalledTimes(1);
	});
});

describe('App active tab persistence', () => {
	it('persists the selected tab in history state when showTab succeeds', async () => {
		document.body.innerHTML = `
			<button class="tab-button" data-tab="view-orders"></button>
			<button class="tab-button" data-tab="cleanup-orders"></button>
			<div id="view-orders" class="tab-content"></div>
			<div id="cleanup-orders" class="tab-content"></div>
		`;
		window.history.replaceState(
			{
				whaleswapBootstrapLoader: {
					mode: 'spinner',
					message: 'Switching network...'
				}
			},
			'',
			'/'
		);

		const AppCtor = window.app.constructor;
		const app = new AppCtor();
		app.ctx = {
			getWallet: () => ({
				isWalletConnected: () => true,
			}),
		};
		app.components = {};
		app.refreshAdminTabVisibility = vi.fn(async () => false);
		app.refreshClaimTabVisibility = vi.fn(async () => false);
		app.refreshOrderTabVisibility = vi.fn(async () => ({ showMyOrders: false, showInvitedOrders: false }));
		app.tabReady = new Set();

		await app.showTab('cleanup-orders', false, { skipInitialize: true });

		expect(window.history.state?.whaleswapActiveTab).toBe('cleanup-orders');
		expect(window.history.state?.whaleswapBootstrapLoader).toEqual({
			mode: 'spinner',
			message: 'Switching network...'
		});
	});

	it('restores cleanup-orders after initial visibility has been applied', () => {
		document.body.innerHTML = `
			<button class="tab-button" data-tab="create-order" style="display: block"></button>
			<button class="tab-button" data-tab="view-orders" style="display: block"></button>
			<button class="tab-button" data-tab="cleanup-orders" style="display: none"></button>
		`;

		const AppCtor = window.app.constructor;
		const app = new AppCtor();

		expect(app.resolveInitialTab('cleanup-orders', true)).toBe('create-order');

		app.setTabVisible('cleanup-orders', true);

		expect(app.resolveInitialTab('cleanup-orders', true)).toBe('cleanup-orders');
		expect(app.resolveInitialTab('claim', false)).toBe('view-orders');
	});
});

describe('BaseComponent ensureWalletReadyForWrite', () => {
	it('continues the write flow after a successful in-place network switch', async () => {
		document.body.innerHTML = '<div id="test-component"></div>';

		const component = new BaseComponent('test-component');
		const showWarning = vi.fn();
		component.setContext({
			getWalletChainId: () => BNB_CHAIN_ID,
			showError: vi.fn(),
			showSuccess: vi.fn(),
			showWarning,
			showInfo: vi.fn(),
		});

		setActiveNetwork(getNetworkBySlug('polygon'));
		window.app = {
			switchWalletToNetwork: vi.fn(async () => true),
		};

		const isReady = await component.ensureWalletReadyForWrite('create the order');

		expect(isReady).toBe(true);
		expect(showWarning).toHaveBeenCalledWith(
			'Switching wallet to Polygon Mainnet before trying to create the order...',
			5000
		);
		expect(window.app.switchWalletToNetwork).toHaveBeenCalledWith(
			getNetworkBySlug('polygon'),
			{
				source: 'write:create the order',
				selectedChainChanged: false,
				previousSelectedNetwork: getNetworkBySlug('polygon'),
			}
		);
	});
});
