import { BaseComponent } from './BaseComponent.js';
import { ethers } from 'ethers';
import { erc20Abi } from '../abi/erc20.js';
import { createLogger } from '../services/LogService.js';

export class Admin extends BaseComponent {
    constructor() {
        super('admin');

        const logger = createLogger('ADMIN');
        this.debug = logger.debug.bind(logger);
        this.error = logger.error.bind(logger);
        this.warn = logger.warn.bind(logger);

        this.isInitializing = false;
        this.isInitialized = false;
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
                            <input id="admin-fee-token" type="text" placeholder="0x..." />
                        </div>
                        <div>
                            <label for="admin-fee-amount">Fee amount</label>
                            <input id="admin-fee-amount" type="text" placeholder="e.g. 1.5" />
                        </div>
                    </div>
                    <div class="admin-current" id="admin-current-fee">Current fee config: Loading...</div>
                    <button id="admin-update-fee" class="action-button">Update Fee Config</button>
                </section>

                <section class="admin-section">
                    <h3>Update Allowed Tokens</h3>
                    <p>Enter one token address per line, then choose whether to allow or disallow all of them.</p>
                    <label for="admin-token-list">Token addresses</label>
                    <textarea id="admin-token-list" rows="6" placeholder="0x...\n0x..."></textarea>
                    <label for="admin-token-action">Action</label>
                    <select id="admin-token-action">
                        <option value="allow">Allow tokens</option>
                        <option value="disallow">Disallow tokens</option>
                    </select>
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

        this.updateFeeButton?.addEventListener('click', () => this.updateFeeConfig());
        this.updateTokensButton?.addEventListener('click', () => this.updateAllowedTokens());
        this.disableButton?.addEventListener('click', () => this.disableContract());
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
        const tokenInput = document.getElementById('admin-fee-token');
        const amountInput = document.getElementById('admin-fee-amount');
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
            const tokenContract = new ethers.Contract(feeToken, erc20Abi, this.contract.provider);
            const decimals = await tokenContract.decimals();
            const amountInUnits = ethers.utils.parseUnits(feeAmount, decimals);

            const tx = await this.contract.connect(signer).updateFeeConfig(feeToken, amountInUnits);
            await tx.wait();

            if (tokenInput) tokenInput.value = '';
            if (amountInput) amountInput.value = '';
            await this.loadCurrentFeeConfig();
            this.showSuccess('Fee configuration updated.');
        } catch (error) {
            this.error('Failed to update fee config:', error);
            this.showError(`Failed to update fee config: ${error.message}`);
        } finally {
            this.updateFeeButton.disabled = false;
            this.updateFeeButton.textContent = 'Update Fee Config';
        }
    }

    async updateAllowedTokens() {
        const listInput = document.getElementById('admin-token-list');
        const actionInput = document.getElementById('admin-token-action');

        const rawLines = listInput?.value?.split('\n') || [];
        const tokens = [...new Set(rawLines.map(line => line.trim()).filter(Boolean))];
        if (!tokens.length) {
            this.showError('Add at least one token address.');
            return;
        }

        const invalid = tokens.find(addr => !ethers.utils.isAddress(addr));
        if (invalid) {
            this.showError(`Invalid token address: ${invalid}`);
            return;
        }

        const allow = actionInput?.value !== 'disallow';
        const flags = tokens.map(() => allow);

        try {
            this.updateTokensButton.disabled = true;
            this.updateTokensButton.textContent = 'Updating...';

            const wallet = this.ctx.getWallet();
            const signer = await wallet.getSigner();
            const tx = await this.contract.connect(signer).updateAllowedTokens(tokens, flags);
            await tx.wait();

            if (listInput) listInput.value = '';
            this.showSuccess(`Allowed tokens updated (${allow ? 'allow' : 'disallow'}).`);
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
