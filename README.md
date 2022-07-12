# Mangomaker

## About

This is a very simple market maker for https://trade.mango.markets. It quotes perps and hedges in spot. With thoroughly commented code, it is intended to serve as a hands-on technical introduction to Mango Markets and as a starting point for your own bot.

This bot was written in anticipation to the [SRM trading competitions](https://twitter.com/mangomarkets/status/1545076351509712896).

## Quickstart

You will need:
- A Solana account with some SOL deposited to cover transaction fees
- A Mango account with some collateral deposited
- Your wallet keypair saved as a JSON file
- `node` and `yarn`


### Preliminary commands
```shell
git clone https://github.com/waterquarks/mangomaker && cd mangomaker # Clone this repo
yarn install # Install dependencies
```

### Devnet setup

#### Setting up a devnet Solana account

To get a devnet wallet with SOL, first create generate the wallet by installing the Solana CLI tools as per https://docs.solana.com/cli/install-solana-cli-tools and then generating a keypair using `solana-keygen new --outfile keypair.json`.

 Now airdrop some SOL to it using `solana airdrop 2 --verbose --url devnet --keypair ./keypair.json`. To And deposit some of it as collateral through the UI at https://devnet.mango.markets.

Finally execute the following commands within the repo:

```shell
npm install # 
```

You should see the orders quoted by the bot in the UI's orderbook.

### Mainnet setup

In mainnet:
If you've got the prerequisites covered already, run the example command changing MANGO_GROUP to `mainnet.1`.


## Meta learning resources

- [Technical introduction to the Serum DEX](https://docs.google.com/document/d/1isGJES4jzQutI0GtQGuqtrBUqeHxl_xJNXdtOv4SdII):
At the time of writing, all but information regarding the "Request Queue" is valid (the Request Queue doesn't exist anymore).

- [Technical introduction to Mango Markets](https://www.notion.so/mango-markets/Technical-Intro-to-Mango-Markets-15a650e4799e41c8bfc043fbf079e6f9).

## More example bots

- [market-maker-ts](https://github.com/blockworks-foundation/market-maker-ts), by daffy
- [World's simplest perps market maker](https://github.com/blockworks-foundation/mango-client-v3/blob/main/src/scripts/benchmarkOrders.ts) by Maximilian
- [serumExampleMarketMaker](https://github.com/blockworks-foundation/mango-client-v3/blob/main/src/scripts/serumExampleMarketMaker.ts), by waterquarks