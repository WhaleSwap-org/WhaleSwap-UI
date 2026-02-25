# WhaleSwap Mobile Phase 0 Baseline

Date: 2026-02-25

## Baseline Checklist

- [x] Reviewed behavior at widths: 1024, 768, 600, 480, 390, 360, 320.
- [x] Captured overflow/cutoff risks for header, nav tabs, footer, and tab shells.
- [x] Recorded desktop baseline notes for regression checks.

## Desktop Baseline Notes

- Header is single-row with left brand and right wallet controls.
- Tabs are visible as a multi-button strip.
- Footer includes "Powered by WhaleSwap" and floating legal launcher.
- Orders tabs depend on horizontal table scrolling.
- Existing glassmorphism theme and spacing rhythm should be preserved.

## Pre-Phase-1 Mobile Risks

- Fixed-width wallet/network controls could clip below 768.
- Scaled logo could overflow brand row on narrow screens.
- Wrapped tab buttons reduce discoverability and active-tab visibility.
- Floating legal launcher could overlap small-screen content.
- Orders table min-width behavior could push viewport-level horizontal scrolling.
- Claim and contract-params grids could force narrow-screen overflow.
- Create-order selector/balance chip widths could clip at 390/360.

## Phase 1 Acceptance Targets

- No viewport-level horizontal scroll for shell surfaces at 320.
- Active tab is always reachable in mobile horizontal rail.
- Legal links remain accessible on mobile without floating overlap.
- Each tab remains usable at 390 and 360 without blocking primary actions.
