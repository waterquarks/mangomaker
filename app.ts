import {
    Config,
    getPerpMarketByBaseSymbol,
    getSpotMarketByBaseSymbol,
    getTokenBySymbol,
    I64_MAX_BN,
    I80F48,
    makeCancelAllPerpOrdersInstruction,
    makeCreateSpotOpenOrdersInstruction,
    makePlacePerpOrder2Instruction,
    makePlaceSpotOrder2Instruction,
    MangoAccount,
    MangoClient,
    MangoGroup,
    nativeToUi,
    Payer,
    PerpEventLayout,
    QUOTE_INDEX,
    ZERO_BN
} from "@blockworks-foundation/mango-client";
import {Connection, Keypair, PublicKey, Transaction} from "@solana/web3.js";
import fs from "fs";
import {BN} from "bn.js";
import {getFeeRates, getFeeTier, Market, OpenOrders} from "@project-serum/serum";
import {range, zip} from "lodash";
import WebSocket from "ws";
import {MangoRiskCheck, ViolationBehaviour} from "mango_risk_check";

const main = async () => {
    const {
        KEYPAIR_PATH,
        MANGO_GROUP,
        MANGO_ACCOUNT,
        SYMBOL
    } = process.env

    const config = Config.ids()

    const mangoGroupConfig = config.getGroupWithName(MANGO_GROUP || 'devnet.2')

    if (!mangoGroupConfig) {
        console.log(`Couldn't find group by name ${MANGO_GROUP}`)

        return
    }

    const [token, perpMarketConfig, spotMarketConfig] = [
        getTokenBySymbol(mangoGroupConfig, SYMBOL!),
        getPerpMarketByBaseSymbol(mangoGroupConfig, SYMBOL!),
        getSpotMarketByBaseSymbol(mangoGroupConfig, SYMBOL!)
    ]

    if (!token || !perpMarketConfig || !spotMarketConfig) {
        console.log(`token, perpMarketConfig or spotMarketConfig by symbol ${SYMBOL!} not found`)

        return
    }

    const connection = new Connection(config.cluster_urls[mangoGroupConfig.cluster], 'processed')
    // ^ See https://docs.solana.com/developing/clients/jsonrpc-api#configuring-state-commitment
    // to learn more about each state commitment i.e processed, confirmed and finalized.

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

    const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH!, 'utf-8'))))

    const mangoAccountPk = new PublicKey(MANGO_ACCOUNT!)

    const mangoAccount = await mangoClient.getMangoAccount(mangoAccountPk, mangoGroup.dexProgramId)

    let recentBlockHash = await connection.getLatestBlockhash('finalized')
    // ^ Solana transactions require a recent block hash passed as metadata in order to be signed.
    // Instead of fetching this before dispatching every transaction (which would delay it by a
    // few milliseconds) we poll for this regularly in the background.

    let recentBlockTime = await connection.getBlockTime(
        await connection.getSlot('finalized')
    )
    // ^ This will be used to as reference for time in force orders later on.
    // It is important to use cluster time, like above, and not local time.

    connection.onSlotChange(async slotInfo => {
        recentBlockHash = await connection.getLatestBlockhash('finalized')

        recentBlockTime = await connection.getBlockTime(
            await connection.getSlot('finalized')
        )
    })

    if (!mangoAccount.spotOpenOrdersAccounts[spotMarketConfig.marketIndex]) {
        /*

        To interact with the (Serum) DEX, a given user must create an OpenOrders
        account. This account stores the following:
        - How much of the base and quote currency (in the SOL/USDC pair, SOL
          would be base currency and USDC would be quote) that user has locked
          in open orders or is settleable
        - A list of open orders for that user on that market

        */

        console.log('Open orders account not found, creating one...')

        const [openOrdersPk] = await PublicKey.findProgramAddress(
            [
                mangoAccount.publicKey.toBytes(),
                new BN(spotMarketConfig.marketIndex).toArrayLike(Buffer, 'le', 8),
                new Buffer('OpenOrders', 'utf-8'),
            ],
            mangoClient.programId,
        )

        const createSpotOpenOrdersInstruction = makeCreateSpotOpenOrdersInstruction(
            mangoClient.programId,
            mangoGroup.publicKey,
            mangoAccount.publicKey,
            payer.publicKey,
            mangoGroup.dexProgramId,
            openOrdersPk,
            spotMarket.publicKey,
            mangoGroup.signerKey
        )

        const tx = new Transaction({
            recentBlockhash: recentBlockHash.blockhash,
            feePayer: payer.publicKey
        })

        tx.add(createSpotOpenOrdersInstruction)

        tx.sign(payer)

        try {
            const response = await mangoClient.sendSignedTransaction({
                signedTransaction: tx,
                signedAtBlock: recentBlockHash
            })

            console.log('create_open_orders_account::response', response)
        } catch (error) {
            console.log('create_open_orders_account::error', error);
        }

        await mangoAccount.reload(connection, mangoGroup.dexProgramId)
        // ^ The newly created open orders account isn't immediately visible in
        // the already fetched Mango account, hence it needs to be reloaded

        console.log('Created open orders account!')
    }

    // https://github.com/Is0tope/mango_risk_check/blob/master/js/examples/example.ts
    const riskChecker = new MangoRiskCheck({
        connection: connection,
        // @ts-ignore
        mangoAccount: mangoAccount,
        // @ts-ignore
        mangoClient: mangoClient,
        // @ts-ignore
        mangoGroup: mangoGroup,
        owner: payer
    })

    try {
        await riskChecker.initializeRiskAccount(perpMarketConfig)
    } catch (error) {

    } finally {
        await Promise.all([
            riskChecker.setMaxOpenOrders(perpMarketConfig, 2),
            // @ts-ignore
            riskChecker.setMaxLongExposure(perpMarketConfig, perpMarket,1),
            // @ts-ignore
            riskChecker.setMaxShortExposure(perpMarketConfig, perpMarket, 1),
            riskChecker.setViolationBehaviour(perpMarketConfig, ViolationBehaviour.CancelIncreasingOrders)
        ])
    }

    const tokenIndex = mangoGroup.getTokenIndex(token.mintKey)

    let [tokenPrice, tokenPriceLastUpdated] = [
        mangoGroup.cachePriceToUi(
            mangoCache.getPrice(tokenIndex), tokenIndex
        ),
        new Date()
        // ^ The "last updated" timestamp for the cached token oracle price is
        // logged to check whether it hasn't updated in too long of a while
    ]

    mangoGroup.onCacheChange(connection, (mangoCache) => {
        [tokenPrice, tokenPriceLastUpdated] = [
            mangoGroup.cachePriceToUi(
                mangoCache.getPrice(tokenIndex), tokenIndex
            ),
            new Date()
        ]
    })

    const ws = new WebSocket('ws://api.mngo.cloud:8080')

    ws.onmessage = async (message) => {
        const { data } = message

        const perpEvent = JSON.parse(data.toString());

        const isSnapshot = perpEvent.hasOwnProperty('events')
        // ^ `events` is received when the connection is first established, containing a snapshot of past fills
        //   `event` is received in subsequent messages, containing one fill at a time

        const parseEvent = (event: string) =>
            PerpEventLayout.decode(Buffer.from(event, 'base64'))

        if (isSnapshot) {
            for (const event of perpEvent.events.map(parseEvent)) {
                const fill = perpMarket.parseFillEvent(event.fill)

            }
        } else {
            const event = parseEvent(perpEvent.event)

            const fill = perpMarket.parseFillEvent(event.fill)

            if (!(fill.maker.equals(mangoAccountPk))) {
                return
            }

            const mangoAccount = await mangoClient.getMangoAccount(mangoAccountPk, mangoGroup.dexProgramId)

            const basePosition = mangoAccount.perpAccounts[perpMarketConfig.marketIndex].getBasePositionUi(perpMarket)

            const perpMarketEventQueue = await perpMarket.loadEventQueue(connection)

            const unprocessedBasePosition = perpMarketEventQueue.getUnconsumedEvents()
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

            const completeBasePosition = basePosition + unprocessedBasePosition

            const tokenDeposit = mangoAccount.getUiDeposit(mangoCache.rootBankCache[tokenIndex], mangoGroup, tokenIndex)

            const openOrdersAccountPk = mangoAccount.spotOpenOrders[spotMarketConfig.marketIndex]

            const openOrdersAccountInfo = await connection.getAccountInfo(openOrdersAccountPk, 'processed')

            const openOrdersAccount = OpenOrders.fromAccountInfo(openOrdersAccountPk, openOrdersAccountInfo!, mangoGroup.dexProgramId)

            const tokenUnsettledBalance = new I80F48(openOrdersAccount.baseTokenFree)

            const tokenSpotBalance = parseFloat(tokenDeposit.add(tokenUnsettledBalance).toString())

            const { takerSide, price, quantity } = fill

            // @ts-ignore
            const counterside = { buy: 'sell', sell: 'buy' }[takerSide]

            console.log(`Got ${takerSide} hit for ${quantity} @ $${price}, hedging on ${counterside}...`)

            const tx = new Transaction({
                recentBlockhash: recentBlockHash.blockhash,
                feePayer: payer.publicKey
            })

            const instruction = await createSpotOrder2Instruction(
                mangoClient,
                mangoGroup,
                mangoAccount,
                spotMarket,
                payer,
                counterside,
                price,
                quantity,
                'ioc',
                undefined,
                true
            )

            tx.add(instruction!)

            tx.sign(payer)

            try {
                const response = await mangoClient.sendSignedTransaction({
                    signedTransaction: tx,
                    signedAtBlock: recentBlockHash,
                });

                console.log('hedge::response', response);
            } catch (error) {
                console.log('hedge::error', error);
            }

            console.table({
                eventType: 'fill',
                counterparty: fill.taker.toString(),
                price: fill.price,
                quantity: fill.quantity,
                completeBasePosition,
                tokenSpotBalance,
                timestamp: new Date(fill.timestamp.toNumber())
            })
        }
    }

    const quote = async () => {
        // const spread = tokenPrice! * 0.0005

        const spread = 0

        const [bidPriceUi, bidSizeUi] = [tokenPrice! - spread, 0.1]

        const [askPriceUi, askSizeUi] = [tokenPrice! + spread, 0.1]

        const [bidPrice, bidSize] = perpMarket.uiToNativePriceQuantity(bidPriceUi, bidSizeUi)

        const [askPrice, askSize] = perpMarket.uiToNativePriceQuantity(askPriceUi, askSizeUi)

        const tx = new Transaction({
            recentBlockhash: recentBlockHash.blockhash,
            feePayer: payer.publicKey
        })

        const timestamp = new BN(Date.now())

        // Use different order IDs for both sides of the quote - inconsistent state
        // issues on the program side might happen if we tried to cancel order by ID
        // otherwise.
        const [bidId, askId] = [timestamp.add(new BN(1)), timestamp]

        // ^ When using Time in Force orders, it's important to use *cluster time*
        // as it might drift from actual UNIX time every once and then, effectively
        // being different to what you'd get using Date.now().

        if (recentBlockTime === null) {
            console.log('Failed to fetch block time')

            return
        }

        const expiryTimestamp = new BN(recentBlockTime + 120)

        tx.add(
            makeCancelAllPerpOrdersInstruction(
                mangoGroupConfig.mangoProgramId,
                mangoGroupConfig.publicKey,
                mangoAccount.publicKey,
                payer.publicKey,
                perpMarket.publicKey,
                perpMarket.bids,
                perpMarket.asks,
                new BN(4)
            ),
            makePlacePerpOrder2Instruction(
                mangoGroupConfig.mangoProgramId,
                mangoGroupConfig.publicKey,
                mangoAccount.publicKey,
                payer.publicKey,
                mangoGroup.mangoCache,
                perpMarket.publicKey,
                perpMarket.bids,
                perpMarket.asks,
                perpMarket.eventQueue,
                mangoAccount.getOpenOrdersKeysInBasket(),
                new BN(bidPrice),
                new BN(bidSize),
                I64_MAX_BN,
                bidId,
                'buy',
                new BN(255),
                'postOnlySlide',
                false,
                undefined,
                expiryTimestamp
            ),
            makePlacePerpOrder2Instruction(
                mangoGroupConfig.mangoProgramId,
                mangoGroupConfig.publicKey,
                mangoAccount.publicKey,
                payer.publicKey,
                mangoGroup.mangoCache,
                perpMarket.publicKey,
                perpMarket.bids,
                perpMarket.asks,
                perpMarket.eventQueue,
                mangoAccount.getOpenOrdersKeysInBasket(),
                new BN(askPrice),
                new BN(askSize),
                I64_MAX_BN,
                askId,
                'sell',
                new BN(255),
                'postOnlySlide',
                false,
                undefined,
                expiryTimestamp
            ),
            // @ts-ignore
            tx.add(riskChecker.makeCheckRiskInstruction(perpMarketConfig, perpMarket))
        )

        tx.sign(payer)

        try {
            const response = await mangoClient.sendSignedTransaction({
                signedTransaction: tx,
                signedAtBlock: recentBlockHash,
            })

            console.log('quote::response', response)
        } catch (error) {
            console.log('quote::error', error);
        }
    }

    setInterval(quote, 1000)
}

async function createSpotOrder2Instruction(
    mangoClient: MangoClient,
    mangoGroup: MangoGroup,
    mangoAccount: MangoAccount,
    spotMarket: Market,
    owner: Payer,
    side: 'buy' | 'sell',
    price: number,
    size: number,
    orderType?: 'limit' | 'ioc' | 'postOnly',
    // @ts-ignore
    clientOrderId?: BN,
    useMsrmVault?: boolean | undefined
) {
    if (!owner.publicKey) {
        return;
    }
    const limitPrice = spotMarket.priceNumberToLots(price);
    const maxBaseQuantity = spotMarket.baseSizeNumberToLots(size);

    // TODO implement srm vault fee discount
    // const feeTier = getFeeTier(0, nativeToUi(mangoGroup.nativeSrm || 0, SRM_DECIMALS));
    const feeTier = getFeeTier(0, nativeToUi(0, 0));
    const rates = getFeeRates(feeTier);
    const maxQuoteQuantity = new BN(
        spotMarket['_decoded'].quoteLotSize.toNumber() * (1 + rates.taker),
    ).mul(
        spotMarket
            .baseSizeNumberToLots(size)
            .mul(spotMarket.priceNumberToLots(price)),
    );

    if (maxBaseQuantity.lte(ZERO_BN)) {
        throw new Error('size too small');
    }
    if (limitPrice.lte(ZERO_BN)) {
        throw new Error('invalid price');
    }
    const selfTradeBehavior = 'decrementTake';

    const spotMarketIndex = mangoGroup.getSpotMarketIndex(spotMarket.publicKey);

    if (!mangoGroup.rootBankAccounts.filter((a) => !!a).length) {
        await mangoGroup.loadRootBanks(mangoClient.connection);
    }
    let feeVault: PublicKey;
    if (useMsrmVault) {
        feeVault = mangoGroup.msrmVault;
    } else if (useMsrmVault === false) {
        feeVault = mangoGroup.srmVault;
    } else {
        const totalMsrm = await mangoClient.connection.getTokenAccountBalance(
            mangoGroup.msrmVault,
        );
        feeVault =
            totalMsrm?.value?.uiAmount && totalMsrm.value.uiAmount > 0
                ? mangoGroup.msrmVault
                : mangoGroup.srmVault;
    }

    const baseRootBank = mangoGroup.rootBankAccounts[spotMarketIndex];
    const baseNodeBank = baseRootBank?.nodeBankAccounts[0];
    const quoteRootBank = mangoGroup.rootBankAccounts[QUOTE_INDEX];
    const quoteNodeBank = quoteRootBank?.nodeBankAccounts[0];

    if (!baseRootBank || !baseNodeBank || !quoteRootBank || !quoteNodeBank) {
        throw new Error('Invalid or missing banks');
    }

    // Only pass in open orders if in margin basket or current market index, and
    // the only writable account should be OpenOrders for current market index

    const openOrdersKeys = zip(mangoAccount.spotOpenOrdersAccounts, range(0, mangoAccount.spotOpenOrdersAccounts.length))
        .filter(([openOrdersAccount, index]) => mangoAccount.inMarginBasket[index!] || index == spotMarketIndex)
        .map(([openOrdersAccount, index]) => (
            {
                pubkey: openOrdersAccount!.publicKey,
                isWritable: index == spotMarketIndex
            }
        ))

    const dexSigner = await PublicKey.createProgramAddress(
        [
            spotMarket.publicKey.toBuffer(),
            spotMarket['_decoded'].vaultSignerNonce.toArrayLike(Buffer, 'le', 8),
        ],
        spotMarket.programId,
    );

    const placeOrderInstruction = makePlaceSpotOrder2Instruction(
        mangoClient.programId,
        mangoGroup.publicKey,
        mangoAccount.publicKey,
        owner.publicKey,
        mangoGroup.mangoCache,
        spotMarket.programId,
        spotMarket.publicKey,
        spotMarket['_decoded'].bids,
        spotMarket['_decoded'].asks,
        spotMarket['_decoded'].requestQueue,
        spotMarket['_decoded'].eventQueue,
        spotMarket['_decoded'].baseVault,
        spotMarket['_decoded'].quoteVault,
        baseRootBank.publicKey,
        baseNodeBank.publicKey,
        baseNodeBank.vault,
        quoteRootBank.publicKey,
        quoteNodeBank.publicKey,
        quoteNodeBank.vault,
        mangoGroup.signerKey,
        dexSigner,
        feeVault,
        openOrdersKeys,
        side,
        limitPrice,
        maxBaseQuantity,
        maxQuoteQuantity,
        selfTradeBehavior,
        orderType,
        clientOrderId ?? new BN(Date.now()),
    );

    return placeOrderInstruction
}


main()
