const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

function shouldCreateFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {

        const currentDate = new Date();
        currentDate.setMinutes(0, 0, 0);

        if (stats.birthtime > currentDate) {
          return false;
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  return true;
}

async function generateImage(
  userInfo,
  outputDir = path.join(__dirname, '..', 'public', 'images', 'generated'),
  template = path.join(__dirname, '..', 'images', 'template.png')
) {
  const outputImagePath = path.join(outputDir, `${userInfo.address}.png`);
  if (!shouldCreateFile(outputImagePath)) {
    return;
  }
  const compositeElements = [];
  const username = userInfo.twitterUsername ? `@${userInfo.twitterUsername}` : userInfo.address.replace(/^(0x.{4}).*(.{4})$/, '$1...$2');
  let usernameX = 70;
  try {
    const response = await axios.get(userInfo.twitterPfpUrl, { responseType: 'arraybuffer' });
    const circleSvg = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="20" fill="white" /></svg>`;
    const roundedAvatar = await sharp(response.data)
      .resize(48, 48)
      .composite([{
        input: Buffer.from(circleSvg),
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();
    compositeElements.push({ input: roundedAvatar, top: 17, left: 21 });
  } catch (e) {
    usernameX = 21;
    console.error(e);
  }
  compositeElements.push({
    input: Buffer.from(`<svg width="503" height="247">
      <text x="${usernameX}" y="47" font-family="Arial" font-size="16" fill="black">${username}</text>
      <text x="231" y="153" font-family="Arial" font-size="20" fill="rgba(33,37,41)" text-anchor="end">${userInfo.portfolioValue}</text>
      <text x="470" y="153" font-family="Arial" font-size="20" fill="rgba(33,37,41)" text-anchor="end">${userInfo.tradingFeesEarned}</text>
      <text x="231" y="172" font-family="Arial" font-size="14" fill="rgba(33,37,41)" text-anchor="end">${userInfo.portfolioValueUsd}</text>
      <text x="470" y="172" font-family="Arial" font-size="14" fill="rgba(33,37,41)" text-anchor="end">${userInfo.tradingFeesEarnedUsd}</text>
      <text x="480" y="240" font-family="Arial" font-size="8" fill="rgba(33,37,41)" text-anchor="end">${(new Date).toUTCString()}</text>
    </svg>`), top: 0, left: 0, cutout: false
  });

  const outputImage = await sharp(template)
    .composite(compositeElements)
    .png()
    .toBuffer();

  await sharp(outputImage).toFile(outputImagePath);

  return outputImagePath;
}

module.exports = {
  generateImage,
  shouldCreateFile
}
