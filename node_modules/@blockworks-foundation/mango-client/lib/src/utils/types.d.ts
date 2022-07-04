import { Keypair } from '@solana/web3.js';
import { Adapter } from './adapterTypes';
import { PublicKey, Transaction } from '@solana/web3.js';
/** @internal */
export declare type Modify<T, R> = Omit<T, keyof R> & R;
export interface WalletAdapter {
    publicKey: PublicKey;
    connected: boolean;
    signTransaction: (transaction: Transaction) => Promise<Transaction>;
    signAllTransactions: (transaction: Transaction[]) => Promise<Transaction[]>;
    connect: () => any;
    disconnect: () => any;
}
export declare type PerpOrderType = 'limit' | 'ioc' | 'postOnly' | 'market' | 'postOnlySlide';
export declare type BlockhashTimes = {
    blockhash: string;
    timestamp: number;
};
export declare type Payer = Adapter | Keypair | WalletAdapter;
//# sourceMappingURL=types.d.ts.map