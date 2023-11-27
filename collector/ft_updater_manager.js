require('dotenv').config({
  path: '../.env'
});
const cluster = require('cluster');
const os = require('os');
const run = require('./ft_updater_service');
const mongo = require("../lib/mongo");

const numCPUs = Math.min(os.cpus().length, 5);

async function main() {
  if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);

    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died`);
    });
  } else {
    console.log(`Worker ${process.pid} started`);
    const db = await mongo(process.env.MONGO_DB, process.env.MONGO_URL);
    while (true) {
      await run(db, cluster.worker.id * 3);
    }
  }
}
main().catch(error => {
  console.error(error);
});
