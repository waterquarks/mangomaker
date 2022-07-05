import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import WebSocket from 'ws'

function* spot() {
    const ws = new WebSocket('ws://mangolorians.com:8010/v1/ws')

    ws.onopen = (event) => {
        ws.send(JSON.stringify({
            'op': 'subscribe',
            'channel': 'level3',
            'markets': ['SOL-PERP']
        }))
    }

    ws.onmessage = (event) => {
        console.log(JSON.parse(event.data.toString()))
    }
}

const main = async () => {
    const db = await open({filename: './app.db', driver: sqlite3.Database})

    if (process.send === undefined) {
        process.exit()
    }

    // db.on('trace', console.log)

    await db.run('pragma journal_mode=WAL')

    await db.run('pragma synchronous=1')

    await db.run('drop table if exists orders')

    await db.run(`
        create table orders (
            market text,
            side text,
            order_id text,
            account text,
            price real,
            size real,
            primary key (market, side, order_id)
        ) without rowid
    `)

    // const ws = new WebSocket('ws://mangolorians.com:8010/v1/ws')

    const ws = new WebSocket('ws://localhost:8010/v1/ws')

    ws.onopen = (event) => {
        ws.send(JSON.stringify({
            'op': 'subscribe',
            'channel': 'level3',
            'markets': ['SOL-PERP']
        }))
    }

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data.toString())

        const { type } = data

        if (type === 'subscribed') {
            return
        }

        const { market } = data

        if (type === 'l3snapshot') {
            await db.run('delete from orders where market = ?', market)
        }

        if (type === 'open') {
            const { side, price, size, orderId, account } = data

            await db.run(
                'insert or replace into orders values (?, ?, ?, ?, ?, ?)',
                [market, side, orderId, account, price, size]
            )
        }

        if (type === 'done') {
            const { side, orderId } = data

            await db.run(
                'delete from orders where market = ? and side = ? and order_id = ?',
                [market, side, orderId]
            )
        }

        if (type === 'fill') {
            const { maker, account } = data

            if (maker && account === 'BFLAGijqDyRnK93scRizT8YSotrvdxhdJyWYZch6yMMW') {
                const { side, price, size } = data

                // @ts-ignore
                process.send({ ...data })
            }
        }
    }
}

main()