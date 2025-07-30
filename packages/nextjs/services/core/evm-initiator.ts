import ESCROW_FACTORY_ABI from "../../../externalAbis/EscrowFactory.json";
import { packTimelocks } from "../../helpers/timelocks-helper";
import axios from "axios";
import { execSync } from "child_process";
import { Wallet, ethers } from "ethers";
import { config } from "hardhat";

interface EvmInitiatorResult {
  uuid: string;
  evmTxHash: string;
  evmTimelock: number;
  evmPublicWithdrawTimelock: number;
  secret: string;
  hashlock: string;
  xrplCondition: string;
}

/**
 * Initiates the EVM side of a cross-chain HTLC swap by creating a DstEscrow contract
 * and storing the initial swap data in the database.
 *
 * @param makerEVMAddress The EVM address of the maker (sender).
 * @param takerEVMAddress The EVM address of the taker (receiver).
 * @param makerEVMTokenAddress The address of the ERC-20 token being swapped on EVM.
 * @param amountEVM The amount of EVM token to swap (as ethers.BigNumberish).
 * @param safetyDepositAmount The safety deposit amount for the EVM escrow (as ethers.BigNumberish).
 * @param makerXRPAddress The XRP Ledger address of the maker.
 * @param takerXRPAddress The XRP Ledger address of the taker.
 * @param amountXRP The amount of XRP to swap (as string).
 * @returns A Promise that resolves with an object containing the UUID, EVM transaction hash,
 *          timelocks, secret, hashlock, and XRP condition, or null if an error occurs.
 */
export async function initiateEvmEscrow(
  makerEVMAddress: string,
  takerEVMAddress: string,
  makerEVMTokenAddress: string,
  amountEVM: ethers.BigNumberish,
  safetyDepositAmount: ethers.BigNumberish,
  makerXRPAddress: string,
  takerXRPAddress: string,
  amountXRP: string,
): Promise<EvmInitiatorResult | null> {
  console.log("--- [DEBUG] Starting initiateEvmEscrow ---");

  // --- HTLC Component: Secret, Hashlock, Condition, Fulfillment ---
  // These are the cryptographic primitives that link the two sides of the swap.
  // The 'secret' is revealed by the taker to claim funds on one chain,
  // and its 'hashlock' is used to lock funds on the other chain.
  console.log("[DEBUG] Step 1: Generating secret and conditions...");
  let conditionData: { secret: string; hashlock: string; condition: string; fulfillment: string; };
  try {
    // This script generates the secret, hashlock, condition, and fulfillment.
    // The 'condition' is for XRP Ledger, 'hashlock' for EVM, and 'fulfillment' is the secret itself.
    conditionData = JSON.parse(execSync("node scripts/helpers/xrpl-condition-generator.js").toString());
    console.log("[DEBUG] Generated condition data:", conditionData);
  } catch (error: any) {
    console.error(
      "[ERROR] Step 1 failed: Error generating condition data. Ensure scripts/helpers/xrpl-condition-generator.js exists and works.",
      error.message,
    );
    return null; // Return null on error
  }

  // --- Configuration ---
  const API_URL = "http://localhost:3000/api/cross-chain-htlc-swaps";
  const MONITOR_API_URL = "http://localhost:3000/api/htlc-monitor";
  const networkName = "sepolia";
  const networkConfig = config.networks[networkName];
  if (!("url" in networkConfig)) {
    console.error(`[ERROR] Network URL not found for ${networkName}`);
    return null; // Return null on error
  }
  const RPC_URL = networkConfig.url;
  console.log(`[DEBUG] RPC URL: ${RPC_URL}`);

  const DEPLOYER_PRIVATE_KEY_ENCRYPTED = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
  const DEPLOYER_PASSWORD = process.env.DEPLOYER_PASSWORD;

  if (!DEPLOYER_PRIVATE_KEY_ENCRYPTED || !DEPLOYER_PASSWORD) {
    throw new Error("DEPLOYER_PRIVATE_KEY_ENCRYPTED or DEPLOYER_PASSWORD is not set in .env");
  }
  const PRIVATE_KEY = (await Wallet.fromEncryptedJson(DEPLOYER_PRIVATE_KEY_ENCRYPTED, DEPLOYER_PASSWORD)).privateKey;

  const ESCROW_FACTORY_ADDRESS = "0x0bd657709620f1a5901c4651dd8be9eff4dfd9ae";

  // --- Validation of critical parameters before proceeding ---
  console.log("[DEBUG] Step 2: Validating input parameters and configuration...");
  if (!makerEVMAddress || !takerEVMAddress || !makerEVMTokenAddress || !makerXRPAddress || !takerXRPAddress) {
    throw new Error("Validation failed: One or more addresses (EVM or XRP) are missing.");
  }
  if (!amountEVM || amountEVM.toString() === "0") {
    throw new Error("Validation failed: EVM amount is missing or zero.");
  }
  if (!safetyDepositAmount || safetyDepositAmount.toString() === "0") {
    throw new Error("Validation failed: Safety deposit amount is missing or zero.");
  }
  if (!amountXRP || amountXRP === "0") {
    throw new Error("Validation failed: XRP amount is missing or zero.");
  }
  if (!conditionData.secret || !conditionData.hashlock || !conditionData.condition || !conditionData.fulfillment) {
    throw new Error(
      "Validation failed: HTLC cryptographic data (secret, hashlock, condition, fulfillment) is incomplete.",
    );
  }
  console.log("[DEBUG] Input parameters and configuration validated successfully.");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("[DEBUG] Step 3: Interacting with Escrow Factory...");
  const escrowFactory = new ethers.Contract(ESCROW_FACTORY_ADDRESS, ESCROW_FACTORY_ABI, wallet);
  console.log(`[DEBUG] EscrowFactory address: ${ESCROW_FACTORY_ADDRESS}`);

  const wethContract = new ethers.Contract(
    makerEVMTokenAddress,
    ["function approve(address spender, uint256 amount) public returns (bool)"],
    wallet,
  );

  // --- EVM HTLC Component: Token Approval ---
  // The maker must approve the EscrowFactory to spend their WETH tokens.
  // This is a prerequisite for the EscrowFactory to be able to lock the tokens.
  console.log("[DEBUG] Step 4: Approving WETH for EscrowFactory...");
  try {
    const approveTx = await wethContract.approve(ESCROW_FACTORY_ADDRESS, amountEVM);
    console.log("[DEBUG] WETH approval transaction sent. Hash:", approveTx.hash);
    await approveTx.wait();
    console.log("WETH approval successful!");
  } catch (error: any) {
    console.error("[ERROR] Step 4 failed: Error approving WETH:", error);
    return null; // Return null on error
  }

  // --- HTLC Component: Timelocks (EVM Side) ---
  // These define the time windows for claiming and cancelling the EVM escrow.
  // `evmPublicWithdrawTimelock` (FinishAfter equivalent) should be shorter than `evmTimelock` (CancelAfter equivalent).
  console.log("[DEBUG] Step 5: Preparing Timelocks...");
  const currentTime = Math.floor(Date.now() / 1000);
  const dstWithdrawalOffset = currentTime; // DeployedAt for timelocks packing
  const dstPublicWithdrawalOffset = currentTime + 30; // For quick testing: 30 seconds from now (FinishAfter equivalent)
  const dstCancellationOffset = currentTime + 60 * 10; // 10 minutes from now (CancelAfter equivalent)
  console.log("Timelocks:");
  console.log("dstWithdrawalOffset (DeployedAt):", dstWithdrawalOffset);
  console.log("dstPublicWithdrawalOffset (EVM Public Withdrawal Timelock):", dstPublicWithdrawalOffset);
  console.log("dstCancellationOffset (EVM Cancellation Timelock):", dstCancellationOffset);

  const timelocksPacked = packTimelocks(dstWithdrawalOffset, {
    dstWithdrawal: dstPublicWithdrawalOffset,
    dstCancellation: dstCancellationOffset,
  });
  console.log(`[DEBUG] Packed Timelocks (BigInt): ${timelocksPacked.toString()}`);

  // --- EVM HTLC Component: DstImmutables ---
  // This struct contains all the immutable parameters for the EVM escrow.
  // `hashlock` is the critical link to the XRP Ledger HTLC.
  const dstImmutables = {
    orderHash: ethers.encodeBytes32String("VortexAuctionOrder"),
    hashlock: conditionData.hashlock, // HTLC critical component
    maker: BigInt(makerEVMAddress),
    taker: BigInt(takerEVMAddress),
    token: BigInt(makerEVMTokenAddress),
    amount: amountEVM,
    safetyDeposit: safetyDepositAmount,
    timelocks: timelocksPacked, // HTLC critical component
  };

  console.log("DstImmutables:", dstImmutables);

  // `srcCancellationTimestamp` is an additional timelock for the source chain (if applicable).
  // For this cross-chain swap, it acts as a global cancellation timestamp for the EVM side.
  const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 4 * 60 * 60; // 4 hours
  console.log("srcCancellationTimestamp:", srcCancellationTimestamp);

  console.log("Initiating cross-chain swap (creating DstEscrow)...");

  let uuid: string | null = null;
  let evmTxHash: string | null = null;

  try {
    console.log("[DEBUG] Step 6: Sending createDstEscrow transaction...");
    const tx = await escrowFactory.createDstEscrow(dstImmutables, srcCancellationTimestamp, {
      value: safetyDepositAmount,
    });
    console.log("[DEBUG] createDstEscrow transaction sent. Hash:", tx.hash);
    await tx.wait();
    console.log("Cross-chain swap initiation successful!");
    console.log("Transaction hash:", tx.hash);
    evmTxHash = tx.hash;

    // --- HTLC Component: Database Storage (Initial Swap Record) ---
    // Storing all relevant swap data in MongoDB for persistent tracking.
    console.log("[DEBUG] Step 7: Storing initial swap data in MongoDB...");
    const swapData = {
      status: "EVM_ORDER_CREATED",
      makerEVMAddress: makerEVMAddress,
      takerEVMAddress: takerEVMAddress,
      makerNonEVMAddress: makerXRPAddress,
      takerNonEVMAddress: takerXRPAddress,
      makerEVMTokenAddress: makerEVMTokenAddress,
      amountEVM: amountEVM.toString(),
      amountNonEVM: amountXRP.toString(),
      secretHash: conditionData.hashlock, // HTLC critical component
      secret: conditionData.secret, // HTLC critical component (will be revealed later)
      evmChainId: "sepolia",
      nonEVMChainType: "XRPL",
      nonEVMDetails: {
        xrplCondition: conditionData.condition, // HTLC critical component
      },
      evmTxHash: evmTxHash,
      evmTimelock: dstCancellationOffset, // HTLC critical component
      evmPublicWithdrawTimelock: dstPublicWithdrawalOffset, // HTLC critical component
      safetyDepositAmount: safetyDepositAmount.toString(), // Added
    };
    console.log("[DEBUG] Swap data payload:", swapData);

    // --- Validation of Swap Data before saving to DB ---
    console.log("[DEBUG] Validating swap data before saving to DB...");
    for (const [key, value] of Object.entries(swapData)) {
      if (value === undefined || value === null || value === "") {
        throw new Error(`Validation failed: ${key} is missing from swap data.`);
      }
    }
    console.log("[DEBUG] Swap data validated successfully.");

    const apiResponse = await axios.post(API_URL, swapData);
    uuid = apiResponse.data.data.uuid;
    console.log("Swap data stored successfully. UUID:", uuid);

    // --- HTLC Component: Monitor Record (EVM Side) ---
    // This record is for the off-chain resolver service to monitor the EVM escrow.
    console.log("[DEBUG] Step 9: Creating HTLC Monitor record for EVM side...");
    const monitorData = {
      swapUuid: uuid,
      chainType: "EVM",
      status: "PENDING",
      txHash: evmTxHash,
      secretHash: conditionData.hashlock,
      timelock: dstCancellationOffset, // The timelock after which the EVM escrow can be cancelled
      // The resolver will need to know when it can claim (dstPublicWithdrawalOffset) vs. when it can be cancelled (dstCancellationOffset)
    };
    await axios.post(MONITOR_API_URL, monitorData);
    console.log("HTLC Monitor record created successfully for EVM side.");
  } catch (error: any) {
    console.error("Error initiating cross-chain swap:", error);
    if (error.response) {
      console.error("API Error:", error.response.data);
    }
    return null; // Return null on error
  }

  console.log("--- [DEBUG] initiateEvmEscrow finished. ---");
  // Return critical data for the next steps in the overall swap process
  if (uuid && evmTxHash) {
    return {
      uuid,
      evmTxHash,
      evmTimelock: dstCancellationOffset,
      evmPublicWithdrawTimelock: dstPublicWithdrawalOffset,
      secret: conditionData.secret,
      hashlock: conditionData.hashlock,
      xrplCondition: conditionData.condition,
    };
  } else {
    return null;
  }
}
