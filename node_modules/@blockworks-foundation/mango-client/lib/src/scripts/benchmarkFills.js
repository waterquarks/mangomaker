"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const ws_1 = __importDefault(require("ws"));
const web3_js_1 = require("@solana/web3.js");
const instruction_1 = require("../instruction");
const __1 = require("..");
// example:
// LOGFILE_PATH=./log-fills.csv KEYPAIR_PATH=~.config/solana/id.json RPC_URL='https://mango.rpcpool.com/cadcd3f799429565235eaf670d87' MANGO_ACC=your_id MANGO_GROUP=mainnet.1 FILLS_URL=ws://api.mngo.cloud:8080 yarn ts-node src/scripts/benchmarkFills.ts
const { LOGFILE_PATH, KEYPAIR_PATH, RPC_URL, MANGO_ACC, MANGO_GROUP, MANGO_TX_URL, FILLS_URL, } = process.env;
const keypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))));
const fills = new ws_1.default(FILLS_URL);
const rpc = new web3_js_1.Connection(RPC_URL);
const options = MANGO_TX_URL
    ? {
        sendConnection: new web3_js_1.Connection(MANGO_TX_URL, {
            disableRetryOnRateLimit: false,
        }),
    }
    : {};
const config = __1.Config.ids().getGroupWithName(MANGO_GROUP);
const mango = new __1.MangoClient(rpc, config.mangoProgramId, options);
const writeResult = (resp, sendTs, recvTs, fillTs, fill) => {
    var _a;
    const line = [sendTs, recvTs, fillTs, (_a = fill === null || fill === void 0 ? void 0 : fill.timestamp) === null || _a === void 0 ? void 0 : _a.toString(), resp].join(',') +
        '\n';
    fs.appendFileSync(LOGFILE_PATH, line);
};
(() => __awaiter(void 0, void 0, void 0, function* () {
    let price;
    let prz, qty;
    const group = yield mango.getMangoGroup(config.publicKey);
    const market = yield mango.getPerpMarket(group.perpMarkets[0].perpMarket, config.tokens[1].decimals, config.tokens[0].decimals);
    const cache = yield group.loadCache(rpc);
    price = group.cachePriceToUi(cache.getPrice(0), 0);
    [prz, qty] = market.uiToNativePriceQuantity(price, 1);
    group.onCacheChange(rpc, (c) => {
        price = group.cachePriceToUi(c.getPrice(0), 0);
        [prz, qty] = market.uiToNativePriceQuantity(price, 1);
        // console.log("benchmark::cache", price);
    });
    const acc = yield mango.getMangoAccount(new web3_js_1.PublicKey(MANGO_ACC), config.serumProgramId);
    const benchmarkInterval = 1000 * 60;
    const benchmarkFn = () => __awaiter(void 0, void 0, void 0, function* () {
        const orderId = Date.now();
        console.log('benchmark::start', orderId);
        const latest = yield rpc.getLatestBlockhash('finalized');
        const tx = new web3_js_1.Transaction({
            recentBlockhash: latest.blockhash,
            feePayer: keypair.publicKey,
        });
        tx.add((0, instruction_1.makePlacePerpOrder2Instruction)(config.mangoProgramId, config.publicKey, acc.publicKey, keypair.publicKey, group.mangoCache, group.perpMarkets[0].perpMarket, market.bids, market.asks, market.eventQueue, acc.getOpenOrdersKeysInBasket(), prz, qty, __1.I64_MAX_BN, new __1.BN(orderId), orderId % 2 > 0 ? 'buy' : 'sell', new __1.BN(50), 'postOnlySlide'), (0, instruction_1.makePlacePerpOrder2Instruction)(config.mangoProgramId, config.publicKey, acc.publicKey, keypair.publicKey, group.mangoCache, group.perpMarkets[0].perpMarket, market.bids, market.asks, market.eventQueue, acc.getOpenOrdersKeysInBasket(), prz, qty, __1.I64_MAX_BN, new __1.BN(orderId + 1), orderId % 2 > 0 ? 'sell' : 'buy', new __1.BN(50), 'limit'), (0, instruction_1.makeCancelAllPerpOrdersInstruction)(config.mangoProgramId, config.publicKey, acc.publicKey, keypair.publicKey, market.publicKey, market.bids, market.asks, new __1.BN(4)));
        tx.sign(keypair);
        let fillTs;
        let fill;
        const fillListener = (event) => {
            const parsedEvent = JSON.parse(event.data);
            if (parsedEvent['status'] === 'New' &&
                parsedEvent['market'] === 'MNGO-PERP') {
                const fillBytes = Buffer.from(parsedEvent['event'], 'base64');
                const fillEvent = __1.PerpEventLayout.decode(fillBytes).fill;
                console.log('benchmark::fill', fillEvent.timestamp.toNumber(), fillEvent.maker.toBase58(), fillEvent.taker.toBase58());
                if ((fillEvent.maker.equals(acc.publicKey) &&
                    fillEvent.makerClientOrderId.eq(new __1.BN(orderId))) ||
                    (fillEvent.taker.equals(acc.publicKey) &&
                        fillEvent.takerClientOrderId.eq(new __1.BN(orderId + 1)))) {
                    fill = fillEvent;
                    fillTs = Date.now();
                    console.log('benchmark::fill', fill.timestamp.toNumber(), fillTs);
                }
            }
        };
        fills.addEventListener('message', fillListener);
        const sendTs = Date.now();
        console.log('benchmark::sendTx', sendTs);
        try {
            const resp = yield mango.sendSignedTransaction({
                signedTransaction: tx,
                signedAtBlock: latest,
            });
            const confirmTs = Date.now();
            console.log('benchmark::response', resp);
            // wait a few extra seconds for fill to arrive
            yield (0, __1.sleep)(20000);
            writeResult(resp, sendTs, confirmTs, fillTs, fill);
            console.log('benchmark::end', confirmTs - sendTs);
        }
        catch (e) {
            console.log('benchmark::error', e);
            writeResult(e.toString(), sendTs, 0, fillTs, fill);
        }
        finally {
            fills.removeEventListener('message', fillListener);
        }
    });
    benchmarkFn();
    setInterval(benchmarkFn, benchmarkInterval);
}))();
//# sourceMappingURL=benchmarkFills.js.map