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

  // const accounts = [
  //   'EbNr5s54pCUFzEyBDjJWwqYQc7R5E8udmPEpDLwpbjKq',
  //   'G9fmyVHqWS94YRfyQjYVUdf8oPufkoxbUWCLiHJyR8Br',
  //   'vHRSMB5mSEYJvwiW55fHquPsH67hhGYe4iGPcJchtor',
  //   '9kf7oyNPHZB7TWcZZRewFMFwGNDKSEZKSSumMdaRYiuv',
  //   '5CP6zv8a17mz91v6rMruVH6ziC5qAL8GFaJzwrX9Fvup',
  //   'DecXrBS8ADaac7yqLcC6WxNNAfMhVsF1SHmvSNv66yDe',
  //   'Cogv5PSB1sPp5j9zxm73kd7RJsEo2Hf3e1TfUmXCfXku',
  //   'E4vNz3hayWb1foruhiAXW3QmAQYe8zFcR8PbJWtkMzJ1',
  //   '9xjHuRSgTpLHQuTfxPWFpxR7j8MtypaqxihMyVEAtGWo',
  //   'DijrEoJ9MTUvKFFTTa3haBRphnoz1kGEEquprSAk5adq',
  //   '2GstvpUP7xY2X5zGd2YeJ64uPVuVjfvoc9Bt4uNMmvCV',
  //   '5q7Xwc2T57sK1DKU6zuwVXvMPsxqB2xrJ3T5AonFYtcY',
  //   'VipjExwk6H7Wa5WdhESB474AEbbozNYWZU29YVw74ad',
  //   '9xjHuRSgTpLHQuTfxPWFpxR7j8MtypaqxihMyVEAtGWo',
  //   'DxsDJ22zei9TL25rwu5tquKGdkoPDCbz5japgeYbdXWq',
  //   '8R7fk3ooWZdDVY6UzrK5KDHUEdmoePqzLrifNPQ3b5kP',
  //   'vaa9Pbk9XVGQ9b6PLAvR46zatgNF196Uz9FRhwpSCRx',
  //   '7GHHRCrJ9HNa5QiZwLvEFaLP6mdobFjGXLtefvJePChi',
  //   'AE6Xb2143g4PR9hW3nYMMwzgEh7qu2j5W9zouaUHXbvr',
  //   '5cbstrVqvSWtK1ZzdQpNaMx6xqHZrv23X1CgAfJznLz5',
  //   'AKLiD5KCVFvniFyYvT8CVH48oGKV4KApFEWFU8RbLq4Q',
  //   'FBU6uFyuFHzSrzPoR89nNsKPf7JvW2237aPLVtUMfPhH',
  //   'BPt9C8Hgp77QiMjecwvkZCx3BTDSuggeLkNKyh9U7dUv',
  //   '9fQYZyxTUWkv7JsXVkgvKmNZBDGTsdMjCkedfmCfBjML',
  //   '8xucMh5W5qAgNfpXQ7z8xgs3T5uDrDrtbTSPanhGgBbH'
  // ];

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