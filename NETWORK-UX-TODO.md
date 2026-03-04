# Network UX TODO

## Working model

- Keep `selected app chain` separate from `wallet active chain`.
- Default `selected app chain` to Polygon when there is no explicit user choice.
- When a wallet session is restored and no `?chain=` is present, follow the restored wallet chain.
- Do not infer `network added to wallet` from the wallet's current chain.
- Treat `wallet_switchEthereumChain` as the authoritative check:
  - success means the wallet switched
  - error `4902` means the wallet does not recognize the chain and we should offer `wallet_addEthereumChain`

## Decisions made

- The header should not show a persistent `Add Network` button based on chain mismatch alone.
- The network selector remains the primary chain-switch entry point in the header.
- A session-only `Add Network` retry button may appear after a real `4902` / failed add-network flow for the selected chain.
- The app should auto-align to the restored wallet chain when there is no `?chain=` in the URL.

## Tasks

- Keep the existing `switch -> 4902 -> add -> switch` flow in `WalletManager`.
- Only show red `setup needed` status and "add network" messaging after a real `4902` from the wallet.
- Decide selected-chain policy:
  - chosen: strict default to Polygon on a fresh load
  - chosen: follow restored wallet chain when no URL is present
- Audit balance reads so selected-chain balances use app-controlled RPC, not the injected wallet provider.
- Audit native balance reads separately from ERC-20 balance reads.
- Decide whether to persist the user's last selected chain in storage.

## Balance investigation notes

- Some selected-chain balance reads already use WhaleSwap's own network provider:
  - `js/services/WebSocket.js` creates a provider from the selected network config.
  - `js/services/ContractService.js` exposes that provider.
  - `js/utils/contractTokens.js` reads `balanceOf` via `contractService.getProvider()`.
- Some component code still defaults to the injected wallet provider:
  - `js/components/BaseComponent.js` uses `wallet.provider` unless overridden.
- `js/components/CreateOrder.js` overrides its provider with the WebSocket provider, so its token lookups are already aligned to the selected app chain.

## What balance success does and does not prove

- If a balance call succeeds through WhaleSwap's own RPC, that does not prove the network is added in MetaMask.
- If a balance call succeeds through the injected wallet provider, that only proves the wallet can answer on its currently active chain.
- Balance success is not a reliable signal for "network added to wallet".
