/* eslint-disable @typescript-eslint/no-require-imports */
("use strict");
const dotenv = require("dotenv");
dotenv.config();
const xrpl = require("xrpl");
const cc = require("five-bells-condition");

// Useful Documentation:-
// 1. five-bells-condition: https://www.npmjs.com/package/five-bells-condition
// 2. Crypto module: https://nodejs.org/api/crypto.html

// Your seed value, for testing purposes you can make one with the faucet:
// https://xrpl.org/resources/dev-tools/xrp-faucets
const seed = "sEdTpAusKGaS1xeabsadi5ddi6Nwx57";

async function main() {
  try {
    // Connect ----------------------------------------------------------------
    const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
    await client.connect();

    const sender_seed = process.env.XRPL_SENDER_SECRET || "";
    const receiver_address = process.env.RECEIVER_ADDRESS || "";

    if (!sender_seed || !receiver_address) {
      throw new Error("XRPL_SENDER_SECRET and RECEIVER_ADDRESS must be set in .env");
    }

    // Prepare wallet to sign the transaction ---------------------------------
    const wallet = await xrpl.Wallet.fromSeed(sender_seed);
    console.log("Wallet Address: ", wallet.address);
    console.log("Seed: ", seed);
    console.log("Receiver Address: ", receiver_address);

    // Set the escrow finish time ---------------------------------------------
    let finishAfter = new Date(new Date().getTime() / 1000 + 120); // 2 minutes from now
    finishAfter = new Date(finishAfter * 1000);
    console.log("This escrow will finish after: ", finishAfter);

    // Construct condition and fulfillment ------------------------------------
    const PREIMAGE = Buffer.from(fs.readFileSync("./seed.txt", "utf-8").trim(), "hex");
    if (PREIMAGE.length === 0) {
      throw new Error("PREIMAGE must be set in seed.txt");
    }
    const preimageData = PREIMAGE;
    const myFulfillment = new cc.PreimageSha256();
    myFulfillment.setPreimage(preimageData);
    const conditionHex = myFulfillment.getConditionBinary().toString("hex").toUpperCase();
    const fulfillmentHex = myFulfillment.serializeBinary().toString("hex").toUpperCase();

    console.log("Condition:", conditionHex);
    console.log("Fulfillment:", fulfillmentHex);

    // const HASH_LOCK = "bc56a649b00d7434ee0f72a3021aeac8541dd80ce331dab31090619bc4c1b052";
    // const SECRET = "f11c3a3acb8ed830bc2bd3d3013dae50a992a7b04da98ddf2278c1f8416dc74c";
    // console.log("HASH_LOCK:", HASH_LOCK);
    // console.log("SECRET:", SECRET);

    // Prepare EscrowCreate transaction ------------------------------------
    const escrowCreateTransaction = {
      TransactionType: "EscrowCreate",
      Account: wallet.address,
      Destination: receiver_address,
      Amount: "100000", //drops XRP
      DestinationTag: 2023,
      Condition: conditionHex, // Omit this for time-held escrows
      Fee: "12",
      FinishAfter: xrpl.isoTimeToRippleTime(finishAfter.toISOString()),
    };

    xrpl.validate(escrowCreateTransaction);

    // Sign and submit the transaction ----------------------------------------
    console.log("Signing and submitting the transaction:", JSON.stringify(escrowCreateTransaction, null, "\t"), "\n");
    const response = await client.submitAndWait(escrowCreateTransaction, { wallet });
    console.log(`Sequence number: ${response.result.tx_json.Sequence}`);
    console.log(`Finished submitting! ${JSON.stringify(response.result, null, "\t")}`);

    await client.disconnect();
  } catch (error) {
    console.log(error);
  }
}

main();
