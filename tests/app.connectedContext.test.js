import { afterEach, describe, expect, it, vi } from 'vitest';
import '../js/app.js';
import { getNetworkBySlug } from '../js/config/networks.js';

const POLYGON_CHAIN_ID = '0x89';
const BNB_CHAIN_ID = '0x38';

function createApp() {
	const AppCtor = window.app.constructor;
	const app = new AppCtor();

	app.ctx = {
		getWallet: () => ({
			isWalletConnected: () => false,
			getSigner: () => null,
			getAccount: () => null,
		}),
		getWalletChainId: () => null,
		setWalletChainId: vi.fn(),
	};
	app.getSelectedNetwork = vi.fn(() => getNetworkBySlug('polygon'));
	app.updateTabVisibility = vi.fn();
	app.refreshAdminTabVisibility = vi.fn(async () => false);
	app.refreshClaimTabVisibility = vi.fn(async () => false);
	app.refreshOrderTabVisibility = vi.fn(async () => ({ showMyOrders: false, showInvitedOrders: false }));
	app.reinitializeComponents = vi.fn(async () => {});
	app.switchWalletToNetwork = vi.fn(async () => true);
	app.showWarning = vi.fn();
	window.app = app;

	return app;
}

afterEach(() => {
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

describe('App connected state behavior', () => {
	it('treats a wallet account on a different network as connected for initial UI state', () => {
		const app = createApp();
		app.ctx = {
			...app.ctx,
			getWallet: () => ({
				isWalletConnected: () => true,
				getSigner: () => null,
				getAccount: () => '0x1234',
			}),
			getWalletChainId: () => BNB_CHAIN_ID,
		};

		expect(app.isWalletConnectedForUi()).toBe(true);
	});

	it('does not auto-switch the wallet on connect when the wallet is on a different network', async () => {
		const app = createApp();

		await app.handleWalletConnectEvent({
			chainId: BNB_CHAIN_ID,
			userInitiated: true,
		});

		expect(app.switchWalletToNetwork).not.toHaveBeenCalled();
		expect(app.ctx.setWalletChainId).toHaveBeenCalledWith(BNB_CHAIN_ID);
		expect(app.updateTabVisibility).toHaveBeenCalledWith(true);
		expect(app.refreshClaimTabVisibility).toHaveBeenCalledTimes(1);
		expect(app.refreshOrderTabVisibility).toHaveBeenCalledTimes(1);
		expect(app.reinitializeComponents).toHaveBeenCalledWith(true);
	});

	it('keeps disconnected startup in read-only mode', () => {
		const app = createApp();
		app.ctx = {
			...app.ctx,
			getWallet: () => ({
				isWalletConnected: () => false,
				getSigner: () => null,
				getAccount: () => null,
			}),
			getWalletChainId: () => POLYGON_CHAIN_ID,
		};

		expect(app.isWalletConnectedForUi()).toBe(false);
	});
});
