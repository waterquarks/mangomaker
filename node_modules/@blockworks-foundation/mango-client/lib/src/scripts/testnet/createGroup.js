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
/**
 * Creates a testnet group testnet.0, minting tokens if necessary, writers to ids.json
 */
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const __1 = require("../..");
const mints_json_1 = __importDefault(require("./mints.json"));
const cluster = 'testnet';
const keypairPath = os.homedir() + '/.config/solana/devnet.json';
const newGroupName = 'testnet.2';
const mangoProgramId = 'BXhdkETgbHrr5QmVBT1xbz3JrMM28u5djbVtmTUfmFTH';
const serumProgramId = '3qx9WcNPw4jj3v1kJbWoxSN2ZAakwUXFu9HDr2QjQ6xq';
function createMintAndAirdrop(connection, payer, decimals = 6, amount = 1000) {
    return __awaiter(this, void 0, void 0, function* () {
        const token = yield spl_token_1.Token.createMint(connection, payer, payer.publicKey, null, decimals, spl_token_1.TOKEN_PROGRAM_ID);
        const account = yield token
            .getOrCreateAssociatedAccountInfo(payer.publicKey)
            .then((a) => a.address);
        yield token.mintTo(account, payer, [], amount);
        return token;
    });
}
const initNewGroup = () => __awaiter(void 0, void 0, void 0, function* () {
    // const mints = IDS.filter((id) => id.symbol !== 'USDC').map((id) => id.mint);
    console.log('starting');
    const ids = mints_json_1.default[cluster];
    const payer = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.KEYPAIR ||
        fs.readFileSync(os.homedir() + '/.config/solana/devnet.json', 'utf-8'))));
    const connection = new web3_js_1.Connection('https://api.testnet.solana.com', 'processed');
    let quoteInfo = ids.find((id) => id.symbol === 'USDC');
    let quoteToken;
    if (!quoteInfo.mint) {
        console.log(`creating USDC mint`);
        quoteToken = yield createMintAndAirdrop(connection, payer, quoteInfo.decimals, 1000000);
    }
    else {
        quoteToken = new spl_token_1.Token(connection, new web3_js_1.PublicKey(quoteInfo.mint), spl_token_1.TOKEN_PROGRAM_ID, payer);
    }
    const quoteMint = quoteToken.publicKey;
    const feesVault = yield quoteToken
        .getOrCreateAssociatedAccountInfo(payer.publicKey)
        .then((a) => a.address);
    let groupIds = new __1.Config(__1.IDS).getGroup(cluster, newGroupName);
    if (!groupIds) {
        yield execCommand(`yarn cli init-group ${newGroupName} ${mangoProgramId} ${serumProgramId} ${quoteMint.toBase58()} ${feesVault.toBase58()}`);
        yield (0, __1.sleep)(1000);
        console.log(`new group initialized`);
        groupIds = new __1.Config(__1.IDS).getGroup(cluster, newGroupName);
    }
    const client = new __1.MangoClient(connection, new web3_js_1.PublicKey(mangoProgramId));
    const newGroup = yield client.getMangoGroup(groupIds.publicKey);
    for (let i = 0; i < ids.length; i++) {
        const fids = ids[i];
        if (fids.symbol === 'USDC') {
            continue;
        }
        if (!fids.mint) {
            const token = yield createMintAndAirdrop(connection, payer, fids.decimals, 1000);
            console.log(fids.symbol, token.publicKey.toBase58());
            fids.mint = token.publicKey.toBase58();
        }
        if (!newGroup.oracles[i - 1] || newGroup.oracles[i - 1].equals(__1.zeroKey)) {
            console.log(`adding ${fids.symbol} oracle`);
            if (fids['price']) {
                yield execCommand(`yarn cli add-oracle ${newGroupName} ${fids.symbol}`);
                yield execCommand(`yarn cli set-oracle ${newGroupName} ${fids.symbol} ${fids['price']}`);
            }
            else {
                yield execCommand(`yarn cli add-oracle ${newGroupName} ${fids.symbol} --provider ${fids.oracleProvider}`);
            }
            yield (0, __1.sleep)(2500);
        }
        if (newGroup.spotMarkets[i - 1].isEmpty()) {
            console.log(`listing and adding ${fids.symbol} spot market`);
            yield execCommand(`yarn cli add-spot-market ${newGroupName} ${fids.symbol} ${fids.mint} --base_lot_size ${fids.baseLot} --quote_lot_size ${fids.quoteLot} --init_leverage ${fids.initLeverage || 5} --maint_leverage ${fids.maintLeverage || 10} --liquidation_fee ${fids.liquidationFee || 0.05}`);
        }
        if (newGroup.perpMarkets[i - 1].isEmpty() && ['BTC', 'ETH', 'SOL', 'LUNA', 'AVAX', 'SRM', 'FTT', 'BNB', 'RAY', 'ADA', 'MNGO', 'GMT'].includes(fids.symbol)) {
            console.log(`adding ${fids.symbol} perp market`);
            yield execCommand(`yarn cli add-perp-market ${newGroupName} ${fids.symbol} --init_leverage ${fids.initLeveragePerp || 5} --maint_leverage ${fids.maintLeveragePerp || 10} --liquidation_fee ${fids.liquidationFeePerp || 0.05} --base_lot_size ${fids.baseLot} --quote_lot_size ${fids.quoteLot}`);
        }
        console.log('---');
    }
    console.log('Succcessfully created new mango group.');
});
function execCommand(cmd) {
    const exec = require('child_process').exec;
    cmd = cmd + ` --cluster ${cluster} --keypair ${keypairPath}`;
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            console.log(stdout);
            //console.log('!!!!!!', error, stdout, stderr)
            if (error) {
                console.warn(error);
                reject(error);
            }
            resolve(stdout ? stdout : stderr);
        });
    });
}
initNewGroup();
//# sourceMappingURL=createGroup.js.map