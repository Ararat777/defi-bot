import {
  ParsedAccountData,
  ParsedInstruction,
  PartiallyDecodedInstruction,
  PublicKey,
  ParsedTransactionWithMeta,
  LAMPORTS_PER_SOL
} from "@solana/web3.js"
import { sha256 } from '@noble/hashes/sha256';
import { connection, umi } from '../config';
import { NATIVE_MINT } from '@solana/spl-token'
import {base64, bs58} from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import * as borsh from "@coral-xyz/borsh";
import {BorshCoder} from "@coral-xyz/anchor";
import {IDL} from "./pumpfun/sdk/IDL";
import { publicKey } from '@metaplex-foundation/umi';
import {fetchDigitalAsset} from '@metaplex-foundation/mpl-token-metadata'

const PumpFunProgram = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
const RaydiumProgram = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8")

const parsePumpSwap = async (transaction: ParsedTransactionWithMeta, instructions: Array<any>, pumpIxs: Array<any>) => {
  const buyDiscrimator = Buffer.from(sha256('global:buy').slice(0, 8));
  const sellDiscriminator = Buffer.from(sha256('global:sell').slice(0, 8));
  const buySellIxs = pumpIxs?.filter(ix =>  {
    const discriminator =  bs58.decode((ix as PartiallyDecodedInstruction).data).subarray(0, 8);
    return discriminator.equals(buyDiscrimator) || discriminator.equals(sellDiscriminator)
  })

  if(buySellIxs.length == 0){
    return { success: false, error: "NO_PUMP_SWAPS", data: null }
  }

  const innerInstructions = transaction.meta?.innerInstructions || []
  if (innerInstructions.length == 0) {
    return { success: false, error: "NO_INNER_INSTRUCTIONS", data: null }
  }

  const result = await Promise.all(buySellIxs.map(async (ix) => {
    const index = instructions.findIndex((element) => element == ix);
    ix = ix as PartiallyDecodedInstruction;
    const pumpInnerIxs = innerInstructions.filter((innerIx) => innerIx.index == index)
    let innerIxs = pumpInnerIxs[0].instructions.filter((ix) => ix.programId.equals(PumpFunProgram))

    if(innerIxs.length == 0){
      return null;
    }

    let buffer = bs58.decode((innerIxs[0] as PartiallyDecodedInstruction).data);
    buffer = buffer.slice(8);
    let coder = new BorshCoder(IDL as any);
    let args = coder.events.decode(base64.encode(buffer));
    if(!args){
      return null
    }
    let data = args.data;
    let tokenMint = data.mint.toBase58()

    let pKey = publicKey(tokenMint)
    const metadata = await fetchDigitalAsset(umi, pKey)
    const symbol = metadata.metadata.symbol
    const decimals = metadata.mint.decimals

    const supply = parseInt(metadata.mint.supply.toString()) / Math.pow(10, decimals)

    let swapType = data.isBuy ? 'buy' : 'sell'
    let solAmount = data.solAmount.toNumber() / LAMPORTS_PER_SOL;
    let tokenAmount = data.tokenAmount.toNumber() / Math.pow(10, decimals);
    let priceSol = solAmount / tokenAmount
    let mCap = supply * priceSol


    return {provider: "PUMPFUN", solAmount: solAmount, tokenAmount: tokenAmount, type: swapType, mint: tokenMint, trader: data.user.toBase58(), priceSol: priceSol, mCap: mCap, symbol: symbol}
  }))

  return { success: true, error: null, data: result.filter((d) => d != null) }
}

const parseRaySwap = async (transaction: ParsedTransactionWithMeta, instructions: Array<any>, rayIxs: Array<any>) => {
  const innerInstructions = transaction.meta?.innerInstructions || []

  const tradeSchema = borsh.struct([
    borsh.u8("discriminator"),
    borsh.u64("amountIn"),
    borsh.u64("minimumAmountOut")
  ])

  const swapIxs = rayIxs?.filter(ix =>  {
    const discriminator =  bs58.decode((ix as PartiallyDecodedInstruction).data).subarray(0, 1);
    return discriminator.equals(Buffer.from([9]))
  })

  if(swapIxs.length == 0){
    return { success: false, error: "NO_RAY_SWAPS", data: null }
  }

  const result = await Promise.all(swapIxs.map(async (ix) => {
    const index = instructions.findIndex((element) => element == ix);
    ix = ix as PartiallyDecodedInstruction;
    const ixDataArray = bs58.decode(ix.data);
    const ixData = tradeSchema.decode(ixDataArray);
    const coinPool = ix.accounts[5].toBase58();
    const pcPool = ix.accounts[6].toBase58();

    const coinPoolInfo = await connection.getParsedAccountInfo(new PublicKey(coinPool));
    const pcPoolInfo = await connection.getParsedAccountInfo(new PublicKey(pcPool));

    const coinPoolData = coinPoolInfo.value?.data as ParsedAccountData;
    const pcPoolData = pcPoolInfo.value?.data as ParsedAccountData;

    const coinMint = coinPoolData.parsed.info.mint;
    const pcMint = pcPoolData.parsed.info.mint;

    let wsolPool: string
    let tokenMint: string
    if(coinMint == NATIVE_MINT.toBase58()){
      wsolPool = coinPool
      tokenMint = pcMint
    }else if(pcMint == NATIVE_MINT.toBase58()){
      wsolPool = pcPool
      tokenMint = coinMint
    }else{
      return null
    }

    let pKey = publicKey(tokenMint)
    const metadata = await fetchDigitalAsset(umi, pKey)
    const symbol = metadata.metadata.symbol
    const decimals = metadata.mint.decimals

    const supply = parseInt(metadata.mint.supply.toString()) / Math.pow(10, decimals)

    const rayInnerIxs = innerInstructions.filter((innerIx) => innerIx.index == index)
    const instructionIn = (rayInnerIxs[0].instructions[0] as ParsedInstruction).parsed.info
    const instructionOut = (rayInnerIxs[0].instructions[1] as ParsedInstruction).parsed.info

    let swapType: string
    let solAmount: number
    let tokenAmount: number
    if(instructionIn.destination == wsolPool){
      swapType = 'buy'
      solAmount = instructionIn.amount / LAMPORTS_PER_SOL;
      tokenAmount = instructionOut.amount / Math.pow(10, decimals);
    }else{
      solAmount = instructionOut.amount / LAMPORTS_PER_SOL;
      tokenAmount = instructionIn.amount / Math.pow(10, decimals);
      swapType = 'sell'
    }
    let priceSol = solAmount / tokenAmount
    let mCap = supply * priceSol

    return {provider: "RAYDIUM", solAmount: solAmount, tokenAmount: tokenAmount, type: swapType, mint: tokenMint, trader: instructionIn.authority, priceSol: priceSol, mCap: mCap, symbol: symbol }
  }))

  return { success: true, error: null, data: result }
}

export const parseSwap = async (signature: string) => {
  const transaction = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'finalized' });

  if(!transaction){
    return { success: false, error: "TX_NOT_FOUND", data: null }
  }
  if(!transaction.meta){
    return { success: false, error: "META_IS_EMPTY", data: null }
  }
  if(transaction.meta.err != null){
    return { success: false, error: JSON.stringify(transaction.meta.err), data: null }
  }

  const instructions = transaction.transaction.message.instructions

  const pumpIxs = instructions.filter((ix) => ix.programId.equals(PumpFunProgram))
  const rayIxs = instructions.filter((ix) => ix.programId.equals(RaydiumProgram))

  if(pumpIxs && pumpIxs.length > 0) {
    return await parsePumpSwap(transaction, instructions, pumpIxs)
  }else if(rayIxs && rayIxs.length > 0){
    return await parseRaySwap(transaction, instructions, rayIxs)
  }else{
    return { success: false, error: "NO_INSTRUCTIONS", data: null }
  }
}