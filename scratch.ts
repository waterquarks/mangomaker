import {Connection, PublicKey} from "@solana/web3.js";
import {
    Config, getMultipleAccounts,
    getPerpMarketByBaseSymbol,
    getSpotMarketByBaseSymbol,
    getTokenBySymbol, MangoAccount,
    MangoClient,
    PerpAccount, PerpEventQueue, PerpMarket, PerpMarketConfig
} from "@blockworks-foundation/mango-client";
import {Market} from "@project-serum/serum";
import BN from "bn.js";

async function main() {
    const {
        KEYPAIR,
        MANGO_GROUP,
        MANGO_ACCOUNT,
        SYMBOL
    } = process.env

    const config = Config.ids()

    const mangoGroupConfig = config.getGroupWithName('mainnet.1')

    if (!mangoGroupConfig) {
        return
    }

    const [token, perpMarketConfig, spotMarketConfig] = [
        getTokenBySymbol(mangoGroupConfig, SYMBOL!),
        getPerpMarketByBaseSymbol(mangoGroupConfig, SYMBOL!),
        getSpotMarketByBaseSymbol(mangoGroupConfig, SYMBOL!)
    ]

    if (!token || !perpMarketConfig || !spotMarketConfig) {
        return
    }

    const connection = new Connection(config.cluster_urls[mangoGroupConfig.cluster], 'processed')

    const mangoClient = new MangoClient(connection, mangoGroupConfig.mangoProgramId)

    const mangoGroup = await mangoClient.getMangoGroup(mangoGroupConfig.publicKey)

    const [mangoCache, rootBanks, perpMarket, spotMarket] = await Promise.all([
        mangoGroup.loadCache(connection),
        mangoGroup.loadRootBanks(connection),
        mangoGroup.loadPerpMarket(
            connection,
            perpMarketConfig.marketIndex,
            perpMarketConfig.baseDecimals,
            perpMarketConfig.quoteDecimals
        ),
        Market.load(
            connection,
            spotMarketConfig.publicKey,
            undefined,
            mangoGroupConfig.serumProgramId
        )
    ])

    const mangoAccountPk = new PublicKey(MANGO_ACCOUNT!)

    let recentBlockHash = await connection.getLatestBlockhash('finalized')

    let recentBlockTime = await connection.getBlockTime(
        await connection.getSlot('finalized')
    )

    const [mangoAccountRaw, perpEventQueueRaw] = await getMultipleAccounts(connection, [mangoAccountPk, perpMarket.eventQueue])
}

function getCompleteBasePosition(mangoAccountPk: PublicKey, perpMarket: PerpMarket, perpMarketConfig: PerpMarketConfig) {
    const basePosition = mangoAccount.perpAccounts[perpMarketConfig.marketIndex]

    const unprocessedBasePosition = getUnprocessedBasePosition(mangoAccount, perpMarket)
}

function getUnprocessedBasePosition(mangoAccount: MangoAccount, perpMarket: PerpMarket, perpEventQueue: PerpEventQueue): number {
    return perpEventQueue.getUnconsumedEvents()
        .filter(event => event.fill !== undefined)
        .map(event => perpMarket.parseFillEvent(event.fill))
        .filter(fill => fill.maker.equals(mangoAccount.publicKey))
        .reduce((accumulator, fill) => {
            switch (fill.takerSide) {
                case "buy":
                    return accumulator - fill.quantity
                case "sell":
                    return accumulator + fill.quantity
            }
        }, 0)
}

main()