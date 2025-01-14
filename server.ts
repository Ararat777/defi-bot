import express from 'express';
import bodyParser from 'body-parser';
import {BorshCoder} from "@coral-xyz/anchor";
import {IDL} from "./src/pumpfun/sdk/IDL";
import fs from 'fs';
import { pumpBuy, pumpSell } from "./src/pumpfun/swap";
import {connection} from "./config";
import {PartiallyDecodedInstruction, PublicKey} from "@solana/web3.js";
import {bs58} from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Bot } from "grammy";

export const tgBot = new Bot(process.env.BOT_TOKEN as string);

const app = express();
const expressWs = require('express-ws')(app);
const port = process.env.PORT || 3000;

app.use(bodyParser.json({limit: '200mb'}))

const pumpProgramId = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const decodedData = (data: string) => {
  let coder = new BorshCoder(IDL as any);
  let args = coder.events.decode(data);
  if(!args){
    return null
  }else{
    return args.data
  }
}

const getCurrentTime = (milliSeconds: number | null) => {
  let now: any;
  if(milliSeconds == null){
    now = new Date();
  }else{
    now = new Date(milliSeconds);
  }

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

app.post("/decode_data", (req, res) => {
  let resp: any;

  let data = req.body.data;
  let decoded = decodedData(data);
  if(decoded.isBuy != null){
    let mint = decoded.mint.toBase58()
    let user = decoded.user.toBase58()
    let isBuy = decoded.isBuy
    let tokenAmount = decoded.tokenAmount.toNumber()
    let solAmount = decoded.solAmount.toNumber()

    resp = {mint: mint, user: user, isBuy: isBuy, tokenAmount: tokenAmount, solAmount: solAmount}
  }else{
    resp = {error: "Invalid Data"}
  }
  res.status(200).json(resp);
})

app.post("/pump_trade", async (req, res) => {
  let isBuy = req.body.isBuy;
  let mint = req.body.mint;
  let amount = req.body.amount;
  let fee = req.body.fee;
  let tip = req.body.tip;

  let resp: any;

  if(isBuy){
    resp = await pumpBuy(mint, amount, fee, tip);
  }else{
    resp = await pumpSell(mint, amount, fee, tip);
  }
  res.status(200).json({ sig: resp })
});

app.post("/pump_withdraw", async (req, res) => {
  let blocks = req.body
  blocks.forEach((block: any) => {
    let diff = (new Date().getTime() / 1000) - block.blockTime
    console.log("Diff: ", diff)
    // if(diff > 60){
    //   return
    // }

    block.signatures.forEach(async (sig: any) => {
      let resp = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 })
      if(!resp){
        return
      }

      let migrationTokens: string[] = []
      let pumpIxs = resp.transaction.message.instructions.filter((i) => i.programId.toBase58() == pumpProgramId)
      pumpIxs.forEach((ix) => {
        ix = ix as PartiallyDecodedInstruction

        let buffer = bs58.decode(ix.data);

        let coder = new BorshCoder(IDL as any);
        let args = coder.instruction.decode(buffer);
        if(args?.name == 'withdraw'){
          migrationTokens.push(ix.accounts[2].toBase58())
        }
      })

      let token = new PublicKey(migrationTokens[0]);
      console.log(token)

      let signatures = await connection.getSignaturesForAddress(token, { before: sig})
      signatures = signatures.filter((s: any) => s.err == null)

      if(signatures.length > 30){
        console.log(signatures.length)
        return
      }
      console.log(signatures.length)

      let insiderSigs: string[] = []

      for (const data of signatures) {
        let sign = data.signature;
        let tx = await connection.getParsedTransaction(sign, { maxSupportedTransactionVersion: 0 })
        if(!tx){
          continue;
        }

        if(tx.transaction.signatures.length > 1){
          insiderSigs.push(sign)
        }
      }

      if(insiderSigs.length > 3){
        tgBot.api.sendMessage(process.env.MY_TG_ID as string, `Migration of token: ${token.toBase58()}\nBlock time diff: ${diff}\nTxs: ${signatures.length}\nInsider Txs: ${insiderSigs.length}`)
      }
    })
  })

  res.sendStatus(200)
})

app.post("/stream_data", async (req, res)=>{
  let txs: any = []
  let blocks = req.body
  blocks.forEach((block: any) => {
    let diff = (new Date().getTime() / 1000) - block.blockTime
    console.log(`${getCurrentTime(null)} --- ${getCurrentTime(block.blockTime * 1000)} --- Diff: ${diff}`)

    block.transactions.forEach((tx: any) => {
      tx.instructions.forEach((ix: any) => {
        let ixData = decodedData(ix)
        if(ixData){
          let pumpEvent: any = { signature: tx.signature, slot: block.slot + 1, block_time: block.blockTime }
          if(ixData.bondingCurve){
            let mint = ixData.mint.toBase58()
            let dev = ixData.user.toBase58()
            pumpEvent.method = "CREATE"
            pumpEvent.mint = mint
            pumpEvent.dev = dev
          }else if(ixData.isBuy != null){
            let mint = ixData.mint.toBase58()
            let user = ixData.user.toBase58()
            let isBuy = ixData.isBuy
            let tokenAmount = ixData.tokenAmount.toNumber()
            let solAmount = ixData.solAmount.toNumber()
            pumpEvent.method = isBuy ? "BUY" : "SELL"
            pumpEvent.mint = mint
            pumpEvent.user = user
            pumpEvent.tokenAmount = tokenAmount
            pumpEvent.solAmount = solAmount
          }

          txs.push(pumpEvent)
        }else{
          return
        }
      })
    })
  })

  expressWs.getWss().clients.forEach(function each(client: any) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(txs));
    }
  });

  res.sendStatus(200)
});

expressWs.app.ws('/ws', function(ws: any, req: any) {
  ws.on('message', function(msg: any) {
    console.log(msg);
  });
});

app.listen(port, ()=> console.log("App Listening on port 3000"));



