# Issue #171 Checklist: Minimum Viable Startup Stability Fix

## Overview
This checklist tracks what has been addressed and what remains from issue #171.

**Issue:** https://github.com/WhaleSwap-org/WhaleSwap-UI/issues/171  
**PR #172:** Fix startup order snapshot by moving reads off WebSocket (MERGED)

---

## ✅ ADDRESSED (via PR #172)

### 01: HTTP Read Foundation
- [x] Added `_readViaHttpRpc()` in `ContractService.js`
- [x] Made multicall provider-injectable for HTTP reads
- [x] HTTP RPC read helpers support primary and fallback RPC URLs

### 02: Order Snapshot Over HTTP
- [x] `firstOrderId` reads over HTTP
- [x] `nextOrderId` reads over HTTP
- [x] `ORDER_EXPIRY` reads over HTTP
- [x] `GRACE_PERIOD` reads over HTTP
- [x] Batched order reads via multicall over HTTP
- [x] Per-order fallback reads over HTTP
- [x] Token metadata reads during order enrichment use HTTP

### 05: Fix WebSocket Queue Correctness (Partial)
- [x] Fixed `queueRequest()` to enforce actual concurrency limits
- [x] Prevents race condition where multiple callers pass concurrency check

### 06: Decouple Startup From WebSocket Readiness (Partial)
- [x] Read-only/disconnected boot path no longer waits for WebSocket
- [x] `waitForOrderSync()` doesn't wait for WebSocket initialization before snapshot

---

## ❌ NOT ADDRESSED

### 03: Contract Params Over HTTP
**Status:** NOT IMPLEMENTED

**Current Issue:**
- `ContractParams.js` still uses `ws.queueRequest()` for contract parameter reads
- Location: `js/components/ContractParams.js` line 251

**Methods still using WebSocket:**
- `orderCreationFeeAmount()`
- `firstOrderId()`
- `nextOrderId()`
- `isDisabled()`
- `feeToken()`
- `owner()`
- `GRACE_PERIOD()`
- `ORDER_EXPIRY()`
- `getAllowedTokensCount()`

**Impact:**
- Opening ContractParams tab can still trigger WebSocket timeouts
- Startup instability when ContractParams is accessed

---

### 04: Fee Config And Startup Token Metadata Over HTTP
**Status:** NOT IMPLEMENTED

**Current Issues:**

#### Intro.js
- Location: `js/components/Intro.js` lines 36-37
- Still uses `ws.queueRequest()` for:
  - `ws.contract.feeToken()`
  - `ws.contract.orderCreationFeeAmount()`

#### CreateOrder.js
- Location: `js/components/CreateOrder.js` lines 1144, 1147
- Still uses `this.contract.feeToken()` and `this.contract.orderCreationFeeAmount()` directly
- These use the WebSocket provider

#### Cleanup.js
- Location: `js/components/Cleanup.js` lines 262-263
- Still uses `this.webSocket.contract.feeToken()` and `this.webSocket.contract.orderCreationFeeAmount()`

#### Admin.js
- Needs verification for fee config reads

**Impact:**
- Fee config reads can still trigger WebSocket timeouts
- Startup instability when these components initialize

---

### 06: Decouple Startup From WebSocket Readiness (Remaining)
**Status:** PARTIALLY IMPLEMENTED

**What's Done:**
- [x] Read-only/disconnected boot path decoupled

**What's Missing:**
- [ ] Connected boot path still depends on WebSocket readiness
- [ ] `CreateOrder` currently depends on `ws.contract` / `ws.provider`
- [ ] Changing this would significantly widen scope

---

### 07: Post-Connect Reconcile And Partial-Failure Semantics
**Status:** NOT IMPLEMENTED

**Missing Features:**
- [ ] Post-listener HTTP reconcile pass to close event gap
- [ ] Distinguish full snapshot success vs partial success vs failure
- [ ] Track per-batch or per-order failures during startup
- [ ] Emit clearer logging for startup data quality
- [ ] Retryable state for degraded startup

**Impact:**
- Event gap between HTTP snapshot and WebSocket listener attachment not handled
- Partial startup failures not clearly communicated

---

## Summary

### Minimum Viable Fix Set (from issue #171)
| Item | Status |
|------|--------|
| 01: HTTP read foundation | ✅ DONE |
| 02: Order snapshot over HTTP | ✅ DONE |
| 03: Contract params over HTTP | ❌ NOT DONE |

### Additional Items
| Item | Status |
|------|--------|
| 04: Fee config and token metadata over HTTP | ❌ NOT DONE |
| 05: Fix WebSocket queue correctness | ✅ PARTIAL |
| 06: Decouple startup from WebSocket readiness | ⚠️ PARTIAL |
| 07: Post-connect reconcile and partial-failure | ❌ NOT DONE |

---

## Recommended Next Steps

1. **Priority 1:** Implement `03: Contract params over HTTP`
   - Move ContractParams reads to HTTP
   - Addresses remaining confirmed startup WebSocket timeout errors

2. **Priority 2:** Implement `04: Fee config and startup token metadata over HTTP`
   - Move fee config reads in Intro, CreateOrder, Cleanup, Admin to HTTP
   - Reduces duplicate startup reads

3. **Priority 3:** Complete `06: Decouple startup from WebSocket readiness`
   - Handle connected boot path
   - Remove CreateOrder dependency on ws.contract/ws.provider

4. **Priority 4:** Implement `07: Post-connect reconcile and partial-failure semantics`
   - Close event gap
   - Add proper failure tracking and reporting
