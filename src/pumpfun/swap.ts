import {Keypair, LAMPORTS_PER_SOL, PublicKey} from "@solana/web3.js";
import { connection, owner } from '../../config'
import { DEFAULT_DECIMALS, PumpFunSDK } from "./sdk";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  getSPLBalance,
  printSOLBalance,
  printSPLBalance,
} from "./utils";

const SLIPPAGE_BASIS_POINTS = 500n

const getProvider = () => {
  const wallet = new NodeWallet(new Keypair());
  return new AnchorProvider(connection, wallet, { commitment: "finalized" });
};

export const pumpBuy = async (mintStr: String, amount: number, fee: number, tip: number) => {
  const provider = getProvider();
  const sdk = new PumpFunSDK(provider);
  const mint = new PublicKey(mintStr);

  const buyResults = await sdk.buy(
    owner,
    mint,
    BigInt(amount * LAMPORTS_PER_SOL),
    tip,
    SLIPPAGE_BASIS_POINTS,
    {
      unitPrice: fee * (LAMPORTS_PER_SOL * 1000_000),
    }
  );

  if (buyResults.success) {
    return buyResults.signature;
  } else {
    console.log("Buy failed");
    return null
  }
}

export const pumpSell = async (mintStr: String, amount: number, fee: number, tip: number) => {
  const provider = getProvider();
  const sdk = new PumpFunSDK(provider);
  const mint = new PublicKey(mintStr);

  await printSOLBalance(connection, owner.publicKey, "Test Account keypair");

  const currentSPLBalance = await getSPLBalance(
    sdk.connection,
    mint,
    owner.publicKey
  );
  console.log("currentSPLBalance", currentSPLBalance);

  if (currentSPLBalance) {
    const amountToSell = BigInt(Math.round((currentSPLBalance * (amount / 100)) * Math.pow(10, DEFAULT_DECIMALS)))
    const sellResults = await sdk.sell(
      owner,
      mint,
      amountToSell,
      tip,
      SLIPPAGE_BASIS_POINTS,
      {
        unitPrice: fee * (LAMPORTS_PER_SOL * 1000_000),
      }
    );
      // await printSOLBalance(sdk.connection, owner.publicKey, "Test Account keypair");
      // printSPLBalance(sdk.connection, mint, owner.publicKey, "After SPL sell all");

    if (sellResults.success) {
      return sellResults.signature;
    } else {
      console.log("Buy failed");
      return null
    }
  }
}