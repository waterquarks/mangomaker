"use strict";
/**
 * Create and fund various keypairs and mango accounts for testnet, writes to ./accounts.json
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const __1 = require("../..");
const createAccounts = () => __awaiter(void 0, void 0, void 0, function* () {
    const out = [];
    const accountsToCreate = 1;
    const payer = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.KEYPAIR ||
        fs.readFileSync(os.homedir() + '/.config/solana/devnet.json', 'utf-8'))));
    const connection = new web3_js_1.Connection('https://api.testnet.solana.com', 'processed');
    const ids = new __1.Config(__1.IDS).getGroup('testnet', 'testnet.0');
    const client = new __1.MangoClient(connection, ids.mangoProgramId);
    const group = yield client.getMangoGroup(ids.publicKey);
    const usdcInfo = ids.tokens[0];
    const usdcVaultPk = (yield group.loadRootBanks(connection))[__1.QUOTE_INDEX]
        .nodeBankAccounts[0].vault;
    const usdcToken = new spl_token_1.Token(connection, new web3_js_1.PublicKey(usdcInfo.mintKey), spl_token_1.TOKEN_PROGRAM_ID, payer);
    const usdcWalletKey = yield usdcToken
        .getOrCreateAssociatedAccountInfo(payer.publicKey)
        .then((a) => a.address);
    // create 500 accounts and deposit
    for (let i = 0; i < accountsToCreate; i++) {
        const info = {};
        console.log(`Creating account ${i + 1}/${accountsToCreate}...`);
        // Generate new keypair and sent 0.5 SOL, create a mango account
        const keypair = new web3_js_1.Keypair();
        info['publicKey'] = keypair.publicKey.toBase58();
        info['secretKey'] = Array.from(keypair.secretKey);
        const transferLamportsIx = web3_js_1.SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: keypair.publicKey,
            lamports: 0.5 * web3_js_1.LAMPORTS_PER_SOL,
        });
        const accountNumber = new __1.BN(1);
        const [mangoAccountPk] = yield web3_js_1.PublicKey.findProgramAddress([
            ids.publicKey.toBytes(),
            keypair.publicKey.toBytes(),
            accountNumber.toBuffer('le', 8),
        ], ids.mangoProgramId);
        info['mangoAccountPks'] = [mangoAccountPk.toBase58()];
        const createMangoAccountIx = (0, __1.makeCreateMangoAccountInstruction)(ids.mangoProgramId, ids.publicKey, mangoAccountPk, keypair.publicKey, accountNumber, payer.publicKey);
        // Deposit 10 USDC from payer on behalf of the new keypair
        const depositUsdcIx = (0, __1.makeDepositInstruction)(ids.mangoProgramId, ids.publicKey, payer.publicKey, group.mangoCache, mangoAccountPk, usdcInfo.rootKey, usdcInfo.nodeKeys[0], usdcVaultPk, usdcWalletKey, (0, __1.uiToNative)(10, usdcInfo.decimals));
        const createAccountTx = new web3_js_1.Transaction()
            .add(transferLamportsIx)
            .add(createMangoAccountIx)
            .add(depositUsdcIx);
        // hang until it's done
        let done = false;
        const sig = yield connection.sendTransaction(createAccountTx, [payer, keypair], { skipPreflight: true });
        connection.onSignature(sig, (res) => {
            done = true;
            if (res.err) {
                console.error('err', sig, res.err.toString());
            }
            else {
                console.error('confirmed', sig);
            }
        }, 'confirmed');
        while (!done) {
            yield (0, __1.sleep)(500);
        }
        out.push(info);
    }
    fs.writeFileSync(path.resolve(__dirname, 'accounts.json'), JSON.stringify(out));
});
function writeSecretYaml(name, app, cluster, keypair, mangoAccount = undefined) {
    const secretKey = btoa(JSON.stringify(keypair.secretKey));
    const mangoAccountKey = mangoAccount
        ? `ACCOUNT_KEY=${mangoAccount.toBase58()}`
        : '';
    const config = `apiVersion: v1
kind: Secret
metadata:
    namespace: mango
    name: ${name}
    labels:
    app: ${app}
    cluster: ${cluster}
type: Opaque
data:
    SECRET_KEY: "${secretKey}"
    ${mangoAccountKey}`;
    fs.writeFileSync(path.resolve(__dirname, 'k8s', 'Secrets', name + '.toml'), config);
}
createAccounts();
//# sourceMappingURL=createAccounts.js.map