#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ALLOWLIST_PATH = '/Users/erebus/Documents/code/liberdus/whaleswap-contract/allowed-tokens.ethereum.json';
const ICONS_DIR = path.resolve('img/token-logos');
const ICON_EXTENSIONS = new Set(['png', 'webp', 'jpg', 'jpeg', 'svg']);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args.set(key, value);
  }
  return args;
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function existingIconPathFor(addressLower) {
  for (const ext of ICON_EXTENSIONS) {
    const candidate = path.join(ICONS_DIR, `${addressLower}.${ext}`);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function getGeckoTerminalImageUrl(addressLower) {
  const endpoint = `https://api.geckoterminal.com/api/v2/networks/eth/tokens/${addressLower}`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const { response, payload } = await fetchJson(endpoint, {
      headers: {
        accept: 'application/json',
      },
    });

    if (response.status === 200) {
      return payload?.data?.attributes?.image_url || null;
    }

    if (response.status === 429) {
      await delay(4000 + (attempt * 2000));
      continue;
    }

    if (response.status >= 500) {
      await delay(2000 + (attempt * 1000));
      continue;
    }

    return null;
  }

  return null;
}

async function getDexScreenerImageUrl(addressLower) {
  const endpoint = `https://api.dexscreener.com/latest/dex/tokens/${addressLower}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { response, payload } = await fetchJson(endpoint, {
      headers: {
        accept: 'application/json',
      },
    });

    if (response.status === 200) {
      const pair = Array.isArray(payload?.pairs) ? payload.pairs[0] : null;
      return pair?.info?.imageUrl || null;
    }

    if (response.status === 429 || response.status >= 500) {
      await delay(2500 + (attempt * 1500));
      continue;
    }

    return null;
  }

  return null;
}

function extFromUrl(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  const file = pathname.split('/').pop() || '';
  const rawExt = file.includes('.') ? file.split('.').pop() : '';
  return ICON_EXTENSIONS.has(rawExt) ? rawExt : null;
}

function extFromContentType(contentType) {
  if (!contentType) return null;
  const lower = contentType.toLowerCase();
  if (lower.includes('image/png')) return 'png';
  if (lower.includes('image/webp')) return 'webp';
  if (lower.includes('image/jpeg')) return 'jpg';
  if (lower.includes('image/svg')) return 'svg';
  return null;
}

async function downloadIcon(url, destinationBase) {
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: 'image/*',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url} (status ${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  const ext = extFromUrl(url) || extFromContentType(contentType) || 'png';
  const destPath = `${destinationBase}.${ext}`;
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(destPath, Buffer.from(arrayBuffer));
  return destPath;
}

async function main() {
  const args = parseArgs(process.argv);
  const allowlistPath = path.resolve(args.get('allowlist') || DEFAULT_ALLOWLIST_PATH);

  const raw = await fs.readFile(allowlistPath, 'utf8');
  const addresses = JSON.parse(raw)
    .map((value) => String(value).trim())
    .filter((value) => isAddress(value))
    .map((value) => value.toLowerCase());

  const uniqueAddresses = [...new Set(addresses)];
  console.log(`Loaded ${uniqueAddresses.length} token addresses from ${allowlistPath}`);

  await fs.mkdir(ICONS_DIR, { recursive: true });

  const downloaded = [];
  const skipped = [];
  const failed = [];

  for (const addressLower of uniqueAddresses) {
    console.log(`Checking ${addressLower} ...`);
    const existingPath = await existingIconPathFor(addressLower);
    if (existingPath) {
      skipped.push({ address: addressLower, reason: `exists (${path.basename(existingPath)})` });
      console.log(`  exists: ${path.basename(existingPath)}`);
      continue;
    }

    let imageUrl = await getGeckoTerminalImageUrl(addressLower);
    if (!imageUrl) {
      imageUrl = await getDexScreenerImageUrl(addressLower);
    }

    if (!imageUrl) {
      failed.push({ address: addressLower, reason: 'No icon URL from GeckoTerminal/DexScreener' });
      console.log('  failed: no icon URL');
      continue;
    }

    const destinationBase = path.join(ICONS_DIR, addressLower);
    try {
      const writtenPath = await downloadIcon(imageUrl, destinationBase);
      downloaded.push({ address: addressLower, path: writtenPath, source: imageUrl });
      console.log(`  downloaded: ${path.basename(writtenPath)}`);
      // Stay polite with upstream APIs.
      await delay(700);
    } catch (error) {
      failed.push({ address: addressLower, reason: error.message });
      console.log(`  failed: ${error.message}`);
    }
  }

  console.log(`Downloaded: ${downloaded.length}`);
  for (const item of downloaded) {
    console.log(`  + ${item.address} -> ${path.basename(item.path)}`);
  }

  console.log(`Skipped: ${skipped.length}`);
  for (const item of skipped) {
    console.log(`  = ${item.address} (${item.reason})`);
  }

  console.log(`Failed: ${failed.length}`);
  for (const item of failed) {
    console.log(`  - ${item.address}: ${item.reason}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
