import { tgBot, MY_TG_ID } from "./bot";
import { db_client } from "../prisma";
import pm2 from 'pm2';

const addAccount = async (address: string) => {
  let account = await db_client.account.findUnique({
    where: {
      address: address,
    },
  })
  if(!account){
    await db_client.account.create({
      data: {
        address: address
      }
    })

    pm2.restart('listener', (err, proc) => {
      // Disconnects from PM2
      tgBot.api.sendMessage(MY_TG_ID, `Failed to restart listener: ${err.message}`)
      pm2.disconnect()
    })
  }

  await tgBot.api.sendMessage(MY_TG_ID, 'Ok')
};

const removeAccount = async (address: string) => {
  await db_client.account.delete({
    where: {
      address: address
    }
  })

  pm2.restart('listener', (err, proc) => {
    // Disconnects from PM2
    tgBot.api.sendMessage(MY_TG_ID, `Failed to restart listener: ${err.message}`)
    pm2.disconnect()
  })

  await tgBot.api.sendMessage(MY_TG_ID, 'Ok')
};

tgBot.on("message", async (ctx) => {
  const message = ctx.message; // the message object
  if(!message.text) return;

  const parts = message.text.split(" ");
  if(parts.length == 0) return;

  if (parts[0] == '/add_acc') {
    const account = parts[1];
    await addAccount(account);
  }else if(parts[0] == '/rm_acc'){
    const account = parts[1];
    await removeAccount(account);
  }else if(parts[0] == '/list_accs'){
    const accounts = await db_client.account.findMany()
    const addresses = accounts.map((a) => `<a href="https://solscan.io/account/${a.address}">${a.address}</a>`)
    await tgBot.api.sendMessage(MY_TG_ID, addresses.join('\n'), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
  }
});

tgBot.start();