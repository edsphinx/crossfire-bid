/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const cc = require("five-bells-condition");
const crypto = require("crypto");
const fs = require("fs");

// This script is the source of truth for the secret (preimage).
// It always generates a new secret, saves it to a file,
// and outputs a JSON object with the condition and fulfillment.
const secretBuffer = crypto.randomBytes(32);
const secretHex = secretBuffer.toString("hex").toUpperCase();

fs.writeFileSync("./preimageData.txt", secretHex);

const fulfillment = new cc.PreimageSha256();
fulfillment.setPreimage(secretBuffer);

const condition = fulfillment.getConditionBinary().toString("hex").toUpperCase();
const fulfillmentHex = fulfillment.serializeBinary().toString("hex").toUpperCase();
const hashlock = crypto.createHash("sha256").update(secretBuffer).digest("hex").toUpperCase();

const output = {
  secret: secretHex,
  hashlock: "0x" + hashlock,
  condition: condition,
  fulfillment: fulfillmentHex,
};

console.log(JSON.stringify(output, null, 2));
