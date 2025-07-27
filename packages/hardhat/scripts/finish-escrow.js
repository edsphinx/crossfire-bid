/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const xrpl = require("xrpl");

// Preqrequisites:
// 1. Create an escrow using the create-escrow.js snippet
// 2. Replace the OfferSequence with the sequence number of the escrow you created
// 3. Replace the Condition and Fulfillment with the values from the escrow you created
// 4. Paste the seed of the account that created the escrow
// 5. Run the snippet

const seed = "sEdSyYKgJr3RPvoxgL8uxTT9A8STSmg";
const offerSequence = parseInt("9183996");
const condition = "A02580203A8D2014038BB72ABC4C5B5A70AA5710180555B3578B73ECC20BD044E65A2155810120";
const fulfillment = "A02280209BD2C87F650670C925F0B58428C20F55C25242EA54844B3E44A8F19111AEC785";

console.log("Escrow Finish");
console.log("-------------");
console.log("Offer Sequence: ", offerSequence);
console.log("Condition: ", condition);
console.log("Fulfillment: ", fulfillment);
console.log("Seed: ", seed);

const main = async () => {
  try {
    // Connect ----------------------------------------------------------------
    const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
    await client.connect();

    // Prepare wallet to sign the transaction ---------------------------------
    const wallet = await xrpl.Wallet.fromSeed(seed);
    console.log("Wallet Address: ", wallet.address);
    console.log("Seed: ", seed);
    const sender_address = "rLqCZBkhbzwvw5XPT6FUamtoTXmcLYMBQG";

    if (!offerSequence || condition === "" || fulfillment === "") {
      throw new Error("Please specify the sequence number, condition and fulfillment of the escrow you created");
    }

    // Prepare EscrowFinish transaction ---------------------------------
    const escrowFinishTransaction = {
      Account: wallet.address,
      TransactionType: "EscrowFinish",
      Owner: sender_address,
      // This should equal the sequence number of the escrow transaction
      OfferSequence: offerSequence,
      // Crypto condition that must be met before escrow can be completed, passed on escrow creation.
      // Omit this for time-held escrows.
      Condition: condition,
      // Fulfillment of the condition, passed on escrow creation.
      // Omit this for time-held escrows.
      Fulfillment: fulfillment,
    };
    console.log("EscrowFinish transaction:", JSON.stringify(escrowFinishTransaction, null, "\t"));

    console.log("Validating transaction...");
    xrpl.validate(escrowFinishTransaction);
    console.log("Transaction is valid.");

    // Sign and submit the transaction ----------------------------------------
    console.log("Signing and submitting the transaction:", JSON.stringify(escrowFinishTransaction, null, "\t"));
    const response = await client.submitAndWait(escrowFinishTransaction, { wallet });
    console.log(`Finished submitting! ${JSON.stringify(response.result, null, "\t")}`);

    await client.disconnect();
  } catch (error) {
    console.log(error);
  }
};

main();
