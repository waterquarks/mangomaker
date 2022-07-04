import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { Cluster, GroupConfig } from '../config';
export default function initGroup(connection: Connection, payer: Keypair, cluster: Cluster, groupName: string, mangoProgramId: PublicKey, serumProgramId: PublicKey, quoteSymbol: string, quoteMint: PublicKey, feesVault: PublicKey, validInterval: number, quoteOptimalUtil: number, quoteOptimalRate: number, quoteMaxRate: number): Promise<GroupConfig | undefined>;
//# sourceMappingURL=initGroup.d.ts.map