function normalizeAddress(value) {
    return typeof value === 'string' ? value.toLowerCase() : '';
}

export function hasMakerOrdersForAccount(orders = [], account = '') {
    const normalizedAccount = normalizeAddress(account);
    if (!normalizedAccount) return false;

    const list = Array.isArray(orders) ? orders : [];
    return list.some((order) => normalizeAddress(order?.maker) === normalizedAccount);
}

export function hasInvitedOrdersForAccount(orders = [], account = '') {
    const normalizedAccount = normalizeAddress(account);
    if (!normalizedAccount) return false;

    const list = Array.isArray(orders) ? orders : [];
    return list.some((order) => normalizeAddress(order?.taker) === normalizedAccount);
}

export function getOrderTabVisibility(orders = [], account = '') {
    return {
        showMyOrders: hasMakerOrdersForAccount(orders, account),
        showInvitedOrders: hasInvitedOrdersForAccount(orders, account)
    };
}
