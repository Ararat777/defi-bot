import { connection } from './config';
import {LAMPORTS_PER_SOL, PublicKey} from "@solana/web3.js";
import {BorshCoder} from "@coral-xyz/anchor";
import {PumpFun, IDL} from "./src/pumpfun/sdk/IDL";
import {pumpBuy, pumpSell} from './src/pumpfun/swap'
import { db_client } from "./src/prisma";



const PumpFunProgram = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")

const createTransaction = async (user: string ,mint: string, solAmount: number, tokenAmount: number, isBuy: boolean, sig: string) => {
  let account = await createAccount(user)
  let token = await db_client.token.findUnique({
    where: {
      address: mint,
    },
  })

  if(!token){
    return
  }

  let operation = isBuy ? { increment: tokenAmount } : { decrement: tokenAmount }
  let holder = await createHolder(account?.id, token?.id)

  await db_client.$transaction([
    db_client.transaction.create({
      data: {
        solAmount: solAmount,
        tokenAmount: tokenAmount,
        isBuy: isBuy,
        holder: { connect: { id: holder?.id }},
        token: { connect: { id: token?.id }},
        signature: sig
      }
    }),
    db_client.holder.update({
      where: {id: holder?.id},
      data: {
        tokenAmount: operation
      }
    })
  ])
}

const createToken = async (mint: string) =>{
  try{
    return await db_client.token.create({
        data: {
          address: mint,
        },
    })
  }catch(error: any){
    if (error.code === 'P2002') {
      console.error(error.message);

      return await db_client.token.findUnique({
        where: {
          address: mint,
        },
      })
    } else {
      throw error;
    }
  }
}

const createAccount = async (mint: string) =>{
  try{
    return await db_client.account.create({
      data: {
        address: mint,
      },
    })
  }catch(error: any){
    if (error.code === 'P2002') {
      console.error(error.message);

      return await db_client.account.findUnique({
        where: {
          address: mint,
        },
      })
    } else {
      throw error;
    }
  }
}

const createHolder = async (account_id: any, token_id: any) =>{
  try{
    return await db_client.holder.create({
      data: {
        token: { connect: { id: token_id }},
        account: { connect: { id: account_id }}
      }
    })
  }catch (error: any) {
    if (error.code === 'P2002') {
      console.error(error.message);

      return await db_client.holder.findFirst({
        where: {
          accountId: account_id,
          tokenId: token_id,
        },
      })
    } else {
      throw error;
    }
  }
}

const decodedData = (data: string) => {
  let coder = new BorshCoder(IDL as any);
  let args = coder.events.decode(data);
  if(!args){
    return null
  }else{
    return args.data
  }
}


const handleTransaction = async (logs: Array<string>, sig: string) => {
  let sellLog = /^Program log: Instruction: Sell$/
  let buyLog = /^Program log: Instruction: Buy$/
  let createLog = /^Program log: Instruction: Create$/

  let sellLogs = logs.filter(log => sellLog.test(log))
  let buyLogs = logs.filter(log => buyLog.test(log))
  let createLogs = logs.filter(log => createLog.test(log))

  if(buyLogs.length == 0 && sellLogs.length == 0 && createLogs.length == 0){
    return
  }

  let pumpProgramLog2 = 'Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [2]'
  let pumpProgramLog3 = 'Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [3]'

  let logs2 = logs.filter(log => log == pumpProgramLog2)
  let logs3 = logs.filter(log => log == pumpProgramLog3)
  if(logs2.length == 0 && logs3.length == 0){
    return
  }

  let fromIndex = 0
  for (const log of logs) {
    const index = logs.indexOf(log, fromIndex);
    fromIndex = index + 1;
    if(log == pumpProgramLog2 || log == pumpProgramLog3){
      let logData = logs[index + 3]
      let dataMatch = logData.match(/Program data: (.+)/);
      if (dataMatch && dataMatch[1]) {
        let programData = dataMatch[1];
        let data = decodedData(programData)
        if(data){
          try{
            if(data.bondingCurve){
              let mint = data.mint.toBase58()
              let dev = data.user.toBase58()

              let token = await createToken(mint)
              let account = await createAccount(dev)

              db_client.holder.create({
                data: {
                  isDev: true,
                  token: { connect: { id: token?.id }},
                  account: { connect: { id: account?.id }}
                }
              })
            }else if(data.isBuy != null){
              let mint = data.mint.toBase58()
              let user = data.user.toBase58()
              let isBuy = data.isBuy
              let tokenAmount = data.tokenAmount.toNumber()
              let solAmount = data.solAmount.toNumber()

              await createTransaction(user, mint, solAmount, tokenAmount, isBuy, sig)
            }
          }catch(error: any){
            throw error
          }
        }
      }
    }
  }
}

(async () => {
  connection.onLogs(
    PumpFunProgram,
    (updatedAccountInfo, context) => {
      if(!updatedAccountInfo.err){
        handleTransaction(updatedAccountInfo.logs, updatedAccountInfo.signature)
      }
    },
    "confirmed",
  );
})();
