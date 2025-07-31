const { ethers } = require("ethers");
const crypto = require("crypto");

function generateHashlock() {
  const preimage = crypto.randomBytes(32);
  const hashlock = ethers.sha256(preimage);

  return {
    secret: `0x${preimage.toString("hex")}`,
    hashlock: hashlock,
  };
}

console.log(JSON.stringify(generateHashlock()));
