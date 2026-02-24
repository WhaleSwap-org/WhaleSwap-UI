# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

WhaleSwap is a vanilla JavaScript DApp frontend for OTC peer-to-peer token swaps on EVM blockchains. It is a static site with no build step, no bundler, and no framework. The sole dev dependency is `http-server` for local serving.

### Running the dev server

```bash
npm start          # or: npx http-server -c-1
```

The server defaults to port `8080`. Access at `http://localhost:8080`.

### Lint / Test / Build

- **Lint**: No linter is configured in this project.
- **Test**: `npm test` is a placeholder (`echo "Error: no test specified" && exit 1`). E2E tests live in a separate repository (`WhaleSwap-org/WhaleSwap-E2E`) and are triggered via GitHub Actions.
- **Build**: No build step; the app serves static HTML/CSS/JS files directly.

### Key caveats

- The app loads `ethers.js` (v5.7.2) from `unpkg.com` CDN via an ES module import map, **not** from `node_modules`. An internet connection is required at runtime.
- Blockchain interaction requires a browser wallet (MetaMask). Without a wallet, the app still loads the UI but wallet-dependent features won't function.
- For local Hardhat testing, the contract deploy scripts (in a separate `whaleswap-contract` repo) must be run first to generate `js/local-dev.deployment.js` and update the ABI at `js/abi/OTCSwap.js`.
- Network config lives in `js/config/networks.js`. Supported chains: BNB (56), Polygon (137), and Localhost (1337).
- See `README.md` for full environment setup and local Hardhat workflow details.
