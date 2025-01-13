import express from 'express';
import bodyParser from 'body-parser';
import {BorshCoder} from "@coral-xyz/anchor";
import {IDL} from "./src/pumpfun/sdk/IDL";
import fs from 'fs';
import { pumpBuy, pumpSell } from "./src/pumpfun/swap";

const app = express();
const expressWs = require('express-ws')(app);
const port = process.env.PORT || 3000;

app.use(bodyParser.json({limit: '200mb'}))

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



