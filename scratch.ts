import * as child_process from "child_process";

const {
    MANGO_GROUP
} = process.env

const listener = child_process.fork(
    './poll_latest_blockhash',
    { env: { MANGO_GROUP } }
)

listener.on('message', ((message) => {
    console.log(message)
}))