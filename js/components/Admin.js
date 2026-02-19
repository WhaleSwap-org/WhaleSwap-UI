import { BaseComponent } from './BaseComponent.js';
import { ethers } from 'ethers';
import { erc20Abi } from '../abi/erc20.js';
import { createLogger } from '../services/LogService.js';
import { DEBUG_CONFIG } from '../config.js';

export class Admin extends BaseComponent {
    constructor() {
        super('admin');

        const logger = createLogger('ADMIN');
        this.debug = logger.debug.bind(logger);
        this.error = logger.error.bind(logger);
        this.warn = logger.warn.bind(logger);

        this.isInitializing = false;
        this.isInitialized = false;
        this.feeTokenMetadataCache = new Map();
        this.currentFeeTokenMetadata = null;
        this.feeTokenLookupTimeout = null;
        this.feeTokenLookupRequestId = 0;
    }

    async initialize(readOnlyMode = true) {
        if (this.isInitializing) return;
        this.isInitializing = true;

        try {
            const ws = this.ctx.getWebSocket();
            await ws?.waitForInitialization();

            this.contract = ws?.contract;
            if (!this.contract) {
                throw new Error('Contract not initialized');
            }

            this.container.innerHTML = this.render(readOnlyMode);

            if (readOnlyMode) {
                this.isInitialized = true;
                return;
            }

            await this.ensureOwnerAccess();
            await this.loadCurrentFeeConfig();
            this.attachListeners();

            this.isInitialized = true;
        } catch (error) {
            this.error('Failed to initialize admin tab:', error);
            this.showError(`Failed to initialize admin panel: ${error.message}`);
            this.container.innerHTML = `
                <div class="tab-content-wrapper">
                    <h2 class="main-heading">Admin</h2>
                    <p>Unable to load admin panel.</p>
                </div>
            `;
        } finally {
            this.isInitializing = false;
        }
    }

    render(readOnlyMode) {
        if (readOnlyMode) {
            return `
                <div class="tab-content-wrapper">
                    <h2 class="main-heading">Admin</h2>
                    <p>Connect owner wallet to access admin actions.</p>
                </div>
            `;
        }

        return `
            <div class="tab-content-wrapper admin-panel">
                <h2 class="main-heading">Admin</h2>

                <section class="admin-section">
                    <h3>Update Fee Configuration</h3>
                    <p>Change the token and amount charged when creating new orders.</p>
                    <div class="admin-form-grid">
                        <div>
                            <label for="admin-fee-token">Fee token address</label>
                            <input id="admin-fee-token" class="admin-input" type="text" placeholder="0x..." />
                        </div>
                        <div>
                            <label for="admin-fee-amount">Fee amount</label>
                            <input id="admin-fee-amount" class="admin-input" type="text" placeholder="e.g. 1.5" />
                        </div>
                    </div>
                    <div class="admin-form-grid admin-meta-grid">
                        <div>
                            <label for="admin-fee-symbol">Token symbol (retrieved)</label>
                            <input id="admin-fee-symbol" class="admin-input" type="text" placeholder="Auto" readonly />
                        </div>
                        <div>
                            <label for="admin-fee-decimals">Token decimals (retrieved)</label>
                            <input id="admin-fee-decimals" class="admin-input" type="text" placeholder="Auto" readonly />
                        </div>
                    </div>
                    <div class="admin-help-text" id="admin-fee-amount-hint">
                        Enter a normal token amount (for example, 1 or 2). We automatically convert it to base units using the token's decimals.
                    </div>
                    <div class="admin-current" id="admin-current-fee">Current fee config: Loading...</div>
                    <button id="admin-update-fee" class="action-button">Update Fee Config</button>
                </section>

                <section class="admin-section">
                    <h3>Update Allowed Tokens</h3>
                    <p>Choose allow/disallow for each token, then submit all rows together.</p>
                    <label>Action and token address</label>
                    <div id="admin-token-rows" class="admin-token-rows"></div>
                    <button id="admin-add-token" type="button" class="admin-secondary-button">+ Add Token</button>
                    <button id="admin-update-tokens" class="action-button">Update Allowed Tokens</button>
                </section>

                <section class="admin-section admin-danger">
                    <h3>Disable New Orders (Permanent)</h3>
                    <p><strong>Warning:</strong> Disabling the contract prevents new orders forever and cannot be enabled again.</p>
                    <button id="admin-disable-contract" class="action-button">Disable New Orders Permanently</button>
                </section>
            </div>
        `;
    }

    async ensureOwnerAccess() {
        if (DEBUG_CONFIG.ADMIN_BYPASS_OWNER_CHECK) {
            return;
        }

        const wallet = this.ctx.getWallet();
        const signer = await wallet?.getSigner?.();
        if (!signer) {
            throw new Error('No signer available');
        }

        const [ownerAddress, signerAddress] = await Promise.all([
            this.contract.owner(),
            signer.getAddress()
        ]);

        if (ownerAddress.toLowerCase() !== signerAddress.toLowerCase()) {
            throw new Error('Connected wallet is not the contract owner');
        }
    }

    attachListeners() {
        this.updateFeeButton = document.getElementById('admin-update-fee');
        this.updateTokensButton = document.getElementById('admin-update-tokens');
        this.disableButton = document.getElementById('admin-disable-contract');
        this.addTokenButton = document.getElementById('admin-add-token');
        this.tokenRowsContainer = document.getElementById('admin-token-rows');
        this.feeTokenInput = document.getElementById('admin-fee-token');
        this.feeAmountInput = document.getElementById('admin-fee-amount');
        this.feeSymbolInput = document.getElementById('admin-fee-symbol');
        this.feeDecimalsInput = document.getElementById('admin-fee-decimals');
        this.feeAmountHint = document.getElementById('admin-fee-amount-hint');

        this.updateFeeButton?.addEventListener('click', () => this.updateFeeConfig());
        this.updateTokensButton?.addEventListener('click', () => this.updateAllowedTokens());
        this.disableButton?.addEventListener('click', () => this.disableContract());
        this.addTokenButton?.addEventListener('click', () => this.addTokenRow());
        this.feeTokenInput?.addEventListener('input', () => this.scheduleFeeTokenMetadataLookup());
        this.feeTokenInput?.addEventListener('blur', () => this.resolveFeeTokenMetadata());
        this.tokenRowsContainer?.addEventListener('click', (event) => this.handleTokenRowsClick(event));
        this.tokenRowsContainer?.addEventListener('input', (event) => this.handleTokenRowsInput(event));

        this.resetFeeAmountHint();
        this.resetTokenRows();
    }

    updateFeeTokenMetadataDisplay(metadata = null) {
        if (this.feeSymbolInput) {
            this.feeSymbolInput.value = metadata?.symbol || '';
        }
        if (this.feeDecimalsInput) {
            this.feeDecimalsInput.value = metadata?.decimals?.toString?.() || '';
        }
    }

    resetFeeAmountHint() {
        this.setFeeAmountHint(
            'Enter a normal token amount (for example, 1 or 2). We automatically convert it to base units using the token\'s decimals.'
        );
        if (this.feeAmountInput) {
            this.feeAmountInput.placeholder = 'e.g. 1.5';
        }
        this.updateFeeTokenMetadataDisplay(null);
    }

    setFeeAmountHint(message, tone = 'default') {
        if (!this.feeAmountHint) return;

        this.feeAmountHint.textContent = message;
        this.feeAmountHint.classList.remove('is-error', 'is-success');
        if (tone === 'error') this.feeAmountHint.classList.add('is-error');
        if (tone === 'success') this.feeAmountHint.classList.add('is-success');
    }

    scheduleFeeTokenMetadataLookup() {
        if (this.feeTokenLookupTimeout) {
            clearTimeout(this.feeTokenLookupTimeout);
        }
        this.feeTokenLookupTimeout = setTimeout(() => {
            this.resolveFeeTokenMetadata();
        }, 350);
    }

    async getFeeTokenMetadata(tokenAddress) {
        const normalizedAddress = ethers.utils.getAddress(tokenAddress);
        const cacheKey = normalizedAddress.toLowerCase();
        const cachedMetadata = this.feeTokenMetadataCache.get(cacheKey);
        if (cachedMetadata) return cachedMetadata;

        const tokenContract = new ethers.Contract(normalizedAddress, erc20Abi, this.contract.provider);
        const [symbolRaw, decimalsRaw] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.decimals()
        ]);

        const symbol = symbolRaw || 'TOKEN';
        const decimals = Number(decimalsRaw);
        if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
            throw new Error('Invalid token decimals');
        }

        const metadata = { address: normalizedAddress, symbol, decimals };
        this.feeTokenMetadataCache.set(cacheKey, metadata);
        return metadata;
    }

    async resolveFeeTokenMetadata() {
        const feeToken = this.feeTokenInput?.value?.trim();
        if (!feeToken) {
            this.currentFeeTokenMetadata = null;
            this.resetFeeAmountHint();
            return;
        }

        if (!ethers.utils.isAddress(feeToken)) {
            this.currentFeeTokenMetadata = null;
            this.updateFeeTokenMetadataDisplay(null);
            this.setFeeAmountHint(
                'Enter a valid token contract address to auto-load decimals before submitting.',
                'error'
            );
            return;
        }

        const requestId = ++this.feeTokenLookupRequestId;
        this.setFeeAmountHint('Fetching token decimals to convert your amount to base units...');

        try {
            const metadata = await this.getFeeTokenMetadata(feeToken);
            if (requestId !== this.feeTokenLookupRequestId) return;

            this.currentFeeTokenMetadata = metadata;
            if (this.feeAmountInput) {
                this.feeAmountInput.placeholder = `e.g. 1 ${metadata.symbol}`;
            }
            this.setFeeAmountHint(
                `Amount is in ${metadata.symbol} units. Enter values like 1 or 2, and we convert using ${metadata.decimals} decimals before submitting.`,
                'success'
            );
            this.updateFeeTokenMetadataDisplay(metadata);
        } catch (error) {
            if (requestId !== this.feeTokenLookupRequestId) return;

            this.currentFeeTokenMetadata = null;
            this.updateFeeTokenMetadataDisplay(null);
            this.setFeeAmountHint(
                'Could not read token decimals from this address. Verify the token contract address and try again.',
                'error'
            );
            this.warn('Failed to load fee token metadata:', error);
        }
    }

    resetTokenRows() {
        if (!this.tokenRowsContainer) return;
        this.tokenRowsContainer.innerHTML = '';
        this.addTokenRow();
    }

    addTokenRow(value = '') {
        if (!this.tokenRowsContainer) return;

        const row = document.createElement('div');
        row.className = 'admin-token-row';
        row.innerHTML = `
            <select class="admin-select admin-token-action">
                <option value="allow">Allow</option>
                <option value="disallow">Disallow</option>
            </select>
            <input class="admin-input admin-token-address" type="text" placeholder="0x..." value="${value}" />
            <button type="button" class="admin-token-remove">Remove</button>
        `;

        this.tokenRowsContainer.appendChild(row);
        this.refreshTokenRowState();
    }

    handleTokenRowsClick(event) {
        const removeButton = event.target?.closest?.('.admin-token-remove');
        if (!removeButton) return;

        const row = removeButton.closest('.admin-token-row');
        if (!row) return;

        if (this.tokenRowsContainer?.children.length === 1) {
            const input = row.querySelector('.admin-token-address');
            if (input) {
                input.value = '';
                this.clearTokenInputError(input);
                input.focus();
            }
            return;
        }

        row.remove();
        this.refreshTokenRowState();
    }

    handleTokenRowsInput(event) {
        const input = event.target?.closest?.('.admin-token-address');
        if (!input) return;
        this.validateTokenInput(input);
    }

    refreshTokenRowState() {
        const rows = this.tokenRowsContainer
            ? Array.from(this.tokenRowsContainer.querySelectorAll('.admin-token-row'))
            : [];
        const disableRemove = rows.length <= 1;

        rows.forEach((row) => {
            const removeButton = row.querySelector('.admin-token-remove');
            if (removeButton) removeButton.disabled = disableRemove;
        });
    }

    setTokenInputError(input, message) {
        input.classList.add('admin-input-error');
        input.setAttribute('aria-invalid', 'true');
        input.title = message;
    }

    clearTokenInputError(input) {
        input.classList.remove('admin-input-error');
        input.removeAttribute('aria-invalid');
        input.removeAttribute('title');
    }

    validateTokenInput(input) {
        const value = input?.value?.trim();
        if (!value) {
            this.clearTokenInputError(input);
            return true;
        }

        if (!ethers.utils.isAddress(value)) {
            this.setTokenInputError(input, 'Invalid token address');
            return false;
        }

        this.clearTokenInputError(input);
        return true;
    }

    async loadCurrentFeeConfig() {
        const target = document.getElementById('admin-current-fee');
        if (!target) return;

        try {
            const [feeToken, feeAmountRaw] = await Promise.all([
                this.contract.feeToken(),
                this.contract.orderCreationFeeAmount()
            ]);

            const tokenContract = new ethers.Contract(feeToken, erc20Abi, this.contract.provider);
            const [symbol, decimals] = await Promise.all([
                tokenContract.symbol(),
                tokenContract.decimals()
            ]);

            const amountFormatted = ethers.utils.formatUnits(feeAmountRaw, decimals);
            target.textContent = `Current fee config: ${amountFormatted} ${symbol} (${feeToken})`;
        } catch (error) {
            target.textContent = 'Current fee config: Unable to load';
        }
    }

    async updateFeeConfig() {
        const tokenInput = this.feeTokenInput || document.getElementById('admin-fee-token');
        const amountInput = this.feeAmountInput || document.getElementById('admin-fee-amount');
        const feeToken = tokenInput?.value?.trim();
        const feeAmount = amountInput?.value?.trim();

        if (!ethers.utils.isAddress(feeToken)) {
            this.showError('Please enter a valid fee token address.');
            return;
        }

        if (!feeAmount || Number(feeAmount) <= 0 || Number.isNaN(Number(feeAmount))) {
            this.showError('Please enter a valid positive fee amount.');
            return;
        }

        try {
            this.updateFeeButton.disabled = true;
            this.updateFeeButton.textContent = 'Updating...';

            const wallet = this.ctx.getWallet();
            const signer = await wallet.getSigner();
            const metadata = await this.getFeeTokenMetadata(feeToken);
            this.currentFeeTokenMetadata = metadata;
            this.updateFeeTokenMetadataDisplay(metadata);

            let amountInUnits;
            try {
                amountInUnits = ethers.utils.parseUnits(feeAmount, metadata.decimals);
            } catch (parseError) {
                this.showError(
                    `Invalid amount for ${metadata.symbol}. This token supports up to ${metadata.decimals} decimal places.`
                );
                return;
            }

            const tx = await this.contract.connect(signer).updateFeeConfig(metadata.address, amountInUnits);
            await tx.wait();

            if (tokenInput) tokenInput.value = '';
            if (amountInput) amountInput.value = '';
            this.currentFeeTokenMetadata = null;
            this.resetFeeAmountHint();
            await this.loadCurrentFeeConfig();
            this.showSuccess(`Fee configuration updated using ${metadata.decimals} token decimals.`);
        } catch (error) {
            this.error('Failed to update fee config:', error);
            this.showError(`Failed to update fee config: ${error.message}`);
        } finally {
            this.updateFeeButton.disabled = false;
            this.updateFeeButton.textContent = 'Update Fee Config';
        }
    }

    async updateAllowedTokens() {
        const tokenRows = this.tokenRowsContainer
            ? Array.from(this.tokenRowsContainer.querySelectorAll('.admin-token-row'))
            : [];

        const providedTokenCount = tokenRows.reduce((count, row) => {
            const input = row.querySelector('.admin-token-address');
            return count + (input?.value?.trim() ? 1 : 0);
        }, 0);

        if (!providedTokenCount) {
            this.showError('Add at least one token address.');
            return;
        }

        const invalidInput = tokenRows.find((row) => {
            const input = row.querySelector('.admin-token-address');
            const value = input?.value?.trim();
            if (!value) return false;
            return !this.validateTokenInput(input);
        });

        if (invalidInput) {
            this.showError('Please fix invalid token addresses before submitting.');
            return;
        }

        const tokens = [];
        const flags = [];
        const tokenActionMap = new Map();
        let duplicateCount = 0;
        let hasConflictingDuplicate = false;

        tokenRows.forEach((row) => {
            const input = row.querySelector('.admin-token-address');
            const actionInput = row.querySelector('.admin-token-action');
            const value = input.value.trim();
            if (!value) return;

            const normalizedAddress = ethers.utils.getAddress(value);
            const key = normalizedAddress.toLowerCase();
            const allow = actionInput?.value !== 'disallow';
            const existing = tokenActionMap.get(key);

            if (existing !== undefined) {
                if (existing !== allow) {
                    duplicateCount += 1;
                    hasConflictingDuplicate = true;
                    this.showError(`Conflicting actions found for token ${normalizedAddress}. Keep only one action per token.`);
                    return;
                }
                duplicateCount += 1;
                return;
            }

            tokenActionMap.set(key, allow);
            tokens.push(normalizedAddress);
            flags.push(allow);
        });

        if (hasConflictingDuplicate) {
            return;
        }

        if (!tokens.length) {
            return;
        }

        try {
            this.updateTokensButton.disabled = true;
            this.updateTokensButton.textContent = 'Updating...';

            const wallet = this.ctx.getWallet();
            const signer = await wallet.getSigner();
            const tx = await this.contract.connect(signer).updateAllowedTokens(tokens, flags);
            await tx.wait();

            if (duplicateCount > 0 || tokens.length < providedTokenCount) {
                this.showInfo('Duplicate token addresses were ignored.');
            }

            this.resetTokenRows();
            this.showSuccess('Allowed tokens updated.');
        } catch (error) {
            this.error('Failed to update allowed tokens:', error);
            this.showError(`Failed to update allowed tokens: ${error.message}`);
        } finally {
            this.updateTokensButton.disabled = false;
            this.updateTokensButton.textContent = 'Update Allowed Tokens';
        }
    }

    async disableContract() {
        const confirmed = window.confirm(
            'Disabling new orders is permanent and cannot be undone. Continue?'
        );
        if (!confirmed) return;

        try {
            this.disableButton.disabled = true;
            this.disableButton.textContent = 'Disabling...';

            const wallet = this.ctx.getWallet();
            const signer = await wallet.getSigner();
            const tx = await this.contract.connect(signer).disableContract();
            await tx.wait();

            this.disableButton.textContent = 'Contract Disabled';
            this.showSuccess('New orders are now permanently disabled.');
        } catch (error) {
            this.error('Failed to disable contract:', error);
            this.showError(`Failed to disable contract: ${error.message}`);
            this.disableButton.disabled = false;
            this.disableButton.textContent = 'Disable New Orders Permanently';
        }
    }
}
