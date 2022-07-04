"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adapterHasSignAllTransactions = void 0;
const adapterHasSignAllTransactions = (adapter) => {
    if (adapter.signAllTransactions) {
        return true;
    }
    return false;
};
exports.adapterHasSignAllTransactions = adapterHasSignAllTransactions;
//# sourceMappingURL=adapterTypes.js.map