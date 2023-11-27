const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const roundToDecimal = (num, decimalPlaces) => {
    const multiplier = Math.pow(10, decimalPlaces);
    return Math.round(num * multiplier) / multiplier;
}

module.exports = {
  sleep,
  roundToDecimal
}
