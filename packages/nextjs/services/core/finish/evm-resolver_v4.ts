import DST_ESCROW_ABI from "../../../externalAbis/EscrowDst.json";
import ESCROW_FACTORY_ABI from "../../../externalAbis/EscrowFactory.json";
import { packTimelocks } from "../helpers/timelocks-helper";
import axios from "axios";
import { Contract, Wallet, ethers } from "ethers";

interface EvmResolverResult {
  evmClaimTxHash: string;
}

export async function resolveEvmEscrow(
  uuid: string,
  secret: string,
  onProgress?: (message: string) => void,
): Promise<EvmResolverResult | null> {
  const logProgress = (message: string) => {
    console.log(message);
    if (onProgress) onProgress(message);
  };

  logProgress(`--- [DEBUG] Starting resolveEvmEscrow for UUID: ${uuid} ---`);

  const API_URL = `http://localhost:3000/api/cross-chain-htlc-swaps/${uuid}`;
  const MONITOR_API_URL = `http://localhost:3000/api/htlc-monitor/${uuid}`;
  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA;
  if (!RPC_URL) {
    throw new Error("NEXT_PUBLIC_RPC_URL_SEPOLIA is not set in .env");
  }

  const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
  if (!DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set in .env");
  }

  try {
    // --- 1. Fetch Swap Data ---
    logProgress("[DEBUG] Step 1: Fetching swap data from API...");
    const response = await axios.get(API_URL);
    const swapData = response.data.data;
    logProgress(`[DEBUG] Swap data fetched successfully: ${JSON.stringify(swapData, null, 2)}`);

    // --- 2. Get DstEscrow Address from Creation Tx ---
    logProgress("[DEBUG] Step 2: Finding DstEscrow contract address...");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const creationReceipt = await provider.getTransactionReceipt(swapData.evmTxHash);
    if (!creationReceipt) {
      throw new Error(`Transaction receipt for hash ${swapData.evmTxHash} not found.`);
    }
    logProgress(`[DEBUG] Fetched transaction receipt: ${JSON.stringify(creationReceipt, null, 2)}`);

    const block = await provider.getBlock(creationReceipt.blockNumber);
    if (!block) {
      throw new Error(`Block ${creationReceipt.blockNumber} not found.`);
    }
    const deployedAtTimestamp = block.timestamp;
    logProgress(`[DEBUG] Escrow deployed at block timestamp: ${deployedAtTimestamp}`);

    const escrowFactoryInterface = new ethers.Interface(ESCROW_FACTORY_ABI);
    let dstEscrowAddress: string | null = null;
    for (const log of creationReceipt.logs) {
      try {
        const parsedLog = escrowFactoryInterface.parseLog(log);
        if (parsedLog && parsedLog.name === "DstEscrowCreated") {
          dstEscrowAddress = parsedLog.args.escrow;
          break;
        }
      } catch (e: any) {
        logProgress(`[DEBUG] Could not parse log with EscrowFactory ABI: ${e.message}`);
      }
    }

    if (!dstEscrowAddress) {
      throw new Error("Could not find DstEscrowCreated event in transaction logs.");
    }
    logProgress(`[DEBUG] Found DstEscrow contract address: ${dstEscrowAddress}`);

    // --- 3. Resolve EVM Escrow ---
    const wallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const dstEscrowContract = new Contract(dstEscrowAddress, DST_ESCROW_ABI, wallet);

    const immutables = {
      orderHash: ethers.encodeBytes32String("VortexAuctionOrder"),
      hashlock: swapData.secretHash,
      maker: BigInt(swapData.makerEVMAddress),
      taker: BigInt(swapData.takerEVMAddress),
      token: BigInt(swapData.makerEVMTokenAddress),
      amount: BigInt(swapData.amountEVM),
      safetyDeposit: BigInt(swapData.safetyDepositAmount),
      timelocks: packTimelocks(deployedAtTimestamp, {
        dstWithdrawal: swapData.evmPublicWithdrawTimelock,
        dstCancellation: swapData.evmTimelock,
      }),
    };
    logProgress(
      `[DEBUG] Constructed immutables: ${JSON.stringify(
        immutables,
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      )}`,
    );

    logProgress("[DEBUG] Step 3: Sending withdraw transaction...");
    const tx = await dstEscrowContract.withdraw(immutables, `0x${swapData.secret}`);
    logProgress(`[DEBUG] withdraw transaction sent. Hash: ${tx.hash}`);
    await tx.wait();
    logProgress("EVM Escrow resolved successfully!");

    // --- 4. Update Database ---
    logProgress("[DEBUG] Step 4: Updating swap data in API...");
    const updateData = {
      status: "EVM_CLAIMED",
      evmClaimTxHash: tx.hash,
    };
    logProgress(`[DEBUG] Sending update to swap API: ${JSON.stringify(updateData, null, 2)}`);
    await axios.put(API_URL, updateData);
    logProgress("Swap data updated successfully.");

    logProgress("[DEBUG] Step 5: Updating HTLC Monitor record...");
    const monitorUpdateData = {
      status: "RESOLVED",
      details: { claimTxHash: tx.hash },
    };
    logProgress(`[DEBUG] Sending update to monitor API: ${JSON.stringify(monitorUpdateData, null, 2)}`);
    await axios.put(MONITOR_API_URL, monitorUpdateData);
    logProgress("HTLC Monitor record updated successfully.");

    return { evmClaimTxHash: tx.hash };
  } catch (error: any) {
    logProgress(`Error resolving EVM Escrow: ${error.message}`);
    try {
      await axios.put(API_URL, {
        status: "FAILED",
        errorMessage: `Error resolving EVM Escrow: ${error.message}`,
      });
      await axios.put(MONITOR_API_URL, {
        status: "FAILED",
        errorMessage: `Error resolving EVM Escrow: ${error.message}`,
      });
    } catch (apiError: any) {
      logProgress(`Error updating API with failure status: ${apiError.message}`);
    }
    return null;
  }
}
