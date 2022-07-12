# Mangomaker

## About

This is a very simple market maker for https://trade.mango.markets, built in anticipation to the [SRM trading competitions](https://twitter.com/mangomarkets/status/1545076351509712896). It quotes perps and hedges in spot. With thoroughly commented code, it is intended to serve as a hands-on technical introduction to Mango Markets and as a starting point for your own bot.

Happy to help you out with any questions - join the Discord at [discord.gg/mangomarkets](https://discord.gg/mangomarkets) and ask away in #dev-marketmaker.

## Quickstart

You will need `node` and `yarn` installed.

```shell
git clone https://github.com/waterquarks/mangomaker && cd mangomaker # Clone this repo
yarn install # Install dependencies
```

### On devnet

#### Setting up a Solana account

To get a devnet wallet with SOL, first create the wallet by installing the Solana CLI tools as per https://docs.solana.com/cli/install-solana-cli-tools and then generating a keypair using `solana-keygen new --outfile keypair.json`.

 Now airdrop some SOL to it using `solana airdrop 2 --verbose --url devnet --keypair ./keypair.json`, and some USDC as well with 

#### Creating a Mango account with collateral

Import `keypair.json` (you can use `cat keypair.json` to print these from within the shell) into your [Phantom](https://phantom.app) app and switch the network to devnet. Then go to https://devnet.mango.markets and deposit the collateral - video instructions here:

https://user-images.githubusercontent.com/28162761/178407586-806ba98f-4a90-4b99-b2ee-77da51598e17.mp4

#### Initializing the market maker

With the 2 previous steps covered, execute the following command, replacing MANGO_ACCOUNT with your own Mango account pubkey - you can fetch it from https://devnet.mango.markets/account, as per the following picture:

<img width="1512" alt="Screen Shot 2022-07-12 at 04 14 05" src="https://user-images.githubusercontent.com/28162761/178407428-296584d5-6e29-4281-be30-ec3b21c5993c.png">

You should see the orders quoted by the bot in the UI's orderbook.

## Meta learning resources

- [Technical introduction to the Serum DEX](https://docs.google.com/document/d/1isGJES4jzQutI0GtQGuqtrBUqeHxl_xJNXdtOv4SdII):
At the time of writing, all but information regarding the "Request Queue" is valid (the Request Queue doesn't exist anymore).

- [Technical introduction to Mango Markets](https://www.notion.so/mango-markets/Technical-Intro-to-Mango-Markets-15a650e4799e41c8bfc043fbf079e6f9).

## More example bots

- [market-maker-ts](https://github.com/blockworks-foundation/market-maker-ts), by daffy
- [World's simplest perps market maker](https://github.com/blockworks-foundation/mango-client-v3/blob/main/src/scripts/benchmarkOrders.ts) by Maximilian
- [serumExampleMarketMaker](https://github.com/blockworks-foundation/mango-client-v3/blob/main/src/scripts/serumExampleMarketMaker.ts), by waterquarks
