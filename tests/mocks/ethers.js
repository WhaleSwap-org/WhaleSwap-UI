const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const INTEGER_REGEX = /^-?\d+$/;

function createBigNumber(value) {
    const asString = String(value ?? '0');
    const asBigInt = BigInt(asString);
    return {
        toString() {
            return asString;
        },
        isZero() {
            return asBigInt === 0n;
        },
        add(other) {
            return createBigNumber(asBigInt + BigInt(other?.toString?.() ?? other ?? 0));
        },
        mul(other) {
            return createBigNumber(asBigInt * BigInt(other?.toString?.() ?? other ?? 0));
        },
        div(other) {
            return createBigNumber(asBigInt / BigInt(other?.toString?.() ?? other ?? 1));
        }
    };
}

export const ethers = {
    BigNumber: {
        from(value) {
            const normalized = value?.toString?.() ?? value ?? '0';
            if (!INTEGER_REGEX.test(String(normalized))) {
                throw new Error('invalid BigNumber value');
            }
            return createBigNumber(normalized);
        }
    },
    constants: {
        AddressZero: '0x0000000000000000000000000000000000000000'
    },
    utils: {
        isAddress(value) {
            return ADDRESS_REGEX.test(String(value || ''));
        },
        getAddress(value) {
            if (!ADDRESS_REGEX.test(String(value || ''))) {
                throw new Error('invalid address');
            }
            return value;
        },
        formatUnits(value) {
            return String(value ?? '0');
        },
        parseUnits(value) {
            return value;
        },
        commify(value) {
            return String(value ?? '');
        }
    }
};

export default { ethers };
