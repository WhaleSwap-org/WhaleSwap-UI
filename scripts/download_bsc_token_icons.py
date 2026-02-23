from pathlib import Path
from io import BytesIO
import time
import argparse

import requests
from PIL import Image


TOKEN_LIST = {
    "0x55d398326f99059ff775485246999027b3197955": "BSC-USD",
    "0x2170ed0880ac9a755fd29b2688956bd959f933f8": "ETH",
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "USDC",
    "0x8965349fb649a33a30cbfda057d8ec2c48abe2a2": "anyUSDC",
    "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe": "XRP",
    "0x570a5d26f7765ecb712c0924e4de545b89fd43df": "SOL",
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": "WBNB",
    "0xba2ae424d960c26247dd6c32edc70b295c744c43": "DOGE",
    "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd": "LINK",
    "0xce7de646e7208a4ef112cb6ed5038fa6cc6b12e3": "TRX",
    "0x3ee2200efb3400fabb9aacf31297cbdd1d435d47": "ADA",
    "0x0555e30da8f98308edb960aa94c0db47230d2b9c": "WBTC",
    "0x8ff795a6f4d97e7887c79bea79aba5cc76444adf": "BCH",
    "0x1ba42e5193dfa8b03d15dd1b86a3113bbbef8eeb": "ZEC",
    "0xfb6115445bff7b52feb98650c87f44907e58f802": "AAVE",
    "0x25d887ce7a35172c62febfd67a1856f20faebb00": "PEPE",
    "0x4338665cbb7b2485a8855a139b75d5e34ab0db94": "LTC",
    "0xbf5140a22578168fd562dccf235e5d43a02ce9b1": "UNI",
    "0x1ce0c2827e2ef14d5c4f29a091d735a204794041": "AVAX",
    "0x47474747477b199288bf72a1d702f7fe0fb1deea": "WLFI",
    "0xb7f8cd00c5a06c0537e2abff0b58033d02e5e094": "PAX",
    "0x031b41e504677879370e9dbcf937283a8691fa7f": "FET",
    "0x1fa4a73a3f0133f0025378af00236f3abdee5d63": "NEAR",
    "0x2859e4544c4bb03966803b044a93563bd2d0dd4d": "SHIB",
    "0xf78d2e7936f5fe18308a3b2951a93b6c4a41f5e2": "OM",
    "0x000ae314e2a2172a039b26378814c252734f556a": "ASTER",
    "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3": "DAI",
    "0x7083609fce4d1d8dc0c979aab8c869ea2c873402": "DOT",
    "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": "USDe",
    "0x0eb3a705fc54725037cc9e008bdede697f62f335": "ATOM",
    "0x76a797a59ba2c17726896976b7b3747bfd1d220f": "TONCOIN",
    "0x904567252d8f48555b7447c67dca23f0372e16be": "KITE",
    "0x0d8ce2a99bb6e3b7db580ed848240e4a0f9ae153": "FIL",
    "0x43c934a845205f0b514417d757d7235b8f53f1b9": "XLM",
    "0xac23b90a79504865d52b49b327328411a23d4db2": "FF",
    "0x9ac983826058b8a9c7aa1c9171441191232e8404": "SNX",
    "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": "BTCB",
    "0x52ce071bd9b1c4b00a0b92d298c512478cad67e8": "COMP",
    "0x405fbc9004d857903bfd6b3357792d71a50726b0": "XPL",
    "0xf508fcd89b8bd15579dc79a6827cb4686a3592c8": "vETH",
    "0x3d6545b08693dae087e957cb1180ee38b9e3c25e": "ETC",
    "0xd82544bf0dfe8385ef8fa34d67e6e4940cc63e16": "MYX",
}


def get_output_dir() -> Path:
    base_dir = Path(__file__).resolve().parents[1]
    out_dir = base_dir / "img" / "token-logos" / "bsc"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


def fetch_coingecko_image_url(address: str) -> str | None:
    url = f"https://api.coingecko.com/api/v3/coins/binance-smart-chain/contract/{address}"
    for attempt in range(3):
        resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            image = data.get("image") or {}
            return image.get("large") or image.get("small") or image.get("thumb")
        if resp.status_code == 429:
            wait = 2 ** attempt
            print(f"  Hit CoinGecko rate limit (429), retrying in {wait}s...")
            time.sleep(wait)
            continue
        print(f"  Unexpected status {resp.status_code} for {address}")
        return None
    return None


def download_image(url: str) -> Image.Image | None:
    resp = requests.get(url, timeout=30)
    if resp.status_code != 200:
        return None
    img = Image.open(BytesIO(resp.content))
    if img.mode in ("P", "RGBA"):
        img = img.convert("RGBA")
    else:
        img = img.convert("RGB")
    return img


def download_and_convert_tokens() -> None:
    parser = argparse.ArgumentParser(description="Download BSC token icons from CoinGecko")
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help="Only download icons for tokens that do not yet have a PNG file",
    )
    args = parser.parse_args()

    out_dir = get_output_dir()
    stats = {"saved": 0, "skipped_existing": 0, "skipped_no_image": 0, "errors": 0}

    for address, symbol in TOKEN_LIST.items():
        addr_lower = address.lower()
        print(f"Processing {symbol} ({addr_lower})")
        try:
            filename = f"{addr_lower}.png"
            target_path = out_dir / filename

            if args.only_missing and target_path.exists():
                print(f"  Skipping {symbol}: file already exists at {target_path}")
                stats["skipped_existing"] += 1
                time.sleep(0.25)
                continue

            image_url = fetch_coingecko_image_url(addr_lower)
            if not image_url:
                print(f"  Skipping {symbol}: no image URL found")
                stats["skipped_no_image"] += 1
                continue
            img = download_image(image_url)
            if img is None:
                print(f"  Skipping {symbol}: failed to download image")
                stats["errors"] += 1
                continue
            img.save(target_path, "PNG")
            print(f"  Saved {target_path}")
            stats["saved"] += 1
        except Exception as exc:
            print(f"  Error processing {symbol} ({addr_lower}): {exc}")
            stats["errors"] += 1
        time.sleep(1)

    print("\nSummary:")
    print(f"  Saved:            {stats['saved']}")
    print(f"  Skipped existing: {stats['skipped_existing']}")
    print(f"  Skipped (no URL): {stats['skipped_no_image']}")
    print(f"  Errors:           {stats['errors']}")


if __name__ == "__main__":
    download_and_convert_tokens()
