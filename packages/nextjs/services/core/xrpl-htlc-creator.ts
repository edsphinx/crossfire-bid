import axios from "axios";
import * as dotenv from "dotenv";
import { Client, EscrowCreate, Wallet } from "xrpl";

dotenv.config();

interface XrplHtlcCreatorResult {
  nonEVMTxHash: string;
  nonEVMSequence: number;
}

/**
 * Creates an HTLC (Escrow) on the XRP Ledger for a given swap.
 *
 * @param uuid The UUID of the cross-chain swap.
 * @param amount The amount of XRP to lock (as string).
 * @param destinationAddress The XRP Ledger address of the recipient.
 * @param condition The XRP Ledger HTLC condition (preimage-sha-256 format).
 * @param cancelAfter The Unix timestamp after which the escrow can be cancelled by the sender.
 * @param finishAfter The Unix timestamp after which the escrow can be finished by the recipient.
 * @param secretHash The hash of the secret (for monitoring).
 * @returns A Promise that resolves with an object containing the XRP Ledger transaction hash and sequence, or null if an error occurs.
 */
export async function createXrplHtlc(
  uuid: string,
  amount: string,
  destinationAddress: string,
  condition: string,
  cancelAfter: number,
  finishAfter: number,
  secretHash: string,
): Promise<XrplHtlcCreatorResult | null> {
  console.log(`--- [DEBUG] Starting createXrplHtlc for UUID: ${uuid} ---`);

  // --- Configuration ---
  const API_URL = `http://localhost:3000/api/cross-chain-htlc-swaps/${uuid}`;
  const MONITOR_API_URL = "http://localhost:3000/api/htlc-monitor";
  const TESTNET_SERVER = "wss://s.altnet.rippletest.net:51233";
  console.log(`[DEBUG] API_URL: ${API_URL}`);
  console.log(`[DEBUG] secretHash: ${secretHash}`);
  const SENDER_SECRET = process.env.XRPL_SENDER_SECRET || "";
  console.log(`[DEBUG] SENDER_SECRET: ${SENDER_SECRET}`);
  if (!SENDER_SECRET) {
    throw new Error("XRPL_SENDER_SECRET is not set in .env");
  }

  // --- Validation of input parameters ---
  console.log("[DEBUG] Step 1: Validating input parameters...");
  if (!amount || amount === "0") {
    throw new Error("Validation failed: XRP amount is missing or zero.");
  }
  if (!destinationAddress) {
    throw new Error("Validation failed: Destination address is missing.");
  }
  if (!condition) {
    throw new Error("Validation failed: HTLC condition is missing.");
  }
  // HTLC Component: Timelocks (XRP Ledger Side)
  // `FinishAfter` (reclamation timelock) must be less than `CancelAfter` (cancellation timelock).
  // These timestamps are crucial for the security and atomicity of the swap.
  if (!cancelAfter || !finishAfter) {
    throw new Error("Validation failed: CancelAfter or FinishAfter timelock is missing.");
  }
  if (finishAfter >= cancelAfter) {
    throw new Error("Validation failed: FinishAfter must be strictly less than CancelAfter.");
  }
  if (!secretHash) {
    throw new Error("Validation failed: Secret hash is missing.");
  }
  console.log("[DEBUG] Input parameters validated successfully.");

  // --- Connect to XRP Ledger ---
  console.log("Connecting to XRP Ledger Testnet...");
  const client = new Client(TESTNET_SERVER);
  await client.connect();
  console.log("Connected to Testnet.");

  const senderWallet = Wallet.fromSecret(SENDER_SECRET);
  console.log(`Sender Address: ${senderWallet.address}`);

  try {
    console.log("[DEBUG] Getting current ledger index...");
    const ledger = await client.request({ command: "ledger", ledger_index: "validated" });
    const lastLedgerSequence = ledger.result.ledger_index + 100; // Set a reasonable ledger expiry
    console.log(
      `[DEBUG] Current ledger index: ${ledger.result.ledger_index}. Setting LastLedgerSequence to: ${lastLedgerSequence}`,
    );

    // --- XRP Ledger HTLC Component: EscrowCreate Transaction ---
    // This transaction locks the XRP funds until the `Condition` is met or `CancelAfter` is reached.
    console.log("Creating HTLC (Escrow) transaction...");
    const transaction: EscrowCreate = {
      Account: senderWallet.address,
      TransactionType: "EscrowCreate",
      Amount: amount,
      Destination: destinationAddress,
      CancelAfter: cancelAfter, // HTLC critical component
      FinishAfter: finishAfter, // HTLC critical component
      Condition: condition, // HTLC critical component
      LastLedgerSequence: lastLedgerSequence, // Ensures transaction doesn't stay pending indefinitely
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

    // --- HTLC Component: Database Update (Swap Record) ---
    // Update the main swap record with the XRP Ledger transaction details.
    console.log("[DEBUG] Step 2: Updating swap data in API...");
    const updateData = {
      status: "NON_EVM_ESCROW_LOCKED",
      nonEVMTxHash: signed.hash,
      nonEVMSequence: result.result.tx_json.Sequence, // Crucial for EscrowFinish
    };
    await axios.put(API_URL, updateData);
    console.log("Swap data updated successfully.");

    // --- HTLC Component: Monitor Record (XRP Ledger Side) ---
    // This record is for the off-chain resolver service to monitor the XRP Ledger HTLC.
    console.log("[DEBUG] Step 3: Creating HTLC Monitor record for XRP Ledger side...");
    const monitorData = {
      swapUuid: uuid,
      chainType: "XRPL",
      status: "PENDING",
      txHash: signed.hash,
      secretHash: secretHash,
      timelock: cancelAfter, // The timelock after which the XRP Ledger HTLC can be cancelled
      // The resolver will need to know when it can claim (FinishAfter) vs. when it can be cancelled (CancelAfter)
    };
    await axios.post(MONITOR_API_URL, monitorData);
    console.log("HTLC Monitor record created successfully for XRP Ledger side.");

    return { nonEVMTxHash: signed.hash, nonEVMSequence: result.result.tx_json.Sequence! };
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
    return null; // Return null on error
  } finally {
    console.log("[DEBUG] Disconnecting from XRP Ledger Testnet...");
    await client.disconnect();
    console.log("[DEBUG] Disconnected.");
  }
}
