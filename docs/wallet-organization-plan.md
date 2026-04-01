# Wallet Organization Plan

## Issue Ordering Note

Before executing the broader no-behavior-change organization pass in this document, the active wallet/network behavior issues should be handled first.

Recommended order:

1. `#147` Fix connected startup/connect flow defaulting to `View Orders`
2. `#153` Make header/network selector reflect wallet connection only
3. `#154` Decouple connected UI state from wallet network
4. Treat `#152` as the umbrella tracking issue for the behavior change above
5. Defer `#106` EIP-6963 wallet discovery and explicit wallet selection until after the decoupling work and after at least a light internal cleanup

Why this order:

- `#147`, `#153`, and `#154` define the behavior contract the wallet architecture should support
- reorganizing first would risk preserving or reinforcing the current coupled wallet/network model
- `#106` is structurally larger and is safer after connection state and selected-network state are already decoupled

Practical interpretation:

- use this document as a guardrail while implementing `#147`, `#153`, and `#154`
- do not treat the rest of this document as a prerequisite project before those issues
- revisit the organization phases below immediately after the decoupling work lands

## Goal

Reorganize the WhaleSwap wallet code so it is easier to reason about, easier to test, and closer to the bridge repo's separation of concerns.

This plan is intentionally for a no-behavior-change pass first.

## Non-Goals

- Do not add multi-wallet behavior yet.
- Do not change the current user-facing connect/disconnect flow yet.
- Do not rename public wallet events yet.
- Do not change chain-selector behavior in this pass.
- Do not move to a shared library in this pass.

## Current Shape

```text
WhaleSwap-UI
============
wallet concerns are mostly collapsed into fewer files

js/services/WalletManager.js
  provider resolution
  request/requestWithTimeout
  auto-connect
  signer init
  contract init
  network switching
  wallet events
  disconnect preference

js/components/WalletUI.js
  connect button
  initial wallet/session sync
  direct wallet state recovery
  connected-wallet chip
  popup
  disconnect UI

js/app.js
  wallet event fan-out
  network badge sync
  tab visibility / component reinit
```

## Why Reorganize Before Multi-Wallet

The bridge repo already has a cleaner split:

```text
liberdus-bsc-bridge-ui
======================
js/wallet/metamask-connector.js
  discovery
  provider normalization
  explicit wallet selection

js/wallet/wallet-manager.js
  connected session state
  restore/disconnect
  wallet events

js/wallet/network-manager.js
  network gating and switching

js/components/header.js
  connect button + wallet picker

js/wallet/wallet-popup.js
  connected-wallet popup
```

WhaleSwap does not need to match the bridge repo file-for-file, but it should converge on the same boundaries.

## Main Problems In The Current WhaleSwap Layout

1. `js/services/WalletManager.js` owns too many unrelated responsibilities.
2. `js/components/WalletUI.js` does more than rendering and interaction; it also performs low-level recovery work and mutates wallet state directly.
3. `js/app.js` reacts to wallet events at a useful level, but it currently depends on a manager that mixes provider, session, contract, and network logic together.
4. The current shape makes later multi-wallet work harder because provider discovery and selected-wallet state are not isolated.

## Recommended Target Shape

The goal is a bridge-like separation, while preserving the current WhaleSwap public behavior.

```text
WhaleSwap-UI
============
js/services/wallet/
  injected-provider.js
    resolve injected provider
    request helpers
    EIP-1193 access

  wallet-session.js
    account
    chainId
    connect
    restore
    disconnect
    event emitter
    disconnect preference

  wallet-network.js
    switchToNetwork
    chain normalization

js/services/WalletManager.js
  compatibility facade
  composes the wallet/* modules above
  preserves current public methods/events during refactor

js/components/WalletUI.js
  connect button
  connected chip
  popup
  toast/error UI
  no direct wallet-state mutation

js/app.js
  listens to stable wallet-session events only
```

## Recommended Rules During The Refactor

1. Keep `js/services/WalletManager.js` as the public facade until the reorganization settles.
2. Move internals behind the facade first; do not force broad call-site rewrites on day one.
3. Preserve the current event names:
   - `connect`
   - `disconnect`
   - `accountsChanged`
   - `chainChanged`
4. Preserve the current public methods where practical:
   - `init()`
   - `connect()`
   - `disconnect()`
   - `switchToNetwork()`
   - `getAccount()`
   - `getSigner()`
   - `getProvider()`
   - `hasInjectedProvider()`
5. Do not mix contract initialization concerns into the new provider-discovery/session modules.

## Suggested Refactor Phases

## Phase 1: Freeze The Current Public Contract

Document the public surface of `js/services/WalletManager.js` and treat it as the compatibility layer for the internal reorganization.

Deliverable:

- A stable list of methods, fields, and events that outside code depends on.

## Phase 2: Extract Provider Access Concerns

Move these concerns out of the large manager and into a focused helper under `js/services/wallet/`:

- provider resolution
- `request()`
- `requestWithTimeout()`
- injected provider capability checks

Candidate source responsibilities today:

- `resolveInjectedProvider()`
- `getInjectedProvider()`
- `hasInjectedProvider()`
- `request()`
- `requestWithTimeout()`

## Phase 3: Extract Session Concerns

Move these concerns into a dedicated wallet-session module:

- account state
- chain state
- connect
- auto-restore
- disconnect preference
- session event emission

The facade can keep forwarding the same methods to avoid breaking the app.

## Phase 4: Extract Network Switching

Move chain switching and chain normalization into a dedicated network helper:

- `switchToNetwork()`
- chain id normalization helpers

This keeps session logic from owning app network policy.

## Phase 5: Simplify `WalletUI`

`WalletUI` should become mostly rendering and interaction glue.

It should not:

- write `walletManager.account`
- write `walletManager.chainId`
- write `walletManager.isConnected`
- perform low-level restore probing that belongs in the session layer

## Phase 6: Reassess Library Readiness

After the internal boundaries are stable, decide whether the session/discovery layer is now generic enough to share.

At that point, the likely shared piece is:

- provider discovery
- selected provider state
- connect/restore/disconnect
- event emission

The likely app-specific pieces remain:

- WhaleSwap popup UI
- WhaleSwap network-selection UX
- WhaleSwap contract initialization details
- WhaleSwap app-level tab and badge reactions

## What Should Probably Stay Out Of The Shared Library

- `WalletUI` markup and popup rendering
- app toasts and copy
- app network badge behavior
- app tab visibility logic
- contract construction for WhaleSwap-specific contracts

## Minimal Success Criteria For This Reorganization Pass

1. No functional behavior change.
2. Existing tests continue to pass.
3. `WalletManager.js` becomes a composition layer instead of the place where every wallet concern lives.
4. `WalletUI.js` stops directly repairing wallet state.
5. The codebase becomes structurally ready for a later multi-wallet port.

## Notes For The Later Multi-Wallet Port

Once the reorganization above is complete, the bridge-style multi-wallet flow can be ported with much less risk:

1. Add discovery of multiple injected wallets.
2. Add a picker UI before `eth_requestAccounts`.
3. Keep the WhaleSwap facade methods/events stable.
4. Let the app continue to listen to the same high-level events.
