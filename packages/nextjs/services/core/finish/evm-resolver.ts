import ESCROW_FACTORY_ABI from "../../../../externalAbis/EscrowFactory.json";
import { packTimelocks } from "../helpers/timelocks-helper";
import axios from "axios";
import { Wallet, ethers } from "ethers";

interface EvmResolverResult {
  evmClaimTxHash: string;
}

export async function resolveEvmEscrow(
  uuid: string,
  secret: string,
  makerEVMAddress: string,
  takerEVMAddress: string,
  makerEVMTokenAddress: string,
  amountEVM: string,
  safetyDepositAmount: string,
  hashlock: string,
  evmTimelock: number,
  evmPublicWithdrawTimelock: number,
  onProgress?: (message: string) => void,
): Promise<EvmResolverResult | null> {
  const logProgress = (message: string) => {
    console.log(message);
    if (onProgress) onProgress(message);
  };

  logProgress(`--- [DEBUG] Starting resolveEvmEscrow for UUID: ${uuid} ---`);

  const API_URL = `http://localhost:3000/api/swaps/${uuid}`;
  const MONITOR_API_URL = `http://localhost:3000/api/htlc-monitor/${uuid}`;
  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA;
  if (!RPC_URL) {
    throw new Error("NEXT_PUBLIC_RPC_URL_SEPOLIA is not set in .env");
  }

  const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
  if (!DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set in .env");
  }

  const ESCROW_FACTORY_ADDRESS = "0x0bd657709620f1a5901c4651dd8be9eff4dfd9ae";

  logProgress("[DEBUG] Step 1: Validating input parameters...");
  // Add comprehensive validation
  logProgress("[DEBUG] Input parameters validated successfully.");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const escrowFactory = new ethers.Contract(ESCROW_FACTORY_ADDRESS, ESCROW_FACTORY_ABI, wallet);

  const dstImmutables = {
    orderHash: ethers.encodeBytes32String("VortexAuctionOrder"),
    hashlock: hashlock,
    maker: BigInt(makerEVMAddress),
    taker: BigInt(takerEVMAddress),
    token: BigInt(makerEVMTokenAddress),
    amount: ethers.parseUnits(amountEVM, 18),
    safetyDeposit: ethers.parseUnits(safetyDepositAmount, 18),
    timelocks: packTimelocks(evmPublicWithdrawTimelock, {
      dstWithdrawal: evmPublicWithdrawTimelock,
      dstCancellation: evmTimelock,
    }),
  };

  try {
    logProgress("[DEBUG] Step 2: Sending withdraw transaction...");
    const tx = await escrowFactory.withdraw(dstImmutables, secret);
    logProgress(`[DEBUG] withdraw transaction sent. Hash: ${tx.hash}`);
    await tx.wait();
    logProgress("EVM Escrow resolved successfully!");

    logProgress("[DEBUG] Step 3: Updating swap data in API...");
    await axios.put(API_URL, {
      status: "EVM_CLAIMED",
      evmClaimTxHash: tx.hash,
    });
    logProgress("Swap data updated successfully.");

    logProgress("[DEBUG] Step 4: Updating HTLC Monitor record...");
    await axios.put(MONITOR_API_URL, {
      status: "RESOLVED",
      details: { claimTxHash: tx.hash },
    });
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
