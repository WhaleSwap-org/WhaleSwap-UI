import { ethers } from 'ethers';
import { calculateTotalValue, formatDealValue, formatTimeDiff } from './orderUtils.js';
import { getDisplaySymbol } from './tokenDisplay.js';

function getValueDisplayText(price, amount, isPriceLoading) {
    const text = calculateTotalValue(price, amount);
    if (text !== 'N/A') {
        return text;
    }
    return isPriceLoading ? 'Loading...' : 'N/A';
}

function getDealDisplayText(deal, isPriceLoading) {
    const text = formatDealValue(deal);
    if (text !== 'N/A') {
        return text;
    }
    return isPriceLoading ? 'Loading...' : 'N/A';
}

function formatTokenAmount(amount, decimals, fallbackValue = '0') {
    if (!amount || !Number.isInteger(decimals)) {
        return fallbackValue;
    }

    try {
        return ethers.utils.formatUnits(amount, decimals);
    } catch (_) {
        return fallbackValue;
    }
}

function isFallbackTokenInfo(tokenInfo) {
    if (!tokenInfo) {
        return true;
    }

    if (tokenInfo.name === 'Unknown Token') {
        return true;
    }

    return /^0x[a-f0-9]{4}\.\.\.[a-f0-9]{4}$/i.test(String(tokenInfo.symbol || ''));
}

function chooseDisplayAmount(currentValue, cachedValue, tokenInfo) {
    if (!currentValue) {
        return cachedValue || '0';
    }

    if (!cachedValue) {
        return currentValue;
    }

    if (isFallbackTokenInfo(tokenInfo)) {
        return cachedValue;
    }

    const currentNumber = Number(currentValue);
    const cachedNumber = Number(cachedValue);
    if (Number.isFinite(currentNumber) && Number.isFinite(cachedNumber)) {
        const difference = Math.abs(currentNumber - cachedNumber);
        const scale = Math.max(1, Math.abs(currentNumber), Math.abs(cachedNumber));
        if (difference / scale < 1e-9) {
            return cachedValue;
        }
    }

    return currentValue;
}

export async function resolveOrderDisplayValues({ order, pricing, tokenDisplaySymbolMap }) {
    const sellTokenInfo = await pricing.getTokenInfo(order.sellToken);
    const buyTokenInfo = await pricing.getTokenInfo(order.buyToken);
    const sellDisplaySymbol = getDisplaySymbol(sellTokenInfo, tokenDisplaySymbolMap);
    const buyDisplaySymbol = getDisplaySymbol(buyTokenInfo, tokenDisplaySymbolMap);

    const freshFormattedSellAmount = formatTokenAmount(
        order?.sellAmount,
        sellTokenInfo?.decimals,
        order?.dealMetrics?.formattedSellAmount || '0'
    );
    const freshFormattedBuyAmount = formatTokenAmount(
        order?.buyAmount,
        buyTokenInfo?.decimals,
        order?.dealMetrics?.formattedBuyAmount || '0'
    );
    const safeFormattedSellAmount = chooseDisplayAmount(
        freshFormattedSellAmount,
        order?.dealMetrics?.formattedSellAmount,
        sellTokenInfo
    );
    const safeFormattedBuyAmount = chooseDisplayAmount(
        freshFormattedBuyAmount,
        order?.dealMetrics?.formattedBuyAmount,
        buyTokenInfo
    );

    const resolvedSellPrice = typeof order?.dealMetrics?.sellTokenUsdPrice !== 'undefined'
        ? order.dealMetrics.sellTokenUsdPrice
        : (pricing ? pricing.getPrice(order.sellToken) : undefined);
    const resolvedBuyPrice = typeof order?.dealMetrics?.buyTokenUsdPrice !== 'undefined'
        ? order.dealMetrics.buyTokenUsdPrice
        : (pricing ? pricing.getPrice(order.buyToken) : undefined);

    const sellPriceClass = (pricing && pricing.isPriceEstimated(order.sellToken)) ? 'price-estimate' : '';
    const buyPriceClass = (pricing && pricing.isPriceEstimated(order.buyToken)) ? 'price-estimate' : '';
    const isPriceLoading = Boolean(pricing?.isInitialPriceLoadPending?.());

    return {
        sellTokenInfo,
        buyTokenInfo,
        sellDisplaySymbol,
        buyDisplaySymbol,
        formattedSellAmount: safeFormattedSellAmount,
        formattedBuyAmount: safeFormattedBuyAmount,
        resolvedSellPrice,
        resolvedBuyPrice,
        sellValueText: getValueDisplayText(resolvedSellPrice, safeFormattedSellAmount, isPriceLoading),
        buyValueText: getValueDisplayText(resolvedBuyPrice, safeFormattedBuyAmount, isPriceLoading),
        sellPriceClass,
        buyPriceClass,
        isPriceLoading
    };
}

export async function buildOrderRowContext({
    order,
    ws,
    pricing,
    tokenDisplaySymbolMap
}) {
    const {
        sellTokenInfo,
        buyTokenInfo,
        sellDisplaySymbol,
        buyDisplaySymbol,
        formattedSellAmount,
        formattedBuyAmount,
        resolvedSellPrice,
        resolvedBuyPrice,
        sellValueText,
        buyValueText,
        sellPriceClass,
        buyPriceClass,
        isPriceLoading
    } = await resolveOrderDisplayValues({ order, pricing, tokenDisplaySymbolMap });
    const buyerDealRatio = order.dealMetrics?.deal > 0 ? 1 / order.dealMetrics.deal : undefined;

    const orderStatus = ws.getOrderStatus(order);
    const expiryEpoch = order?.timings?.expiresAt;
    const currentTime = ws.getCurrentTimestamp();
    const expiryText = orderStatus === 'Active' && typeof expiryEpoch === 'number'
        && Number.isFinite(currentTime)
        ? formatTimeDiff(expiryEpoch - currentTime)
        : '';

    return {
        sellTokenInfo,
        buyTokenInfo,
        sellDisplaySymbol,
        buyDisplaySymbol,
        formattedSellAmount,
        formattedBuyAmount,
        resolvedSellPrice,
        resolvedBuyPrice,
        sellValueText,
        buyValueText,
        sellPriceClass,
        buyPriceClass,
        orderStatus,
        expiryText,
        buyerDealRatio,
        dealText: getDealDisplayText(buyerDealRatio, isPriceLoading)
    };
}
