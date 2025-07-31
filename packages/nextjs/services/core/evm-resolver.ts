import { packTimelocks } from "./helpers/timelocks-helper";
import * as dotenv from "dotenv";
import { Contract, JsonRpcProvider, Wallet, ethers } from "ethers";
import dbConnect from "~~/app/lib/db/connect";
import CrossChainHtlcSwap, { ICrossChainHtlcSwap, SwapStatus } from "~~/app/lib/db/models/CrossChainHtlcSwap";

// import ESCROW_FACTORY_ABI from "../../../externalAbis/EscrowFactory.json";

dotenv.config();

const DST_ESCROW_ABI = [
  {
    inputs: [
      { internalType: "uint32", name: "rescueDelay", type: "uint32" },
      { internalType: "contract IERC20", name: "accessToken", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [], name: "InvalidCaller", type: "error" },
  { inputs: [], name: "InvalidImmutables", type: "error" },
  { inputs: [], name: "InvalidSecret", type: "error" },
  { inputs: [], name: "InvalidTime", type: "error" },
  { inputs: [], name: "NativeTokenSendingFailure", type: "error" },
  { inputs: [], name: "SafeTransferFailed", type: "error" },
  { anonymous: false, inputs: [], name: "EscrowCancelled", type: "event" },
  {
    anonymous: false,
    inputs: [{ indexed: false, internalType: "bytes32", name: "secret", type: "bytes32" }],
    name: "EscrowWithdrawal",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "token", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "FundsRescued",
    type: "event",
  },
  {
    inputs: [],
    name: "FACTORY",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "PROXY_BYTECODE_HASH",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "RESCUE_DELAY",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "bytes32", name: "orderHash", type: "bytes32" },
          { internalType: "bytes32", name: "hashlock", type: "bytes32" },
          { internalType: "uint256", name: "maker", type: "uint256" },
          { internalType: "uint256", name: "taker", type: "uint256" },
          { internalType: "uint256", name: "token", type: "uint256" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint256", name: "safetyDeposit", type: "uint256" },
          { internalType: "uint256", name: "timelocks", type: "uint256" },
        ],
        internalType: "struct IBaseEscrow.Immutables",
        name: "immutables",
        type: "tuple",
      },
    ],
    name: "cancel",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "secret", type: "bytes32" },
      {
        components: [
          { internalType: "bytes32", name: "orderHash", type: "bytes32" },
          { internalType: "bytes32", name: "hashlock", type: "bytes32" },
          { internalType: "uint256", name: "maker", type: "uint256" },
          { internalType: "uint256", name: "taker", type: "uint256" },
          { internalType: "uint256", name: "token", type: "uint256" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint256", name: "safetyDeposit", type: "uint256" },
          { internalType: "uint256", name: "timelocks", type: "uint256" },
        ],
        internalType: "struct IBaseEscrow.Immutables",
        name: "immutables",
        type: "tuple",
      },
    ],
    name: "publicWithdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      {
        components: [
          { internalType: "bytes32", name: "orderHash", type: "bytes32" },
          { internalType: "bytes32", name: "hashlock", type: "bytes32" },
          { internalType: "uint256", name: "maker", type: "uint256" },
          { internalType: "uint256", name: "taker", type: "uint256" },
          { internalType: "uint256", name: "token", type: "uint256" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint256", name: "safetyDeposit", type: "uint256" },
          { internalType: "uint256", name: "timelocks", type: "uint256" },
        ],
        internalType: "struct IBaseEscrow.Immutables",
        name: "immutables",
        type: "tuple",
      },
    ],
    name: "rescueFunds",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "secret", type: "bytes32" },
      {
        components: [
          { internalType: "bytes32", name: "orderHash", type: "bytes32" },
          { internalType: "bytes32", name: "hashlock", type: "bytes32" },
          { internalType: "uint256", name: "maker", type: "uint256" },
          { internalType: "uint256", name: "taker", type: "uint256" },
          { internalType: "uint256", name: "token", type: "uint256" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint256", name: "safetyDeposit", type: "uint256" },
          { internalType: "uint256", name: "timelocks", type: "uint256" },
        ],
        internalType: "struct IBaseEscrow.Immutables",
        name: "immutables",
        type: "tuple",
      },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const ESCROW_FACTORY_DST_ESCROW_CREATED_ABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address", // Correcto: "address"
        name: "escrow",
        type: "address", // Correcto: "address"
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "hashlock",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "address", // CORREGIDO: "address" en lugar de "Address" o "uint256"
        name: "taker",
        type: "address", // CORREGIDO: "address" en lugar de "uint256"
      },
    ],
    name: "DstEscrowCreated",
    type: "event",
  },
];

// Interfaz para los datos del swap tal como están en la base de datos (modelo Mongoose)
type SwapData = ICrossChainHtlcSwap; // Extiende directamente tu interfaz de Mongoose

interface EvmEscrowCloserResult {
  evmFinishTxHash: string;
  action: "claimed" | "refunded";
}

/**
 * Cierra un escrow HTLC en la cadena EVM (DstEscrow) ya sea reclamando o reembolsando.
 *
 * @param uuid El UUID del swap cross-chain a cerrar.
 * @param action La acción deseada: "claim" o "refund".
 * @param onProgress Callback opcional para reportar el progreso.
 * @returns Una Promesa que se resuelve con el hash de la transacción EVM y la acción realizada, o null si ocurre un error.
 */
export async function closeEvmEscrow(
  uuid: string,
  action: "claim" | "refund",
  onProgress?: (message: string) => void,
): Promise<EvmEscrowCloserResult | null> {
  const logProgress = (message: string) => {
    console.log(message);
    if (onProgress) onProgress(message);
  };

  logProgress(`--- [DEBUG] Starting closeEvmEscrow for UUID: ${uuid} (Action: ${action}) ---`);

  // --- Configuration ---
  // const UPDATE_API_URL = `http://localhost:3000/api/cross-chain-htlc-swaps/${uuid}`;
  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA;
  if (!RPC_URL) {
    throw new Error("[ERROR] NEXT_PUBLIC_RPC_URL_SEPOLIA environment variable is not set.");
  }

  const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY; // Asumimos que el DEPLOYER_PRIVATE_KEY es la wallet que hará la acción
  if (!DEPLOYER_PRIVATE_KEY) {
    throw new Error(
      "[ERROR] DEPLOYER_PRIVATE_KEY environment variable is not set. This wallet will sign the transaction.",
    );
  }

  let swapData: SwapData;
  let provider: JsonRpcProvider;
  let signerWallet: Wallet;
  let dstEscrowAddress: string | null = null;
  let deployedAtTimestamp: number | null = null; // Para almacenar el timestamp del bloque de creación

  try {
    // --- Step 1: Fetch Swap Data Directly from Database ---
    logProgress("[DEBUG] Step 1: Connecting to DB and fetching swap data...");
    await dbConnect();
    const rawSwap = await CrossChainHtlcSwap.findOne({ uuid }).lean();

    if (!rawSwap) {
      throw new Error(`Swap with UUID ${uuid} not found in database.`);
    }
    swapData = rawSwap as SwapData;

    console.log(`[DEBUG] Fetched swap data from DB: ${JSON.stringify(swapData, null, 2)}`);

    // --- Step 2: Initialize Provider and Signer Wallet ---
    logProgress("[DEBUG] Step 2: Initializing EVM provider and signer wallet...");
    provider = new ethers.JsonRpcProvider(RPC_URL);
    signerWallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    console.log(`Signer Wallet Address: ${signerWallet.address}`);

    // --- Step 3: Determine DstEscrow Contract Address and DeployedAt Timestamp from Creation Tx ---
    logProgress(
      "[DEBUG] Step 3: Finding DstEscrow contract address and deployedAt timestamp from creation transaction...",
    );
    if (!swapData.evmTxHash) {
      throw new Error("EVM creation transaction hash (evmTxHash) is missing from swap data.");
    }

    const creationReceipt = await provider.getTransactionReceipt(swapData.evmTxHash);
    if (!creationReceipt) {
      throw new Error(
        `Transaction receipt for hash ${swapData.evmTxHash} not found. Escrow contract address cannot be determined.`,
      );
    }

    // Obtener el timestamp del bloque de la transacción de creación
    const block = await provider.getBlock(creationReceipt.blockNumber);
    if (!block) {
      throw new Error(`Block ${creationReceipt.blockNumber} not found for transaction ${swapData.evmTxHash}.`);
    }
    deployedAtTimestamp = block.timestamp;
    console.log(`[DEBUG] Escrow deployed at block timestamp: ${deployedAtTimestamp}`);

    // Parse logs to find the DstEscrowCreated event
    const iface = new ethers.Interface(ESCROW_FACTORY_DST_ESCROW_CREATED_ABI); // Usamos el ABI para parsear eventos
    for (const log of creationReceipt.logs) {
      try {
        const parsedLog = iface.parseLog(log);
        if (parsedLog && parsedLog.name === "createDstEscrow") {
          dstEscrowAddress = parsedLog.args.escrowAddress;
          console.log(`[DEBUG] Found DstEscrow contract address: ${dstEscrowAddress}`);
          break;
        }
      } catch (e) {
        console.log(`[DEBUG] Error parsing log: ${e}`);
      }
    }

    if (!dstEscrowAddress) {
      throw new Error(`Could not find DstEscrowCreated event in transaction ${swapData.evmTxHash}.`);
    }

    // --- Step 4: Instantiate DstEscrow Contract ---
    logProgress("[DEBUG] Step 4: Instantiating DstEscrow contract...");
    const dstEscrowContract = new Contract(dstEscrowAddress, DST_ESCROW_ABI, signerWallet);
    console.log(`[DEBUG] DstEscrow contract instantiated at: ${dstEscrowAddress}`);

    // --- Step 5: Prepare Immutables struct ---
    // Reconstruir el struct Immutables tal como fue creado
    // orderHash es siempre "VortexAuctionOrder" codificado a bytes32
    const orderHashBytes32 = ethers.encodeBytes32String("VortexAuctionOrder");

    // Empaquetar los timelocks usando el deployedAtTimestamp real del bloque de creación
    if (
      swapData.evmPublicWithdrawTimelock === undefined ||
      swapData.evmTimelock === undefined ||
      deployedAtTimestamp === null
    ) {
      throw new Error("Missing timelock data or deployedAtTimestamp to reconstruct immutables.");
    }

    const timelocksPacked = packTimelocks(deployedAtTimestamp, {
      dstWithdrawal: swapData.evmPublicWithdrawTimelock,
      dstCancellation: swapData.evmTimelock,
    });
    console.log(`[DEBUG] Reconstructed Packed Timelocks: ${timelocksPacked.toString()}`);

    const immutables = {
      orderHash: orderHashBytes32,
      hashlock: swapData.secretHash,
      maker: BigInt(swapData.makerEVMAddress),
      taker: BigInt(swapData.takerEVMAddress),
      token: BigInt(swapData.makerEVMTokenAddress),
      amount: BigInt(swapData.amountEVM),
      safetyDeposit: BigInt(swapData.safetyDepositAmount || "0"), // safetyDepositAmount might be optional
      timelocks: timelocksPacked,
    };
    console.log(
      `[DEBUG] Reconstructed Immutables: ${JSON.stringify(
        immutables,
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      )}`,
    );

    // --- Step 6: Execute Claim or Refund based on Action ---
    let txResponse: ethers.ContractTransactionResponse;
    let newStatus: SwapStatus;
    let currentAction: "claimed" | "refunded";

    const currentTime = Math.floor(Date.now() / 1000);

    if (action === "claim") {
      // Taker (signerWallet.address) should be takerEVMAddress
      if (signerWallet.address.toLowerCase() !== swapData.takerEVMAddress.toLowerCase()) {
        throw new Error(
          `Claim action requires signer wallet (${signerWallet.address}) to be the Taker EVM address (${swapData.takerEVMAddress}).`,
        );
      }
      if (!swapData.secret) {
        throw new Error("Secret (preimage) is missing from swap data for claim action.");
      }
      if (swapData.evmPublicWithdrawTimelock && currentTime < swapData.evmPublicWithdrawTimelock) {
        throw new Error(
          `Cannot claim yet. Public withdrawal timelock not reached. Remaining: ${swapData.evmPublicWithdrawTimelock - currentTime} seconds.`,
        );
      }

      logProgress("[DEBUG] Executing withdraw (claim) action...");
      // The `secret` from DB is the preimage, which needs to be bytes32 for the contract.
      // Ensure it's prefixed with 0x if it's a hex string without it.
      const secretBytes32 = ethers.hexlify(ethers.zeroPadBytes(ethers.getBytes(`0x${swapData.secret}`), 32));
      txResponse = await dstEscrowContract.withdraw(secretBytes32, immutables); // Usar `withdraw` y pasar `immutables`
      newStatus = "EVM_CLAIMED";
      currentAction = "claimed";
    } else if (action === "refund") {
      // Maker (signerWallet.address) should be makerEVMAddress
      if (signerWallet.address.toLowerCase() !== swapData.makerEVMAddress.toLowerCase()) {
        throw new Error(
          `Refund action requires signer wallet (${signerWallet.address}) to be the Maker EVM address (${swapData.makerEVMAddress}).`,
        );
      }
      if (swapData.evmTimelock && currentTime < swapData.evmTimelock) {
        throw new Error(
          `Cannot refund yet. Cancellation timelock not reached. Remaining: ${swapData.evmTimelock - currentTime} seconds.`,
        );
      }

      logProgress("[DEBUG] Executing cancel (refund) action...");
      txResponse = await dstEscrowContract.cancel(immutables); // Usar `cancel` y pasar `immutables`
      newStatus = "EVM_REFUNDED";
      currentAction = "refunded";
    } else {
      throw new Error("Invalid action specified. Must be 'claim' or 'refund'.");
    }

    console.log(`Transaction sent. Hash: ${txResponse.hash}`);
    console.log("Waiting for transaction confirmation...");
    const closingReceipt = await txResponse.wait();
    if (closingReceipt?.status !== 1) {
      throw new Error(`Transaction failed on-chain. Status: ${closingReceipt?.status}`);
    }
    logProgress(
      `Transaction confirmed! Block: ${closingReceipt.blockNumber}, Gas Used: ${closingReceipt.gasUsed.toString()}`,
    );

    // --- Step 7: Update Database ---
    logProgress("[DEBUG] Step 7: Updating swap data in DB...");
    const updateData: Partial<ICrossChainHtlcSwap> = {
      status: newStatus,
      evmClaimTxHash: currentAction === "claimed" ? txResponse.hash : undefined,
      evmRefundTxHash: currentAction === "refunded" ? txResponse.hash : undefined,
    };

    const newHistoryEvent = {
      timestamp: new Date(),
      status: newStatus,
      txHash: txResponse.hash,
      chainType: "EVM",
      details: { message: `EVM escrow ${currentAction} successfully.` },
    };

    const updatedSwap = await CrossChainHtlcSwap.findOneAndUpdate(
      { uuid: uuid },
      {
        $set: updateData,
        $push: { history: newHistoryEvent },
      },
      { new: true },
    );

    if (!updatedSwap) {
      console.log(`[WARN] Swap with UUID ${uuid} not found during DB update, but transaction was successful.`);
    } else {
      console.log("Swap data updated successfully in DB.");
    }

    return { evmFinishTxHash: txResponse.hash, action: currentAction };
  } catch (error: any) {
    console.log(`[ERROR] Error closing EVM HTLC (Escrow): ${error.message}`);
    try {
      const errorUpdateData: Partial<ICrossChainHtlcSwap> = {
        status: "FAILED",
        errorMessage: `Error closing EVM HTLC: ${error.message}`,
      };
      const errorHistoryEvent = {
        timestamp: new Date(),
        status: "FAILED" as SwapStatus,
        chainType: "EVM",
        details: { message: `Failed to close EVM escrow.` },
        errorMessage: error.message,
      };

      await CrossChainHtlcSwap.findOneAndUpdate(
        { uuid: uuid },
        {
          $set: errorUpdateData,
          $push: { history: errorHistoryEvent },
        },
        { new: true },
      );
      console.log("Swap data updated with FAILED status in DB.");
    } catch (dbError: any) {
      console.log(`[ERROR] Error updating DB with failure status: ${dbError.message}`);
    }
    return null;
  } finally {
    console.log("[DEBUG] closeEvmEscrow finished.");
  }
}

// --- Ejemplo de uso (para testing rápido) ---
// Para ejecutarlo directamente con `ts-node`:
// 1. Asegúrate de tener un archivo `.env` con `NEXT_PUBLIC_RPC_URL_SEPOLIA` y `DEPLOYER_PRIVATE_KEY`.
// 2. Necesitarás un swap existente en tu DB con `EVM_ORDER_CREATED` y un `evmTxHash` válido.
// 3. Reemplaza "YOUR_SWAP_UUID_HERE" con un UUID real de tu DB.
// 4. Asegúrate de que la `DEPLOYER_PRIVATE_KEY` corresponda al `makerEVMAddress` para `refund` o al `takerEVMAddress` para `claim`.

/*


// Llama a la función de prueba
// 
*/
export async function testCloseEvmEscrow() {
  const testUuid = "db0f3d01-9874-4c1a-9edd-ad6093ac7e2d"; // ¡IMPORTANTE! Reemplaza con un UUID real de tu DB
  const actionToPerform: "claim" | "refund" = "claim"; // Cambia a "refund" para probar el reembolso

  console.log(`Attempting to ${actionToPerform} EVM Escrow for UUID: ${testUuid}`);
  const result = await closeEvmEscrow(testUuid, actionToPerform);
  if (result) {
    console.log(`EVM Escrow ${result.action} Successfully! Transaction Hash:`, result.evmFinishTxHash);
  } else {
    console.log(`Failed to ${actionToPerform} EVM Escrow.`);
  }
}

// testCloseEvmEscrow();
