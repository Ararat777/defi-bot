const fs = require('fs');

function main() {
    const blocks = []
    const data = fs.readFileSync('./SOLANA_MAINNET-BLOCK-313948442.json', 'utf8');
    const jsonData = JSON.parse(data);

    jsonData.forEach((block) => {
        if(block == null){
            return;
        }

        let blockData = { blockTime: block.blockTime, slot: block.parentSlot, signatures: []}

        block.transactions.forEach(transaction => {
            const meta = transaction.meta;
            if(meta.err != null || meta.innerInstructions.length == 0){
                return
            }

            let pumpProgramLog = 'Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [1]'
            let withdrawLog = 'Program log: Instruction: Withdraw';

            let logs = meta.logMessages;
            let index = logs.indexOf(pumpProgramLog)
            if(index != -1 && logs[index + 1] == withdrawLog){
                blockData.signatures.push(transaction.transaction.signatures[0])
            }
        })

        if(blockData.signatures.length > 0){
            console.log(blockData.signatures.length)
            blocks.push(blockData);
        }
    })

    if(blocks.length > 0){
        console.log(blocks)
    }else{
        return null
    }
}

main();