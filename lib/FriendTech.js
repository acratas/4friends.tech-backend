const BN = require('bn.js');

class FriendTech {
   protocolFeePercent;
   subjectFeePercent;

  constructor(protocolFeePercent = '50000000000000000', subjectFeePercent = '50000000000000000') {
    this.protocolFeePercent = this.toBigNumber(protocolFeePercent);
    this.subjectFeePercent = this.toBigNumber(subjectFeePercent);
  }

  toBigNumber(value) {
    return new BN(value.toString());
  }

  getPrice(supply, amount) {
    const bnSupply = this.toBigNumber(supply);
    const bnAmount = this.toBigNumber(amount);
    const sixteenThousand = new BN('16000');

    const sum1 = bnSupply.isZero() ? new BN(0) : bnSupply.sub(new BN(1)).mul(bnSupply).mul(bnSupply.mul(new BN(2)).sub(new BN(1))).div(new BN(6));
    const sum2 = bnSupply.add(bnAmount).sub(new BN(1)).mul(bnSupply.add(bnAmount)).mul(bnSupply.add(bnAmount).mul(new BN(2)).sub(new BN(1))).div(new BN(6));
    const summation = sum2.sub(sum1);

    return summation.mul(new BN("1000000000000000000")).div(sixteenThousand);
  }

  getBuyPrice(supply, amount) {
    return this.getPrice(supply, amount);
  }

  getSellPrice(supply, amount) {
    return this.getPrice(this.toBigNumber(supply).sub(this.toBigNumber(amount)), amount);
  }

  getBuyPriceAfterFee(supply, amount) {
    const price = this.getBuyPrice(supply, amount);
    const protocolFee = price.mul(this.protocolFeePercent).div(new BN("1000000000000000000"));
    const subjectFee = price.mul(this.subjectFeePercent).div(new BN("1000000000000000000"));
    return price.add(protocolFee).add(subjectFee);
  }

  getSellPriceAfterFee(supply, amount) {
    const price = this.getSellPrice(supply, amount);
    const protocolFee = price.mul(this.protocolFeePercent).div(new BN("1000000000000000000"));
    const subjectFee = price.mul(this.subjectFeePercent).div(new BN("1000000000000000000"));
    return price.sub(protocolFee).sub(subjectFee);
  }
}

module.exports = FriendTech;
