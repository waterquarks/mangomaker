import {Connection} from "@solana/web3.js";
import {Config} from "@blockworks-foundation/mango-client";

async function main() {
    const config = Config.ids()

    const connection = new Connection(config.cluster_urls['mainnet'], 'processed')

    let recentBlockHash, recentBlockTime

    connection.onSlotChange(async function (slotInfo) {
        const { slot, parent, root } = slotInfo

        let [recentBlockHash, recentBlockTime] = await Promise.all([
            connection.getLatestBlockhash('finalized'),
            connection.getBlockTime(slot)
        ])

        console.log(recentBlockHash, recentBlockTime)
    })

}

main()