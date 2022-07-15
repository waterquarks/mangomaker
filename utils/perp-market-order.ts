// Initially written to test the behaviour of a market maker quoting perps
import {
    Config,
    getPerpMarketByBaseSymbol,
    getSpotMarketByBaseSymbol,
    getTokenBySymbol, MangoClient
} from "@blockworks-foundation/mango-client";
import {Connection, Keypair, PublicKey, Transaction} from "@solana/web3.js";
import {Market} from "@project-serum/serum";
import fs from "fs";

async function main() {
    const {
        KEYPAIR,
        MANGO_GROUP,
        MANGO_ACCOUNT,
        SYMBOL,
        SIZE
    } = process.env

    const config = Config.ids()

    const mangoGroupConfig = config.getGroupWithName(MANGO_GROUP || 'devnet.2')

    if (!mangoGroupConfig) {
        console.log(`Couldn't find group by name ${MANGO_GROUP}`)

        return
    }

    const [token, perpMarketConfig] = [
        getTokenBySymbol(mangoGroupConfig, SYMBOL!),
        getPerpMarketByBaseSymbol(mangoGroupConfig, SYMBOL!)
    ]

    if (!token || !perpMarketConfig) {
        console.log(`token or perpMarketConfig by symbol ${SYMBOL!} not found`)

        return
    }
    const connection = new Connection(config.cluster_urls[mangoGroupConfig.cluster], 'processed')

    const mangoClient = new MangoClient(connection, mangoGroupConfig.mangoProgramId)

    console.log('Loading Mango group...')

    const mangoGroup = await mangoClient.getMangoGroup(mangoGroupConfig.publicKey)

    console.log(`Loaded! ${(performance.now() / 1e3).toFixed(2)}s` )

    console.log('Loading mangoCache, rootBanks, perpMarket and spotMarket...')

    const [mangoCache, rootBanks, perpMarket] = await Promise.all([
        mangoGroup.loadCache(connection),
        mangoGroup.loadRootBanks(connection),
        mangoGroup.loadPerpMarket(
            connection,
            perpMarketConfig.marketIndex,
            perpMarketConfig.baseDecimals,
            perpMarketConfig.quoteDecimals
        )
    ])

    const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR!, 'utf-8'))))

    const mangoAccountPk = new PublicKey(MANGO_ACCOUNT!)

    const mangoAccount = await mangoClient.getMangoAccount(mangoAccountPk, mangoGroup.dexProgramId)

    let recentBlockHash = await connection.getLatestBlockhash('finalized')

    let recentBlockTime = await connection.getBlockTime(
        await connection.getSlot('finalized')
    )

    const tx = new Transaction({
        recentBlockhash: recentBlockHash.blockhash,
        feePayer: payer.publicKey
    })
}

main()