import express from 'express';
import bodyParser from 'body-parser';
import {BorshCoder} from "@coral-xyz/anchor";
import {IDL} from "./src/pumpfun/sdk/IDL";
import fs from 'fs';

const app = express();
const expressWs = require('express-ws')(app);
const port = process.env.PORT || 3000;

app.use(bodyParser.json())

const decodedData = (data: string) => {
  let coder = new BorshCoder(IDL as any);
  let args = coder.events.decode(data);
  if(!args){
    return null
  }else{
    return args.data
  }
}

app.get("/clients", (req, res) => {
  console.log(expressWs.getWss().clients)
  res.sendStatus(200)
})

app.post("/", (req, res)=>{
  let txs: any = []
  req.body.forEach((tx: any) => {
    fs.writeFile('logs.log', `${new Date()} --- ${new Date(tx.blockTime * 1000)} --- ${new Date(tx.sTime)} --- ${tx.signature}\n`, { flag: 'a+' }, (err) => {
      return
    });
    tx.instructions.forEach((ix: any) => {
      let ixData = decodedData(ix)
      if(ixData){
        let pumpEvent: any = { signature: tx.signature, slot: tx.slot + 1, block_time: tx.blockTime }
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



