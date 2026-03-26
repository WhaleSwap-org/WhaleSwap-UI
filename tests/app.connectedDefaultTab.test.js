import { afterEach, describe, expect, it } from 'vitest';
import '../js/app.js';
import { getNetworkBySlug } from '../js/config/networks.js';

const POLYGON_CHAIN_ID = '0x89';
const ETHEREUM_CHAIN_ID = '0x1';

function createApp() {
	const AppCtor = window.app.constructor;
	const app = new AppCtor();

	app.ctx = {
		getWallet: () => ({
			getSigner: () => null,
		}),
		getWalletChainId: () => null,
	};
	app.getSelectedNetwork = () => getNetworkBySlug('polygon');
	window.app = app;

	return app;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('App initial default tab behavior', () => {
	it('defaults to create-order for a connected wallet even when the wallet is on a different network', () => {
		const app = createApp();
		app.ctx = {
			getWallet: () => ({
				getSigner: () => ({})
			}),
			getWalletChainId: () => ETHEREUM_CHAIN_ID,
		};

		expect(app.getInitialRenderState()).toEqual({
			defaultTab: 'create-order',
			hasInitialConnectedContext: false,
		});
	});

	it('defaults to view-orders when no wallet is connected', () => {
		const app = createApp();
		app.ctx = {
			getWallet: () => ({
				getSigner: () => null,
			}),
			getWalletChainId: () => POLYGON_CHAIN_ID,
		};

		expect(app.getInitialRenderState()).toEqual({
			defaultTab: 'view-orders',
			hasInitialConnectedContext: false,
		});
	});
});
