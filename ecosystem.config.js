module.exports = {
  apps : [
      {
        name   : "server1",
        script : "./server.ts",
        interpreter: "tsx",
        log_file: "./logs/listener.log",
        pid_file: "./pids/listener.pid",
        env: {
          PORT: 3000,
        }
      },
    {
      name   : "server2",
      script : "./server.ts",
      interpreter: "tsx",
      log_file: "./logs/poller.log",
      pid_file: "./pids/poller.pid",
      env: {
        PORT: 3001,
      }
    },
  ]
}
