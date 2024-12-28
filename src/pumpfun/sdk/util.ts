import {
  Commitment,
  ComputeBudgetProgram,
  Connection,
  Finality,
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { PriorityFee, TransactionResult } from "./types";
import { JitoTransactionExecutor } from "./executors/jito";
import {publicKey} from "@coral-xyz/borsh";
import bs58 from "bs58";

export const DEFAULT_COMMITMENT: Commitment = "finalized";
export const DEFAULT_FINALITY: Finality = "finalized";

export const calculateWithSlippageBuy = (
  amount: bigint,
  basisPoints: bigint
) => {
  return amount + (amount * basisPoints) / 10000n;
};

export const calculateWithSlippageSell = (
  amount: bigint,
  basisPoints: bigint
) => {
  return amount - (amount * basisPoints) / 10000n;
};

export async function sendTx(
  connection: Connection,
  tx: Transaction,
  payer: PublicKey,
  signers: Keypair[],
  tip: number,
  priorityFees?: PriorityFee,
  commitment: Commitment = DEFAULT_COMMITMENT,
  finality: Finality = DEFAULT_FINALITY,
  useJito: Boolean = false
): Promise<TransactionResult> {
  let newTx = new Transaction();

  if (priorityFees && !useJito) {
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFees.unitPrice,
    });
    newTx.add(addPriorityFee);
  }

  newTx.add(tx);

  const latestBlockhash = await connection.getLatestBlockhash(commitment);
  let txResult: VersionedTransactionResponse | null = null
  try {
    if(useJito){
      let executor = new JitoTransactionExecutor(connection)
      let result = await executor.executeAndConfirm(newTx, signers[0], tip, latestBlockhash);
      console.log(result);
      let sig = result.signature || null;

      console.log(result.signature);
      if(!sig){
        return {
          success: false,
          error: "Transaction failed",
        };
      }
      let i = 0
      while (++i < 7 || !txResult){
        setTimeout(() => {}, 1000)
        txResult = await connection.getTransaction(sig, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        })
      }
      console.log(txResult);

      if (!txResult) {
        return {
          success: false,
          error: "Transaction failed",
        };
      }
      return {
        success: true,
        results: txResult,
      };
    }else{
      let versionedTx = await buildVersionedTx(connection, payer, newTx, commitment);
      versionedTx.sign(signers);

      const sig = await connection.sendTransaction(versionedTx, {
        skipPreflight: false,
      });
      console.log("sig:", `https://solscan.io/tx/${sig}`);

      txResult = await getTxDetails(connection, sig, commitment, finality);

      if (!txResult) {
        return {
          success: false,
          error: "Transaction failed",
        };
      }
      return {
        success: true,
        results: txResult,
      };
    }
  } catch (e) {
    if (e instanceof SendTransactionError) {
      let ste = e as SendTransactionError;
      console.log("SendTransactionError" + await ste.getLogs(connection));
    } else {
      console.error(e);
    }
    return {
      error: e,
      success: false,
    };
  }
}

export const buildVersionedTx = async (
  connection: Connection,
  payer: PublicKey,
  tx: Transaction,
  commitment: Commitment = DEFAULT_COMMITMENT
): Promise<VersionedTransaction> => {
  const blockHash = (await connection.getLatestBlockhash(commitment))
    .blockhash;

  let messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockHash,
    instructions: tx.instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
};

export const getTxDetails = async (
  connection: Connection,
  sig: string,
  commitment: Commitment = DEFAULT_COMMITMENT,
  finality: Finality = DEFAULT_FINALITY
): Promise<VersionedTransactionResponse | null> => {
  const latestBlockHash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: sig,
    },
    commitment
  );

  return connection.getTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    commitment: finality,
  });
};
