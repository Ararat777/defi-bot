import { BlockhashWithExpiryBlockHeight, Keypair, Transaction } from '@solana/web3.js';

export interface TransactionExecutor {
  executeAndConfirm(
    transaction: Transaction,
    payer: Keypair,
    tip: number,
    latestBlockHash: BlockhashWithExpiryBlockHeight,
  ): Promise<{ confirmed: boolean; signature?: string, error?: string }>;
}