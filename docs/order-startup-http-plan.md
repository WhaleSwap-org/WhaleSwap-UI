# Order Startup HTTP Snapshot Plan

## Goal

Make app startup independent of WebSocket health.

Use HTTP RPC for the initial order snapshot and contract reads. Use WebSocket only for live events after the initial snapshot is already loaded.

This is the smallest safe fix for the current startup instability.

## Why This Change

Current startup order loading is brittle because:

- `WebSocketService.initialize()` opens the WebSocket first and startup order sync waits on it.
- Initial order reads use the WebSocket-backed provider for both multicall and per-order fallback.
- When the WebSocket RPC is slow or overloaded, multicall times out and the fallback hits the same unhealthy transport again.
- Partial order fetches are currently treated as a completed sync, so the UI can render with an incomplete cache.

The codebase already has an HTTP startup-safe read pattern in `ContractService._readViaHttpRpc()`. This plan reuses that model instead of inventing a second startup architecture.

## Target End State

- Startup order snapshot is loaded over HTTP RPC.
- The app can render orders without waiting for WebSocket connection readiness.
- WebSocket connects in the background after the HTTP snapshot starts or completes.
- Live event listeners are attached only after the WebSocket is ready.
- A post-connect reconcile pass closes the gap between the HTTP snapshot and event subscription start.

## Smallest Safe Fix

### Phase 1: Reuse Existing HTTP Read Infrastructure

Purpose: reuse the existing HTTP startup path rather than creating a separate one-off implementation.

Scope:

- Extend `ContractService` to expose reusable HTTP read helpers for the order startup flow.
- Keep the retry chain consistent with existing network config: `rpcUrl` first, then `fallbackRpcUrls`.
- Avoid changing live event behavior in this phase.

Planned changes:

- Add a reusable HTTP provider accessor or helper in `js/services/ContractService.js`.
- Reuse the existing HTTP fallback sequence already used by:
  - `getAllowedTokens()`
  - `getAllowedTokensCount()`
- Make multicall able to run against a caller-supplied provider instead of implicitly using `contractService.getProvider()`.

Likely files:

- `js/services/ContractService.js`
- `js/services/MulticallService.js`

Acceptance criteria:

- We can execute contract reads over HTTP using the same primary and fallback RPC list already defined in `js/config/networks.js`.
- Multicall can be directed to HTTP instead of inheriting the WebSocket provider.

### Phase 2: Move Startup Snapshot Reads Off WebSocket

Purpose: remove WebSocket from the startup critical path for read-only initialization data.

Scope:

- Startup snapshot reads use HTTP for:
  - `firstOrderId`
  - `nextOrderId`
  - `ORDER_EXPIRY`
  - `GRACE_PERIOD`
  - batched order reads
  - per-order fallback reads
- Expand the same transport rule to other read-only startup data that does not require subscriptions, including:
  - contract parameter reads
  - fee config reads
  - startup token metadata reads
- Startup order sync no longer requires WebSocket initialization first.

Planned changes:

- Introduce an HTTP-backed startup snapshot path in `js/services/WebSocket.js` or a dedicated helper used by it.
- Read the initial order range over HTTP.
- Run multicall over HTTP when configured.
- If multicall is unavailable or fails, fall back to individual HTTP reads instead of WebSocket reads.
- Move other read-only startup snapshot data to the same HTTP path.
- Mark order sync complete based on the HTTP snapshot result, not on WebSocket readiness.

Important implementation rule:

- Do not keep a fake "fallback" that still uses the same WebSocket provider. Startup fallback must stay on HTTP once the snapshot flow begins.

Likely files:

- `js/services/WebSocket.js`
- `js/services/ContractService.js`
- `js/services/MulticallService.js`

Acceptance criteria:

- The app can load startup snapshot data even if WebSocket connection is slow or unavailable.
- Startup no longer blocks on WebSocket handshake before fetching orders and other read-only startup data.
- HTTP multicall and HTTP fallback reads both work across configured RPC fallbacks.

### Phase 3: Start WebSocket In Background And Reconcile Once

Purpose: keep live updates without reintroducing startup dependence on WebSocket.

Problem:

- If the HTTP snapshot finishes before WebSocket listeners are attached, orders can change in the gap.

Smallest safe approach:

- Start WebSocket connection in the background after startup snapshot begins or immediately after it completes.
- Attach event listeners once WebSocket is ready.
- After listeners are attached, run one HTTP reconcile pass to close the gap.

Recommended reconcile strategy for the smallest safe fix:

- Perform one additional HTTP snapshot sync after WebSocket listeners are live.
- Merge the refreshed snapshot into cache idempotently.

Why this is the smallest safe option:

- It avoids implementing log replay in the first pass.
- It closes the startup gap without relying on WebSocket timing.
- Duplicate reads are acceptable during startup and simpler than building a block-based replay flow immediately.
- It avoids introducing extra heuristic logic into the first version of the design.

Future optimization, not required for the first fix:

- Replace the second full snapshot with block-based event replay from a captured snapshot block.

Likely files:

- `js/services/WebSocket.js`
- `js/app.js`

Acceptance criteria:

- Order cache is populated from HTTP before live updates depend on WebSocket.
- WebSocket listener attachment does not create a durable event gap.
- A late WebSocket connection does not prevent startup content from rendering.

### Phase 4: Harden Partial-Failure Semantics

Purpose: avoid silently treating incomplete startup data as fully correct.

Scope:

- Track whether a startup sync had read failures.
- Distinguish:
  - full snapshot success
  - partial snapshot success
  - snapshot failure

Planned changes:

- Record per-batch or per-order failures during startup.
- Do not silently bless a partial cache as equivalent to a clean sync.
- Emit clearer logging and possibly a retryable state for startup data quality.

This phase can land after the transport split if needed, but it should be part of the rollout.

Acceptance criteria:

- We can tell whether startup completed cleanly or only partially.
- The UI and logs can distinguish degraded startup from successful startup.

## Edge Cases To Handle

### Event Gap Between Snapshot And Listener Attachment

Risk:

- Orders can be created, filled, canceled, or cleaned up after the HTTP snapshot but before WebSocket listeners are active.

Handling for smallest safe fix:

- Run one post-listener HTTP reconcile pass.

### Networks Without Multicall

Risk:

- Some networks in config have no `multicallAddress`.

Handling:

- Skip multicall immediately and use individual HTTP reads.
- Do not bounce back to WebSocket just because multicall is unavailable.

### HTTP Primary RPC Failure

Risk:

- The first HTTP endpoint can fail or stall.

Handling:

- Reuse the existing `rpcUrl` -> `fallbackRpcUrls` chain from `ContractService`.

### WebSocket Never Connects

Risk:

- Live updates are unavailable.

Handling:

- Startup still succeeds from HTTP snapshot.
- WebSocket reconnect remains a background concern and should not block initial render.

### Partial Startup Reads

Risk:

- Some order reads can fail while others succeed.

Handling:

- Track failures explicitly.
- Do not treat "some orders loaded" as equivalent to "snapshot is fully correct".
- Reconcile again after WebSocket listeners are attached.

### Duplicate Data During Reconcile

Risk:

- The second HTTP sync can reread orders that are already in cache.

Handling:

- Cache writes are keyed by order id, so overwriting the same order should be idempotent.

### Network Switch During Startup

Risk:

- A sync started on one network can complete after the user has switched networks.

Handling:

- Guard startup completions with the active network identity.
- Ignore stale completions from a prior network.

### Cleanup Or Navigation During In-Flight Startup

Risk:

- The app can tear down the service while HTTP snapshot or WebSocket connection is still in flight.

Handling:

- Ignore stale completions after cleanup.
- Avoid mutating cache or subscribers from torn-down startup work.

### Snapshot Range Drift

Risk:

- `nextOrderId` can advance while startup is fetching the earlier range.

Handling:

- Accept the initial HTTP snapshot as a point-in-time baseline.
- Let the post-listener reconcile capture anything created during the drift window.

## Additional Issues Confirmed During Local Testing

The temporary local patch improved order snapshot stability, but it also confirmed that startup still contains several other read-only paths that depend on the WebSocket provider and can still trigger `evm timeout` errors.

These should be included in the broader startup transport split.

### What Worked In The Local HTTP Query Test

The local experiment changed only the order snapshot transport:

- batched order reads used HTTP RPC multicall instead of the WebSocket provider
- per-order fallback reads also used HTTP RPC instead of the WebSocket provider

Observed result:

- the order sync path completed successfully for the tested startup range
- the prior order-loading failure mode did not reproduce in the same way
- logs showed the batch finishing cleanly and all 7 orders in the startup range being retrieved
- the app successfully populated the order cache and emitted `orderSyncComplete`

What this validates:

- moving heavy startup order reads off WebSocket materially improves stability
- the main hypothesis was correct: WebSocket was the wrong transport for startup batch reads
- HTTP RPC is a better fit for startup snapshot loading than the current WebSocket-first path

What it did not solve:

- other startup reads still performed over WebSocket continued to produce `evm timeout` errors
- this means the transport split needs to cover more than just order snapshot reads

Conclusion from the local test:

- the approach works
- the initial patch direction is validated
- the remaining errors now identify the next startup read paths that still need to move to HTTP

### Confirmed Remaining WebSocket Startup Reads

#### ContractParams Still Uses WebSocket For Snapshot Reads

`ContractParams` performs a burst of read-only calls during initialization, including:

- `orderCreationFeeAmount`
- `firstOrderId`
- `nextOrderId`
- `isDisabled`
- `feeToken`
- `owner`
- `GRACE_PERIOD`
- `ORDER_EXPIRY`
- `getAllowedTokensCount`

Current behavior:

- These calls are launched through `ws.queueRequest(() => contract[method]())`.
- They are read-only startup data and do not require WebSocket.
- Local logs showed `nextOrderId()` and `ORDER_EXPIRY()` timing out over WebSocket even after order snapshot reads were moved to HTTP.

Implication:

- Moving only order snapshot reads to HTTP is not enough to remove startup instability.
- `ContractParams` should move to the same HTTP query path.

#### Fee Configuration Reads Still Use WebSocket

Several components still fetch fee configuration directly from the WebSocket-backed contract during startup or early render:

- `Intro`
- `CreateOrder`
- `Cleanup`
- `Admin`

These reads include:

- `feeToken()`
- `orderCreationFeeAmount()`

Some of those flows also fetch ERC20 metadata immediately afterward.

Implication:

- Startup fee configuration should be treated as HTTP snapshot data.
- WebSocket is unnecessary for these reads and remains a source of startup timeouts.

#### Token Metadata Reads Still Use WebSocket

`getTokenInfo()` still reads token metadata using the WebSocket provider and fans out:

- `symbol()`
- `decimals()`
- `name()`

This is especially important because startup order enrichment and fee config display both depend on token metadata.

Implication:

- Token metadata needed for startup display should also move to HTTP or be populated from cached snapshot state.

### WebSocket Queue Is Not Enforcing Its Concurrency Limit

Local logs showed `Making request (active: 10)` even though the service intends to cap concurrency to 2.

Implication:

- The current `queueRequest()` gating is race-prone.
- Multiple callers can pass the concurrency check before `activeRequests` is incremented.
- This allows startup bursts to overload the WebSocket provider even when the code appears to be rate-limited.

Why this matters even after moving startup reads to HTTP:

- WebSocket event-time reads and any remaining WS calls can still stampede the provider.
- The queue bug is a correctness issue on its own and should be fixed regardless of the transport split.

Recommended action:

- Replace the current polling gate with an actual serialized queue or permit-based scheduler.

### Duplicate Startup Reads Across Components

Multiple components independently fetch overlapping startup data, especially:

- fee token
- order creation fee
- token metadata

This duplication increases burst load and multiplies timeout surface area.

Implication:

- Even after moving reads to HTTP, duplicated startup fetching can still create avoidable load and complexity.

Recommended action:

- Centralize startup snapshot reads where practical.
- Cache fee config and token metadata so components reuse the same startup result instead of re-fetching.

## Expanded Migration Scope

The original smallest safe fix focused on order snapshot reads. Local testing shows the true stable boundary should be:

- HTTP for all startup snapshot reads
- WebSocket for live events only

That means the migration scope should include:

- initial order snapshot reads
- contract parameter snapshot reads
- fee config snapshot reads
- startup token metadata reads
- other read-only startup contract calls that do not require subscriptions

## Updated Rollout Priorities

After the initial order snapshot patch, the next highest-priority migrations are:

1. Move `ContractParams` reads to HTTP.
2. Move startup fee config reads in `Intro`, `CreateOrder`, `Cleanup`, and `Admin` to HTTP.
3. Move startup token metadata reads to HTTP or shared cached startup state.
4. Fix `queueRequest()` so it enforces real concurrency limits.
5. Consolidate duplicate startup reads where possible.

## Issue / PR Breakdown

The architectural phases above should remain as-is.

For implementation and review, the work should be split by write scope and dependency rather than using the phases directly as PR boundaries.

This keeps PRs smaller, reduces overlap, and avoids multiple PRs editing the same files at the same time.

### 01. HTTP Read Foundation

Primary scope:

- `js/services/ContractService.js`
- `js/services/MulticallService.js`

Goal:

- provide reusable HTTP RPC read helpers
- support multicall on a caller-supplied HTTP provider

Depends on:

- none

### 02. Order Snapshot Over HTTP

Primary scope:

- `js/services/WebSocket.js`
- order sync tests

Goal:

- move batched order snapshot reads to HTTP
- move per-order fallback reads to HTTP

Depends on:

- `01. HTTP Read Foundation`

### 03. Contract Params Over HTTP

Primary scope:

- `js/components/ContractParams.js`

Goal:

- move startup contract parameter reads off WebSocket

Depends on:

- `01. HTTP Read Foundation`

### 04. Fee Config And Startup Token Metadata Over HTTP

Primary scope:

- `js/components/Intro.js`
- `js/components/CreateOrder.js`
- `js/components/Cleanup.js`
- `js/components/Admin.js`
- `js/services/WebSocket.js`
- possibly a shared token metadata helper or cache layer

Goal:

- move fee token and order creation fee startup reads off WebSocket
- move startup token metadata reads off WebSocket
- reduce duplicate fee-config and token metadata reads during startup

Depends on:

- `01. HTTP Read Foundation`

### 05. Fix WebSocket Queue Correctness

Primary scope:

- `js/services/WebSocket.js`

Goal:

- replace the race-prone concurrency gate with a real queue or permit-based limiter

Depends on:

- none strictly required

Note:

- this can be done earlier, but review is often clearer once the largest startup read bursts are already off WebSocket

### 06. Decouple Startup From WebSocket Readiness

Primary scope:

- `js/services/WebSocket.js`
- `js/app.js`

Goal:

- allow startup snapshot loading to complete before WebSocket is required
- move WebSocket to background startup for live events

Depends on:

- `01. HTTP Read Foundation`
- `02. Order Snapshot Over HTTP`
- ideally `03-04` as well

### 07. Post-Connect Reconcile And Partial-Failure Semantics

Primary scope:

- `js/services/WebSocket.js`
- tests

Goal:

- close the snapshot-to-listener event gap
- distinguish full success, partial success, and failure

Depends on:

- `06. Decouple Startup From WebSocket Readiness`

## Recommended PR Order

If issues and PRs are numbered, they should follow dependency order:

1. `01: HTTP read foundation`
2. `02: Order snapshot over HTTP`
3. `03: Contract params over HTTP`
4. `04: Fee config and startup token metadata over HTTP`
5. `05: Fix WebSocket queue correctness`
6. `06: Decouple startup from WebSocket readiness`
7. `07: Post-connect reconcile and partial-failure semantics`

## Why PR Order Differs From Phase Order

The phase order describes the architecture progression.

The PR order describes the least-overlapping review sequence.

They are related, but they are not the same thing:

- phases explain the design
- PR ordering explains how to land the design safely

## Updated Non-Goals Clarification

Moving startup reads to HTTP does not mean:

- replacing WebSocket for event subscriptions
- replacing WebSocket for write flows
- removing reconnect logic

The goal remains:

- WebSocket for subscriptions and live updates
- HTTP for startup snapshot and read-heavy initialization

## Proposed Rollout Order

1. Refactor HTTP read utilities so they can be reused by startup order sync.
2. Add HTTP-backed multicall support.
3. Move startup order snapshot off WebSocket.
4. Decouple startup rendering from WebSocket readiness.
5. Start WebSocket in the background.
6. Add one post-listener HTTP reconcile pass.
7. Harden partial-failure semantics and tests.

## Testing Plan

Add or expand tests for:

- startup snapshot succeeds when WebSocket is unavailable
- startup snapshot uses HTTP fallback RPCs when primary HTTP RPC fails
- no-multicall networks fall back to individual HTTP reads
- WebSocket connects after startup and triggers one reconcile pass
- stale completion from prior network is ignored
- partial startup read does not get silently treated as a clean full sync
- duplicate reconcile writes remain idempotent

Likely test files:

- `tests/websocket.orderSyncRange.test.js`
- new startup-specific tests around HTTP snapshot vs WebSocket readiness

## Non-Goals For The First Fix

- Replacing all WebSocket usage with HTTP
- Rebuilding the live event architecture
- Implementing block-based event replay immediately
- Solving every degraded-RPC scenario in one patch

## Summary

The simplest correct fix is:

- keep HTTP for startup snapshot reads
- keep WebSocket for live events
- stop waiting on WebSocket before loading orders
- reconcile once after listeners attach

This reuses infrastructure the repo already has, removes the unstable transport from startup, and keeps the first implementation small enough to land safely.
