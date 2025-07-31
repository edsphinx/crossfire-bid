import axios from "axios";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { Client, EscrowFinish, Wallet, validate } from "xrpl";

dotenv.config();

// Interfaz para la respuesta genérica de la API
interface ApiResponse<T> {
  success: boolean;
  data: T; // La propiedad 'data' ahora contiene el tipo genérico T
  message?: string;
  error?: string;
}

// Interfaz para los datos del swap tal como se esperan del backend
interface SwapData {
  uuid: string;
  status: string;
  makerEVMAddress: string;
  takerEVMAddress: string;
  makerNonEVMAddress: string; // This is the XRPL Account that created the escrow (Owner in EscrowFinish)
  takerNonEVMAddress: string; // This is the XRPL Destination of the escrow (Account in EscrowFinish)
  makerEVMTokenAddress: string;
  amountEVM: string;
  amountNonEVM: string;
  secretHash: string;
  secret: string; // This is the PREIMAGE, which becomes the Fulfillment
  evmChainId: string;
  nonEVMChainType: string;
  xrplCondition: string; // This is the Condition
  evmTxHash: string;
  evmTimelock: number;
  evmPublicWithdrawTimelock: number;
  safetyDepositAmount: string;
  xrplOfferSequence?: number; // OfferSequence del EscrowCreate
  nonEVMTxHash?: string; // Hash del EscrowCreate
  // Añade otros campos que puedan ser relevantes de tu DB
}

interface XrplHtlcCloserResult {
  xrplFinishTxHash: string;
}

/**
 * Convierte un Buffer a su representación hexadecimal en mayúsculas.
 * @param buffer El Buffer a convertir.
 * @returns La cadena hexadecimal en mayúsculas.
 */
function bufferToHex(buffer: Buffer): string {
  return buffer.toString("hex").toUpperCase();
}

/**
 * Genera la Crypto-Condition (Condition) y el Fulfillment para un secreto (preimage).
 * Esto replica la funcionalidad de five-bells-condition.PreimageSha256 para XRPL HTLCs.
 * @param preimage El Buffer del secreto (preimage).
 * @returns Un objeto con la Condition y el Fulfillment en formato hexadecimal.
 */
function generateXrplHtlcConditionAndFulfillmentFromPreimage(preimage: Buffer): {
  condition: string;
  fulfillment: string;
} {
  // --- GENERACIÓN DEL FULFILLMENT ---
  // five-bells-condition serializa el fulfillment con un prefijo especial.
  // El formato para PreimageSha256 es A0228020<preimage>
  // A0: Tipo de secuencia/estructura
  // 22: Longitud del resto de la secuencia (34 bytes = 0x22 hex)
  // 80: Prefijo para el tipo de cumplimiento (PreimageSha256)
  // 20: Longitud del preimage (32 bytes = 0x20 hex)
  // <preimage>: El preimage real (32 bytes)

  const fulfillmentBytes = Buffer.concat([
    Buffer.from([0xa0, 0x22, 0x80, 0x20]), // Prefijo y metadatos
    preimage, // El preimage real
  ]);
  const fulfillment = bufferToHex(fulfillmentBytes);

  // --- GENERACIÓN DE LA CONDITION ---
  // La Condition usa el hash SHA-256 del preimage.
  // Formato: A0258020<hashlock>810120
  // Donde <hashlock> es el hash SHA-256 del preimage.
  const hash = crypto.createHash("sha256").update(preimage).digest();
  const hashHex = bufferToHex(hash);
  const condition = `A0258020${hashHex}810120`;

  return { condition, fulfillment };
}

/**
 * Closes an existing HTLC (Escrow) on the XRP Ledger.
 *
 * @param uuid The UUID of the cross-chain swap to close.
 * @param onProgress Optional callback to report progress.
 * @returns A Promise that resolves with the XRP Ledger transaction hash, or null if an error occurs.
 */
export async function closeXrplHtlc(
  uuid: string,
  onProgress?: (message: string) => void,
): Promise<XrplHtlcCloserResult | null> {
  const logProgress = (message: string) => {
    console.log(message);
    if (onProgress) onProgress(message);
  };

  logProgress(`--- [DEBUG] Starting closeXrplHtlc for UUID: ${uuid} ---`);

  // --- Configuration ---
  const API_URL = `http://localhost:3000/api/swap/monitor/${uuid}`;
  const UPDATE_API_URL = `http://localhost:3000/api/cross-chain-htlc-swaps/${uuid}`; // Endpoint para actualizar el estado del swap
  const TESTNET_SERVER = "wss://s.altnet.rippletest.net:51233";

  const XRPL_DESTINATION_SECRET = process.env.XRPL_RECEIVER_SECRET || "";
  if (!XRPL_DESTINATION_SECRET) {
    throw new Error("XRPL_RECEIVER_SECRET is not set in .env. This is the seed for the escrow recipient.");
  }

  let swapData: SwapData;
  let client: Client | null = null; // Declarar client fuera del try/catch y inicializar a null

  try {
    // --- HTLC Component: Fetch Swap Data from API ---
    logProgress("[DEBUG] Step 1: Fetching swap data from API...");
    const apiResponse = await axios.get<ApiResponse<SwapData>>(API_URL);

    if (!apiResponse.data.success || !apiResponse.data.data) {
      throw new Error(apiResponse.data.message || `Swap with UUID ${uuid} not found or data is invalid.`);
    }
    swapData = apiResponse.data.data;

    logProgress(`[DEBUG] Fetched swap data: ${JSON.stringify(swapData, null, 2)}`);
    // --- Depuración Adicional: Log de los valores críticos antes de la validación ---
    logProgress(`[DEBUG] Validating fields:`);
    logProgress(`  nonEVMSequence: ${swapData.xrplOfferSequence}`);
    logProgress(`  nonEVMDetails?.xrplCondition: ${swapData.xrplCondition}`);
    logProgress(`  secret: ${swapData.secret}`);
    logProgress(`  makerNonEVMAddress: ${swapData.makerNonEVMAddress}`);
    logProgress(`  takerNonEVMAddress: ${swapData.takerNonEVMAddress}`);
    // Fin de la depuración adicional

    // Validar datos cruciales del swap
    if (
      !swapData.xrplOfferSequence ||
      !swapData.xrplCondition ||
      !swapData.secret ||
      !swapData.makerNonEVMAddress ||
      !swapData.takerNonEVMAddress
    ) {
      throw new Error(
        "Critical swap data (offerSequence, condition, fulfillment, or addresses) is missing from the database.",
      );
    }
    // Opcional: Re-generar y verificar la condición/fulfillment para asegurar la consistencia.
    const preimageBuffer = Buffer.from(swapData.secret, "hex");
    const { condition: derivedCondition } = generateXrplHtlcConditionAndFulfillmentFromPreimage(preimageBuffer);

    if (derivedCondition !== swapData.xrplCondition) {
      logProgress(`[WARN] Discrepancia en la Condition: DB=${swapData.xrplCondition}, Derivada=${derivedCondition}`);
    }

    logProgress(
      "[DEBUG] Usando el 'secret' de la DB directamente como Fulfillment, asumiendo que ya está en el formato correcto.",
    );
  } catch (error: any) {
    logProgress(`[ERROR] Step 1 failed: Error fetching swap data or data validation failed: ${error.message}`);
    return null;
  }

  const offerSequence = swapData.xrplOfferSequence!;
  const condition = swapData.xrplCondition;
  const fulfillment = generateXrplHtlcConditionAndFulfillmentFromPreimage(
    Buffer.from(swapData.secret, "hex"),
  ).fulfillment;

  logProgress("Escrow Finish Parameters:");
  logProgress(`  UUID: ${uuid}`);
  logProgress(`  Offer Sequence: ${offerSequence}`);
  logProgress(`  Condition (from DB): ${condition}`);
  logProgress(`  Fulfillment (regenerated from DB secret): ${fulfillment}`);

  try {
    // --- Connect to XRP Ledger ---
    logProgress("Connecting to XRP Ledger Testnet...");
    client = new Client(TESTNET_SERVER);
    await client!.connect(); // Usar el operador de aserción no nula '!' aquí
    logProgress("Connected to Testnet.");

    // Prepare wallet to sign the transaction (XRPL Destination of the escrow)
    const signingWallet = Wallet.fromSecret(XRPL_DESTINATION_SECRET);
    logProgress(`Signing Wallet Address (Escrow Destination): ${signingWallet.address}`);

    if (signingWallet.address !== swapData.takerNonEVMAddress) {
      logProgress(
        `[ERROR] Mismatch: Signing wallet address (${signingWallet.address}) does not match takerNonEVMAddress from DB (${swapData.takerNonEVMAddress}).`,
      );
      throw new Error("Signing wallet is not the designated escrow recipient.");
    }

    if (!offerSequence || condition === "" || fulfillment === "") {
      throw new Error("Please specify the sequence number, condition and fulfillment of the escrow you created.");
    }

    // Prepare EscrowFinish transaction
    logProgress("Preparing EscrowFinish transaction...");
    const transaction: EscrowFinish = {
      Account: signingWallet.address,
      TransactionType: "EscrowFinish",
      Owner: swapData.makerNonEVMAddress,
      OfferSequence: offerSequence,
      Condition: condition,
      Fulfillment: fulfillment,
    };
    logProgress(`EscrowFinish transaction JSON: ${JSON.stringify(transaction, null, "\t")}`);

    logProgress("Validating transaction...");
    validate(transaction);
    logProgress("Transaction is valid.");

    // Sign and submit the transaction
    logProgress("Signing and submitting the transaction...");
    const response = await client.submitAndWait(transaction, { wallet: signingWallet });
    logProgress(`Finished submitting! ${JSON.stringify(response.result, null, "\t")}`);

    // CORREGIDO: Verificar si 'meta' es un objeto antes de acceder a 'TransactionResult'
    if (
      typeof response.result.meta === "object" &&
      response.result.meta !== null &&
      response.result.meta.TransactionResult !== "tesSUCCESS"
    ) {
      throw new Error(`Transaction failed with result: ${response.result.meta.TransactionResult}`);
    }
    // Si meta es una cadena (error de parsing) o null, también lo consideramos un fallo.
    if (typeof response.result.meta === "string" || response.result.meta === null) {
      throw new Error(`Transaction failed. Meta was unexpected type or null: ${response.result.meta}`);
    }
    // Si TransactionResult existe y no es tesSUCCESS, lanzar error (redundante si el anterior ya lo hace, pero seguro)
    if (
      typeof response.result.meta === "object" &&
      response.result.meta !== null &&
      response.result.meta.TransactionResult !== "tesSUCCESS"
    ) {
      throw new Error(`Transaction failed with result: ${response.result.meta.TransactionResult}`);
    }

    logProgress("Escrow finished successfully!");

    // --- HTLC Component: Database Update (Swap Record) ---
    logProgress("[DEBUG] Step 3: Updating swap data in API...");
    const updateData = {
      status: "NON_EVM_CLAIMED", // O un estado adecuado para "cerrado"
      xrplFinishTxHash: response.result.hash,
    };
    await axios.put(UPDATE_API_URL, updateData);
    logProgress("Swap data updated successfully.");

    return { xrplFinishTxHash: response.result.hash! };
  } catch (error: any) {
    logProgress(`Error closing HTLC (Escrow): ${error.message}`);
    // Intenta actualizar la DB con el estado de fallo
    try {
      await axios.put(UPDATE_API_URL, {
        status: "FAILED",
        errorMessage: `Error closing XRP HTLC: ${error.message}`,
      });
    } catch (apiError: any) {
      logProgress(`Error updating API with failure status: ${apiError.message}`);
    }
    return null;
  } finally {
    logProgress("[DEBUG] Disconnecting from XRP Ledger Testnet...");
    if (client) {
      await client.disconnect();
      logProgress("[DEBUG] Disconnected.");
    } else {
      logProgress("[DEBUG] Client was not connected, no disconnection needed.");
    }
  }
}
