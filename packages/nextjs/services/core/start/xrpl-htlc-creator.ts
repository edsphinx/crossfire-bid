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
 * @param onProgress Optional callback to report progress.
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
  onProgress?: (message: string) => void,
): Promise<XrplHtlcCreatorResult | null> {
  const logProgress = (message: string) => {
    console.log(message);
    if (onProgress) onProgress(message);
  };

  logProgress(`--- [DEBUG] Starting createXrplHtlc for UUID: ${uuid} ---`);

  // --- Configuration ---
  const API_URL = `http://localhost:3000/api/cross-chain-htlc-swaps/${uuid}`;
  const MONITOR_API_URL = "http://localhost:3000/api/htlc-monitor";
  const TESTNET_SERVER = "wss://s.altnet.rippletest.net:51233";

  const SENDER_SECRET = process.env.XRPL_SENDER_SECRET || "";
  if (!SENDER_SECRET) {
    throw new Error("XRPL_SENDER_SECRET is not set in .env");
  }

  // --- Validation of input parameters ---
  logProgress("[DEBUG] Step 1: Validating input parameters...");
  if (!amount || amount === "0") {
    throw new Error("Validation failed: XRP amount is missing or zero.");
  }
  if (!destinationAddress) {
    throw new Error("Validation failed: Destination address is missing.");
  }
  if (!condition) {
    throw new Error("Validation failed: HTLC condition is missing.");
  }
  if (!cancelAfter || !finishAfter) {
    throw new Error("Validation failed: CancelAfter or FinishAfter timelock is missing.");
  }
  if (finishAfter >= cancelAfter) {
    throw new Error("Validation failed: FinishAfter must be strictly less than CancelAfter.");
  }
  if (!secretHash) {
    throw new Error("Validation failed: Secret hash is missing.");
  }
  logProgress("[DEBUG] Input parameters validated successfully.");

  console.log(`secretHash: ${secretHash}`);
  // --- Connect to XRP Ledger ---
  logProgress("Connecting to XRP Ledger Testnet...");
  const client = new Client(TESTNET_SERVER);
  await client.connect();
  logProgress("Connected to Testnet.");

  const senderWallet = Wallet.fromSecret(SENDER_SECRET);
  logProgress(`Sender Address: ${senderWallet.address}`);

  try {
    logProgress("[DEBUG] Getting current ledger index...");
    const ledger = await client.request({ command: "ledger", ledger_index: "validated" });
    const lastLedgerSequence = ledger.result.ledger_index + 100;
    logProgress(
      `[DEBUG] Current ledger index: ${ledger.result.ledger_index}. Setting LastLedgerSequence to: ${lastLedgerSequence}`,
    );

    // --- XRP Ledger HTLC Component: EscrowCreate Transaction ---
    logProgress("Creating HTLC (Escrow) transaction...");
    const transaction: EscrowCreate = {
      Account: senderWallet.address,
      TransactionType: "EscrowCreate",
      Amount: amount,
      Destination: destinationAddress,
      CancelAfter: cancelAfter,
      Condition: condition,
      LastLedgerSequence: lastLedgerSequence,
    };
    logProgress(JSON.stringify(transaction, null, 2));
    logProgress("[DEBUG] Submitting EscrowCreate transaction...");

    const prepared = await client.autofill(transaction);
    const signed = senderWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    console.log(result);
    logProgress("[DEBUG] Transaction submitted and validated.");

    logProgress(`Transaction hash: ${signed.hash}`);
    logProgress("Escrow created successfully!");

    // --- HTLC Component: Database Update (Swap Record) ---
    logProgress("[DEBUG] Step 2: Updating swap data in API...");
    const updateData = {
      status: "NON_EVM_ESCROW_LOCKED",
      nonEVMTxHash: signed.hash,
      nonEVMSequence: result.result.tx_json.Sequence,
    };
    await axios.put(API_URL, updateData);
    logProgress("Swap data updated successfully.");

    // --- HTLC Component: Monitor Record (XRP Ledger Side) ---
    logProgress("[DEBUG] Step 3: Creating HTLC Monitor record for XRP Ledger side...");
    const monitorData = {
      swapUuid: uuid,
      chainType: "XRPL",
      status: "PENDING",
      txHash: signed.hash,
      secretHash: secretHash,
      timelock: cancelAfter,
    };
    await axios.post(MONITOR_API_URL, monitorData);
    logProgress("HTLC Monitor record created successfully for XRP Ledger side.");

    return { nonEVMTxHash: signed.hash, nonEVMSequence: result.result.tx_json.Sequence! };
  } catch (error: any) {
    logProgress(`Error creating HTLC (Escrow): ${error.message}`);
    try {
      await axios.put(API_URL, {
        status: "FAILED",
        errorMessage: `Error creating XRP HTLC: ${error.message}`,
      });
    } catch (apiError: any) {
      logProgress(`Error updating API with failure status: ${apiError.message}`);
    }
    return null;
  } finally {
    logProgress("[DEBUG] Disconnecting from XRP Ledger Testnet...");
    await client.disconnect();
    logProgress("[DEBUG] Disconnected.");
  }
}