const apiResult = require("../lib/api-result2");
const path = require("path");
const {generateImage, shouldCreateFile} = require("../lib/imageGenerator");
const express = require("express");
const router = express.Router();
const fs = require("fs");
const timestamp = () => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return Math.floor(now.getTime() / 1000);
}

let dbInstance;

router.get('/:identity', async function (req, res, next) {

  console.log(`[${req.method}] ${req.originalUrl}`);

  let identity = req.params.identity.toLowerCase().replace(/^@/, '');

  const cachePath = path.join(__dirname, '..', 'cache', identity + '.html');
  const cachePathJson = path.join(__dirname, '..', 'cache', identity + '.json');
  if (!shouldCreateFile(cachePath)) {
    return res.sendFile(cachePath);
  }

  let address = identity;
  if (!identity.match(/^0x[0-9a-f]{40}$/)) {
    address = await apiResult.getAddressByTwitter(await dbInstance.getDb(), identity);
    if (!address) {
      return res.status(404).send({ error: 'Not found' });
    }
  }
  const userInfo = await apiResult.getUserForImage(await dbInstance.getDb(), address);
  let html = fs.readFileSync(path.resolve(__dirname + '/../public/index.html')).toString();
  if (!userInfo) {
    return res.status(404).send({ error: 'Not found' });
  }
  const ogHtml = `<meta name="twitter:card" content="summary_large_image" />
                    <meta name="twitter:site" content="@alojzy20829086" />
                    <meta name="twitter:creator" content="@alojzy20829086" />
                    <meta property="og:url" content="https://4friends.tech/${userInfo.twitterUsername || userInfo.address}" />
                    <meta property="og:title" content="${userInfo.twitterName || userInfo.address}'s friend.tech portfolio" />
                    <meta property="og:description" content="Trading fees earned: ${userInfo.tradingFeesEarned}. Portfolio value: ${userInfo.portfolioValue}" />
                    <meta property="og:image" content="https://4friends.tech/images/generated/${userInfo.address}.png?${timestamp()}" />
                    `;

  html = html.replace(/<\/title>/, `</title>${ogHtml}`);
  res
    .setHeader('Cache-Control', 'public, max-age=3600')
    .send(html);

  await fs.promises.writeFile(cachePath, html, 'utf8');
  await fs.promises.writeFile(cachePathJson, JSON.stringify(userInfo), 'utf8');
});

module.exports = (_dbInstance) => {
  dbInstance = _dbInstance;
  return router;
}
