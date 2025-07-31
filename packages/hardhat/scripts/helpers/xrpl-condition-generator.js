/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("crypto");
const { PreimageSha256 } = require("five-bells-condition");

function generatePreimageSha256() {
  const preimage = crypto.randomBytes(32);
  const fulfillment = new PreimageSha256();
  fulfillment.setPreimage(preimage);

  const condition = fulfillment.getConditionBinary().toString("hex").toUpperCase();
  const fulfillmentHex = fulfillment.serializeBinary().toString("hex").toUpperCase();
  const hashlock = "0x" + fulfillment.getHash().toString("hex");

  return {
    secret: preimage.toString("hex").toUpperCase(),
    hashlock: hashlock,
    condition: condition,
    fulfillment: fulfillmentHex,
  };
}

console.log(JSON.stringify(generatePreimageSha256()));
