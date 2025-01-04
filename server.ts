import express from 'express';
import bodyParser from 'body-parser';
import {BorshCoder} from "@coral-xyz/anchor";
import {IDL} from "./src/pumpfun/sdk/IDL";

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
  req.body.forEach((tx: any) => {
    let instructions = tx.instructions.map((ix: any) => {
      let ixData = decodedData(ix)
      if(ixData){
        if(ixData.bondingCurve){
          let mint = ixData.mint.toBase58()
          let dev = ixData.user.toBase58()
          return { method: "CREATE", mint: mint, dev: dev }
        }else if(ixData.isBuy != null){
          let mint = ixData.mint.toBase58()
          let user = ixData.user.toBase58()
          let isBuy = ixData.isBuy
          let tokenAmount = ixData.tokenAmount.toNumber()
          let solAmount = ixData.solAmount.toNumber()

          return { method: isBuy ? "BUY" : "SELL", mint: mint, user: user, tokenAmount: tokenAmount, solAmount: solAmount }
        }
      }else{
        return
      }
    })

    let dataToSend = {signature: tx.signature, slot: tx.slot + 1, instructions: instructions}

    expressWs.getWss().clients.forEach(function each(client: any) {
      if (client.readyState === 1) {
        client.send(JSON.stringify(dataToSend));
      }
    });
  })
  res.sendStatus(200)
});

expressWs.app.ws('/ws', function(ws: any, req: any) {
  ws.on('message', function(msg: any) {
    console.log(msg);
  });
});

app.listen(port, ()=> console.log("App Listening on port 3000"));



