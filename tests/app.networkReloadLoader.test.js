import { afterEach, describe, expect, it, vi } from 'vitest';
import '../js/app.js';

const BOOTSTRAP_LOADER_STATE_KEY = 'whaleswapBootstrapLoader';

function setupBootstrapLoaderDom() {
	document.body.innerHTML = `
		<div id="app-bootstrap-loader" class="loading-overlay--global" role="status">
			<div class="loading-text">Loading WhaleSwap...</div>
			<div class="loading-hint" data-loader-hint hidden></div>
			<button class="loading-retry" type="button" data-loader-retry hidden>Retry</button>
		</div>
	`;
}

afterEach(() => {
	document.body.innerHTML = '';
	document.documentElement.dataset.bootstrapLoaderMode = 'skeleton';
	window.history.replaceState({}, '', '/');
	vi.restoreAllMocks();
});

describe('App bootstrap loader transitions', () => {
	it('keeps the skeleton loader by default on initial load', () => {
		const AppCtor = window.app.constructor;
		const app = new AppCtor();

		const loader = app.showGlobalLoader('Loading WhaleSwap...');

		expect(loader.classList.contains('loading-overlay--spinner')).toBe(false);
		expect(loader.querySelector('.loading-skeleton--app')).toBeTruthy();
		expect(loader.querySelector('.loading-indicator--spinner')).toBeTruthy();
		expect(loader.querySelector('.loading-text').textContent).toBe('Loading WhaleSwap...');
	});

	it('persists spinner mode for the next load during network-triggered reloads', () => {
		const AppCtor = window.app.constructor;
		const app = new AppCtor();
		const persistFormStateForReload = vi.fn();

		setupBootstrapLoaderDom();
		app.globalLoader = document.getElementById('app-bootstrap-loader');
		app.currentTab = 'create-order';
		app.components = {
			'create-order': {
				persistFormStateForReload
			}
		};

		app.prepareForNetworkReload();

		const loaderState = window.history.state?.[BOOTSTRAP_LOADER_STATE_KEY];
		expect(loaderState).toEqual({
			mode: 'spinner',
			message: 'Switching network...'
		});
		expect(app.globalLoader.classList.contains('loading-overlay--spinner')).toBe(true);
		expect(app.globalLoader.querySelector('.loading-indicator--spinner')).toBeTruthy();
		expect(app.globalLoader.querySelector('.loading-text').textContent).toBe('Switching network...');
		expect(persistFormStateForReload).toHaveBeenCalledTimes(1);
	});
});
