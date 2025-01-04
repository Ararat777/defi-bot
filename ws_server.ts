import WebSocket from 'ws';
import { connection } from './config';
import {PublicKey} from "@solana/web3.js";
import {db_client} from "./src/prisma";
import {BorshCoder} from "@coral-xyz/anchor";
import {IDL} from "./src/pumpfun/sdk/IDL";

const wss = new WebSocket.Server({ port: 8080 });


const decodedData = (data: string) => {
  let coder = new BorshCoder(IDL as any);
  let args = coder.events.decode(data);
  if(!args){
    return null
  }else{
    return args.data
  }
}
const parseProgramLogs = (logs: Array<string>) => {
  let instructions = []

  let sellLog = /^Program log: Instruction: Sell$/
  let buyLog = /^Program log: Instruction: Buy$/
  let createLog = /^Program log: Instruction: Create$/

  let sellLogs = logs.filter(log => sellLog.test(log))
  let buyLogs = logs.filter(log => buyLog.test(log))
  let createLogs = logs.filter(log => createLog.test(log))

  if(buyLogs.length == 0 && sellLogs.length == 0 && createLogs.length == 0){
    return null
  }

  let pumpProgramLog2 = 'Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [2]'
  let pumpProgramLog3 = 'Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [3]'

  let logs2 = logs.filter(log => log == pumpProgramLog2)
  let logs3 = logs.filter(log => log == pumpProgramLog3)

  if(logs2.length == 0 && logs3.length == 0){
    return null
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
          if(data.bondingCurve){
            let mint = data.mint.toBase58()
            let dev = data.user.toBase58()
            instructions.push({ method: "CREATE", mint: mint, dev: dev })
          }else if(data.isBuy != null){
            let mint = data.mint.toBase58()
            let user = data.user.toBase58()
            let isBuy = data.isBuy
            let tokenAmount = data.tokenAmount.toNumber()
            let solAmount = data.solAmount.toNumber()

            instructions.push({ method: isBuy ? "BUY" : "SELL", mint: mint, user: user, tokenAmount: tokenAmount, solAmount: solAmount })
          }
        }
      }
    }
  }

  return instructions
}

wss.on('connection', (ws: WebSocket) => {
  console.log('New client connected');

  ws.on('message', (publicKey: string) => {
    connection.onLogs(
      new PublicKey(publicKey.toString()),
      (updatedAccountInfo, context) => {
        if(!updatedAccountInfo.err){
          console.log(updatedAccountInfo.signature, new Date().toISOString())
          let data = parseProgramLogs(updatedAccountInfo.logs)
          if(data){
            let res = { signature: updatedAccountInfo.signature, slot: context.slot, data: data }
            ws.send(JSON.stringify(res))
          }
        }
      },
      "processed",
    );
  })

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});
