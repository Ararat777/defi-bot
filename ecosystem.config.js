module.exports = {
  apps : [
      {
        name   : "listener",
        script : "./src/listener.ts",
        interpreter: "tsx",
        log_file: "./logs/listener.log",
        pid_file: "./pids/listener.pid",
      },
    {
      name   : "poller",
      script : "./src/tg_bot/poller.ts",
      interpreter: "tsx",
      log_file: "./logs/poller.log",
      pid_file: "./pids/poller.pid",
    },
  ]
}
