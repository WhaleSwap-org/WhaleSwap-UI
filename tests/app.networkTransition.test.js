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
	snapshot = null,
} = {}) {
	const AppCtor = window.app.constructor;
	const app = new AppCtor();
	const createOrderComponent = {
		captureFormStateSnapshot: vi.fn(() => snapshot),
		applyFormStateSnapshot: vi.fn(async () => ({ restored: true })),
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

afterEach(() => {
	document.body.innerHTML = '';
	window.history.replaceState({}, '', '/');
	walletManager.chainId = null;
	setActiveNetwork(getNetworkBySlug('polygon'));
	vi.restoreAllMocks();
});

describe('App network transition behavior', () => {
	it('uses the lightweight same-chain path when the wallet catches up to the selected network', async () => {
		const targetNetwork = getNetworkBySlug('polygon');
		const { app } = createConnectedApp();
		const switchSpy = vi.spyOn(walletManager, 'switchToNetwork').mockResolvedValue(targetNetwork);

		await app.switchWalletToNetwork(targetNetwork, {
			source: 'write:create the order',
			selectedChainChanged: false,
		});

		expect(switchSpy).toHaveBeenCalledWith(targetNetwork);
		expect(app.recreateNetworkServices).not.toHaveBeenCalled();
		expect(app.reinitializeComponents).not.toHaveBeenCalled();
		expect(app.showGlobalLoader).not.toHaveBeenCalled();
		expect(app.refreshActiveComponent).toHaveBeenCalledTimes(1);
	});

	it('dedupes repeated successful transitions for the same network', async () => {
		const targetNetwork = getNetworkBySlug('bnb');
		const { app } = createConnectedApp();
		let resolveTransition;
		app.recreateNetworkServices.mockImplementation(
			() => new Promise((resolve) => {
				resolveTransition = resolve;
			})
		);

		const firstTransition = app.handleSuccessfulConnectedNetworkTransition(targetNetwork, {
			source: 'switch-call',
			selectedChainChanged: true,
		});
		const secondTransition = app.handleSuccessfulConnectedNetworkTransition(targetNetwork, {
			source: 'chain-changed',
			selectedChainChanged: true,
		});

		expect(app.recreateNetworkServices).toHaveBeenCalledTimes(1);

		resolveTransition();
		await expect(Promise.all([firstTransition, secondTransition])).resolves.toEqual([true, true]);
	});

	it('preserves create-order form state on same-chain alignment without snapshotting or reinit', async () => {
		const targetNetwork = getNetworkBySlug('polygon');
		const snapshot = {
			selectedChainSlug: 'polygon',
			sellTokenAddress: '0x1111111111111111111111111111111111111111',
			sellAmount: '12.5',
		};
		const { app, createOrderComponent } = createConnectedApp({ snapshot });

		await app.handleSuccessfulConnectedNetworkTransition(targetNetwork, {
			source: 'write:create the order',
			selectedChainChanged: false,
		});

		expect(snapshot.sellAmount).toBe('12.5');
		expect(createOrderComponent.captureFormStateSnapshot).not.toHaveBeenCalled();
		expect(app.reinitializeComponents).not.toHaveBeenCalled();
		expect(app.refreshActiveComponent).toHaveBeenCalledTimes(1);
	});

	it('clears create-order state when the selected chain changes explicitly', async () => {
		const targetNetwork = getNetworkBySlug('bnb');
		const { app, createOrderComponent } = createConnectedApp({
			currentTab: 'claim',
			isCurrentTabVisible: false,
			snapshot: {
				selectedChainSlug: 'polygon',
				sellAmount: '9',
			},
		});

		await app.handleSuccessfulConnectedNetworkTransition(targetNetwork, {
			source: 'network-selector',
			selectedChainChanged: true,
		});

		expect(createOrderComponent.captureFormStateSnapshot).not.toHaveBeenCalled();
		expect(app.recreateNetworkServices).toHaveBeenCalledTimes(1);
		expect(app.reinitializeComponents).toHaveBeenCalledWith(expect.objectContaining({
			createOrderSnapshot: null,
			createOrderResetOptions: {
				clearSelections: true,
			},
		}));
		expect(app.showTab).toHaveBeenCalledWith('create-order', false, {
			skipInitialize: true,
		});
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
