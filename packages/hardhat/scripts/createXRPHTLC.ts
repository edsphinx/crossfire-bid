import * as dotenv from "dotenv";
dotenv.config();
import { Client, Wallet, EscrowCreate } from "xrpl";
import axios from "axios";

async function main() {
  // --- 1. Get Swap UUID from command line arguments ---
  const uuid = process.argv[2];
  if (!uuid) {
    console.error("[ERROR] Please provide the swap UUID as a command line argument.");
    process.exitCode = 1;
    return;
  }
  console.log(`[DEBUG] Operating on swap with UUID: ${uuid}`);

  // --- 2. Configuration ---
  const API_URL = `http://localhost:3000/api/cross-chain-htlc-swaps/${uuid}`;
  const MONITOR_API_URL = "http://localhost:3000/api/htlc-monitor";
  const TESTNET_SERVER = "wss://s.altnet.rippletest.net:51233";

  const SENDER_SECRET = process.env.XRPL_SENDER_SECRET || "";
  if (!SENDER_SECRET) {
    throw new Error("XRPL_SENDER_SECRET is not set in .env");
  }

  // --- 3. Fetch Swap Data from API ---
  console.log(`[DEBUG] Step 3: Fetching swap data from API for UUID: ${uuid}...`);
  let swapData: any;
  try {
    const response = await axios.get(API_URL);
    swapData = response.data.data;
    console.log("[DEBUG] Swap data fetched successfully:", swapData);
  } catch (error: any) {
    console.error("[ERROR] Step 3 failed: Error fetching swap data from API:", error.response?.data || error.message);
    process.exitCode = 1;
    return;
  }

  // --- 4. Validate Swap Data ---
  console.log("[DEBUG] Step 4: Validating swap data...");
  const amount = swapData.amountNonEVM;
  const destinationAddress = swapData.takerNonEVMAddress;
  const condition = swapData.nonEVMDetails?.xrplCondition;
  const cancelAfter = swapData.evmTimelock;
  const finishAfter = swapData.evmPublicWithdrawTimelock;

  if (!amount) {
    throw new Error("Validation failed: amountNonEVM is missing from swap data.");
  }
  if (!destinationAddress) {
    throw new Error("Validation failed: takerNonEVMAddress is missing from swap data.");
  }
  if (!condition) {
    throw new Error("Validation failed: nonEVMDetails.xrplCondition is missing from swap data.");
  }
  if (!cancelAfter) {
    throw new Error("Validation failed: evmTimelock (for CancelAfter) is missing from swap data.");
  }
  if (!finishAfter) {
    throw new Error("Validation failed: evmPublicWithdrawTimelock (for FinishAfter) is missing from swap data.");
  }
  console.log("[DEBUG] Swap data validated successfully.");

  // --- 5. Create HTLC on XRP Ledger ---
  console.log("Connecting to XRP Ledger Testnet...");
  const client = new Client(TESTNET_SERVER);
  await client.connect();
  console.log("Connected to Testnet.");

  const senderWallet = Wallet.fromSecret(SENDER_SECRET);
  console.log(`Sender Address: ${senderWallet.address}`);

  try {
    console.log("[DEBUG] Getting current ledger index...");
    const ledger = await client.request({ command: "ledger", ledger_index: "validated" });
    const lastLedgerSequence = ledger.result.ledger_index + 100;
    console.log(
      `[DEBUG] Current ledger index: ${ledger.result.ledger_index}. Setting LastLedgerSequence to: ${lastLedgerSequence}`,
    );
    console.log("Creating HTLC (Escrow)...");
    const transaction: EscrowCreate = {
      Account: senderWallet.address,
      TransactionType: "EscrowCreate",
      Amount: amount,
      Destination: destinationAddress,
      CancelAfter: cancelAfter,
      FinishAfter: finishAfter,
      Condition: condition,
      LastLedgerSequence: lastLedgerSequence,
    };
    console.log(transaction);
    console.log("[DEBUG] Submitting EscrowCreate transaction...");

    console.log("[DEBUG] Preparing transaction (autofill)...");
    const prepared = await client.autofill(transaction);

    console.log("[DEBUG] Signing transaction...");
    const signed = senderWallet.sign(prepared);

    console.log("[DEBUG] Submitting transaction and waiting for validation...");
    const result = await client.submitAndWait(signed.tx_blob);
    console.log("[DEBUG] Transaction submitted and validated.");

    console.log("Response:", result);
    console.log("Transaction hash:", signed.hash);
    console.log("Escrow created successfully!");

    // --- 6. Update Swap Data in API ---
    console.log("[DEBUG] Step 6: Updating swap data in API...");
    const updateData = {
      status: "NON_EVM_ESCROW_LOCKED",
      nonEVMTxHash: signed.hash,
      nonEVMSequence: result.result.tx_json.Sequence,
    };
    await axios.put(API_URL, updateData);
    console.log("Swap data updated successfully.");

    // --- 7. Create HTLC Monitor record ---
    console.log("[DEBUG] Step 7: Creating HTLC Monitor record...");
    const monitorData = {
      swapUuid: uuid,
      chainType: "XRPL",
      status: "PENDING",
      txHash: signed.hash,
      secretHash: swapData.secretHash,
      timelock: cancelAfter,
    };
    await axios.post(MONITOR_API_URL, monitorData);
    console.log("HTLC Monitor record created successfully.");
  } catch (error: any) {
    console.error("Error creating HTLC (Escrow):", error.message);
    // --- Update API with error message ---
    try {
      await axios.put(API_URL, {
        status: "FAILED",
        errorMessage: `Error creating XRP HTLC: ${error.message}`,
      });
    } catch (apiError: any) {
      console.error("Error updating API with failure status:", apiError.response?.data || apiError.message);
    }
  }

  console.log("[DEBUG] Disconnecting from XRP Ledger Testnet...");
  await client.disconnect();
  console.log("[DEBUG] Disconnected.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
