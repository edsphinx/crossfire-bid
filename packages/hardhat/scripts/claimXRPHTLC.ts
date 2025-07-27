import * as dotenv from "dotenv";
dotenv.config();
import { Client, Wallet, EscrowFinish } from "xrpl";

async function main() {
  // --- CONFIGURATION ---
  const TESTNET_SERVER = "wss://s.altnet.rippletest.net:51233";

  const RECEIVER_SECRET = process.env.XRPL_RECEIVER_SECRET || "";
  const SENDER_ADDRESS = "rLqCZBkhbzwvw5XPT6FUamtoTXmcLYMBQG";

  const CONDITION = "A025802073ACB68F1057686782650590DED71FD5138A2DF2AFD9DBF14B970ED8C066E051810120";
  const SECRET = "372755FCCB20451F7BC8E46E27AB2CAFC5D4B1CAA7954BE0C6E15F55287F38FA";

  console.log("Connecting to XRP Ledger Testnet...");
  const client = new Client(TESTNET_SERVER);
  await client.connect();
  console.log("Connected to Testnet.");

  if (!RECEIVER_SECRET) {
    throw new Error("RECEIVER_SECRET is not set in .env");
  }

  console.log("Preparing wallet");
  const receiverWallet = Wallet.fromSecret(RECEIVER_SECRET);
  console.log(`Receiver Address: ${receiverWallet.address}`);

  console.log("Preparing EscrowFinish transaction");
  try {
    console.log("[DEBUG] Getting sequence number of the EscrowCreate transaction...");
    const account_tx = await client.request({
      command: "account_tx",
      account: SENDER_ADDRESS,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: 1,
    });

    if (
      !account_tx.result ||
      !account_tx.result.transactions ||
      account_tx.result.transactions.length === 0 ||
      !account_tx.result.transactions[0].tx ||
      !account_tx.result.transactions[0].tx.Sequence
    ) {
      throw new Error("Could not find the EscrowCreate transaction or its sequence number.");
    }
    const sequence = account_tx.result.transactions[0].tx.Sequence;
    console.log(`[DEBUG] Sequence number of EscrowCreate: ${sequence}`);

    const transaction: EscrowFinish = {
      TransactionType: "EscrowFinish",
      Account: receiverWallet.address,
      Owner: SENDER_ADDRESS,
      OfferSequence: sequence,
      Condition: CONDITION,
      Fulfillment: SECRET,
    };

    console.log("[DEBUG] Preparing transaction (autofill)...");
    const prepared = await client.autofill(transaction);

    console.log("[DEBUG] Signing transaction...");
    const signed = receiverWallet.sign(prepared);

    console.log("[DEBUG] Submitting transaction and waiting for validation...");
    const result = await client.submitAndWait(signed.tx_blob);
    console.log("[DEBUG] Transaction submitted and validated.");

    console.log("Response:", result);
    console.log("Transaction hash:", signed.hash);
    console.log("Escrow claimed successfully!");
  } catch (error: any) {
    console.error("Error claiming HTLC (Escrow):", error.message);
  }

  console.log("[DEBUG] Disconnecting from XRP Ledger Testnet...");
  await client.disconnect();
  console.log("[DEBUG] Disconnected.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
