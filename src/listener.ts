import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection } from '../config';
import { parseSwap } from "./parser";
import { tgBot, MY_TG_ID } from "./tg_bot/bot";
import { db_client } from "./prisma";

(async () => {

  const ERRORS_TO_SKIP = ["NO_PUMP_SWAPS", "NO_RAY_SWAPS", "NO_INSTRUCTIONS"]

  const accounts = await db_client.account.findMany()
  if (accounts.length == 0) {
    console.error("No accounts found in the database")
    return
  }
  const addresses = accounts.map((a) => a.address)

  const handleTransaction = async (account: PublicKey, signature: string) => {
    // try{
      let result: any
      let i = 0

      while(++i < 20){
        console.log(`Attempt ${i} for ${signature}`)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        result = await parseSwap(signature);
        console.log(result)
        if(result.success){
          break
        }else if(result.error != "TX_NOT_FOUND"){
          break
        }
      }
      let chunks = [`<a href="https://solscan.io/tx/${signature}">Transaction</a> | <a href="https://solscan.io/account/${account.toBase58()}">Acc</a>`]
      chunks.push(`#${account.toBase58().split('').slice(-8).join('')}`)
      if(result.success){
        result.data.forEach((r: any) => {
          let emoji = r.type == 'buy' ? '🟩' : '🟥';
          chunks.push('--------------------------------')
          chunks.push(`$${r.symbol} ${emoji} ${r.type}`)
          chunks.push(`<b>${r.provider}</b>\n<b>SOL amount</b>: ${r.solAmount}\n<b>Token amount</b>: ${r.tokenAmount}`)
          chunks.push(`\n<b>Price</b>: ${r.priceSol} SOL\n<b>Market cap</b>: ${r.mCap} SOL`)
          chunks.push(`\n\n ${r.mint}`)
          chunks.push(`<a href="https://dexscreener.com/solana/${r.mint}">Dexscreener</a>`)
          if(r.provider == 'PUMPFUN'){
            chunks.push(`<a href="https://pump.fun/coin/${r.mint}">PumpFun</a>`)
          }
        })
        chunks.push('--------------------------------')
        chunks.push(`${new Date().toISOString()}`)
        let msg = chunks.join('\n')
        await tgBot.api.sendMessage(MY_TG_ID,msg, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      }else{
        if (!ERRORS_TO_SKIP.includes(result.error)) {
          chunks.push(`Error: ${result.error}`)
          let msg = chunks.join('\n')
          await tgBot.api.sendMessage(MY_TG_ID,msg, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
        }
      }
    // } catch (error: any) {
    //   console.error(`Error processing transaction ${signature}:`, error);
    //   await tgBot.api.sendMessage(MY_TG_ID, `Error processing transaction ${signature}: ${error.message}`);
    // }
  }

  addresses.forEach((account) => {
    connection.onLogs(
      new PublicKey(account),
      (updatedAccountInfo, context) => handleTransaction(new PublicKey(account), updatedAccountInfo.signature),
      "confirmed",
    );
  })
})();