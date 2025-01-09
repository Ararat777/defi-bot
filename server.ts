import express from 'express';
import bodyParser from 'body-parser';
import {BorshCoder} from "@coral-xyz/anchor";
import {IDL} from "./src/pumpfun/sdk/IDL";
import fs from 'fs';

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

app.get("/clients", (req, res) => {
  console.log(expressWs.getWss().clients)
  res.sendStatus(200)
})

app.post("/", (req, res)=>{
  let txs: any = []
  let blocks = req.body
  blocks.forEach((block: any) => {
    let diff = (new Date().getTime() / 1000) - block.blockTime
    fs.writeFile('logs.log', `${getCurrentTime(null)} --- ${getCurrentTime(block.blockTime * 1000)} --- Diff: ${diff}\n`, { flag: 'a+' }, (err) => {
      return
    });

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



