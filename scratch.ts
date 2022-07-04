import * as child_process from "child_process";

const listener = child_process.fork('./listen')

listener.on('message', ((message) => {
    console.log(message)
}))