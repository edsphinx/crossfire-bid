import { ethers, Wallet } from "ethers";
import { config } from "hardhat";
import { execSync } from "child_process";
import axios from "axios";
import { Wallet as XRPLWallet } from "xrpl";
import ESCROW_FACTORY_ABI from "../../externalAbis/EscrowFactory.json";
import { packTimelocks } from "../helpers/timelocks-helper";

async function main(): Promise<string | null> {
  // --- 1. Generate Secret, Hashlock, Condition, and Fulfillment ---
  console.log("[DEBUG] Step 1: Generating secret and conditions...");
  let conditionData: { secret: string; hashlock: string; condition: string; fulfillment: string };
  try {
    conditionData = JSON.parse(execSync("node helpers/xrpl-condition-generator.js").toString());
    console.log("[DEBUG] Generated condition data:", conditionData);
  } catch (error: any) {
    console.error(
      "[ERROR] Step 1 failed: Error generating condition data. Ensure scripts/helpers/xrpl-condition-generator.js exists and works.",
      error.message,
    );
    process.exitCode = 1;
    return null;
  }

  // --- 2. Configuration ---
  console.log("[DEBUG] Step 2: Loading configuration...");
  const API_URL = "http://localhost:3000/api/cross-chain-htlc-swaps";
  const MONITOR_API_URL = "http://localhost:3000/api/htlc-monitor";
  const networkName = "sepolia";
  const networkConfig = config.networks[networkName];
  if (!("url" in networkConfig)) {
    console.error(`[ERROR] Network URL not found for ${networkName}`);
    process.exitCode = 1;
    return null;
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
  const MAKER_EVM_ADDRESS = "0x90385AB8beb475aA707b0D2597B81494b062E583";
  const TAKER_EVM_ADDRESS = "0xeA5A20D8d9Eeed3D8275993bdF3Bdb4749e7C485";
  const MAKER_EVM_TOKEN_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
  const AMOUNT_EVM = ethers.parseUnits("0.0005", 18);
  const SAFETY_DEPOSIT_AMOUNT = ethers.parseUnits("0.00001", 18);
  const AMOUNT_XRP = "1000000";

  let MAKER_XRP_ADDRESS = "r...";
  if (process.env.XRPL_SENDER_SECRET) {
    try {
      const xrplSenderWallet = XRPLWallet.fromSecret(process.env.XRPL_SENDER_SECRET);
      MAKER_XRP_ADDRESS = xrplSenderWallet.address;
      console.log(`[DEBUG] Derived MAKER_XRP_ADDRESS: ${MAKER_XRP_ADDRESS}`);
    } catch (e) {
      console.warn("[WARN] Could not derive MAKER_XRP_ADDRESS from XRPL_SENDER_SECRET. Using placeholder.", e);
    }
  } else {
    console.warn("[WARN] XRPL_SENDER_SECRET not set. Using placeholder for MAKER_XRP_ADDRESS.");
  }
  const TAKER_XRP_ADDRESS = process.env.RECEIVER_ADDRESS || "r...";
  if (TAKER_XRP_ADDRESS === "r...") {
    console.warn("[WARN] RECEIVER_ADDRESS not set. Using placeholder for TAKER_XRP_ADDRESS.");
  }

  // --- 3. Validate Configuration ---
  console.log("[DEBUG] Step 3: Validating configuration...");
  if (
    !MAKER_EVM_ADDRESS ||
    !TAKER_EVM_ADDRESS ||
    !MAKER_EVM_TOKEN_ADDRESS ||
    !MAKER_XRP_ADDRESS ||
    !TAKER_XRP_ADDRESS
  ) {
    throw new Error("Validation failed: One or more addresses are missing.");
  }
  if (!conditionData.secret || !conditionData.hashlock || !conditionData.condition) {
    throw new Error("Validation failed: Secret, hashlock, or condition is missing.");
  }
  console.log("[DEBUG] Configuration validated successfully.");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("[DEBUG] Step 4: Interacting with Escrow Factory...");
  const escrowFactory = new ethers.Contract(ESCROW_FACTORY_ADDRESS, ESCROW_FACTORY_ABI, wallet);
  console.log(`[DEBUG] EscrowFactory address: ${ESCROW_FACTORY_ADDRESS}`);

  const wethContract = new ethers.Contract(
    MAKER_EVM_TOKEN_ADDRESS,
    ["function approve(address spender, uint256 amount) public returns (bool)"],
    wallet,
  );

  // --- 2. Approve WETH for EscrowFactory ---
  console.log("[DEBUG] Step 5: Approving WETH for EscrowFactory...");
  try {
    const approveTx = await wethContract.approve(ESCROW_FACTORY_ADDRESS, AMOUNT_EVM);
    console.log("[DEBUG] WETH approval transaction sent. Hash:", approveTx.hash);
    await approveTx.wait();
    console.log("WETH approval successful!");
  } catch (error) {
    console.error("[ERROR] Step 5 failed: Error approving WETH:", error);
    process.exitCode = 1;
    return null;
  }

  // --- 4. Prepare Timelocks ---
  console.log("[DEBUG] Step 6: Preparing Timelocks...");
  const dstWithdrawalOffset = Math.floor(Date.now() / 1000);
  const dstPublicWithdrawalOffset = dstWithdrawalOffset + 5 * 60; // 5 minutes
  const dstCancellationOffset = dstWithdrawalOffset + 10 * 60; // 10 minutes
  console.log("Timelocks:");
  console.log("dstWithdrawalOffset:", dstWithdrawalOffset);
  console.log("dstPublicWithdrawalOffset:", dstPublicWithdrawalOffset);
  console.log("dstCancellationOffset:", dstCancellationOffset);

  console.log(
    `[DEBUG] Current Time: ${dstWithdrawalOffset}, Withdrawal Timelock: ${dstPublicWithdrawalOffset}, Cancellation Timelock: ${dstCancellationOffset}`,
  );

  const timelocksPacked = packTimelocks(dstWithdrawalOffset, {
    dstWithdrawal: dstPublicWithdrawalOffset,
    dstCancellation: dstCancellationOffset,
  });
  console.log(`[DEBUG] Packed Timelocks (BigInt): ${timelocksPacked.toString()}`);

  const dstImmutables = {
    orderHash: ethers.encodeBytes32String("VortexAuctionOrder"),
    hashlock: conditionData.hashlock,
    maker: BigInt(MAKER_EVM_ADDRESS),
    taker: BigInt(TAKER_EVM_ADDRESS),
    token: BigInt(MAKER_EVM_TOKEN_ADDRESS),
    amount: AMOUNT_EVM,
    safetyDeposit: SAFETY_DEPOSIT_AMOUNT,
    timelocks: timelocksPacked,
  };

  console.log("DstImmutables:", dstImmutables);

  const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 4 * 60 * 60; // 4 hours
  console.log("srcCancellationTimestamp:", srcCancellationTimestamp);

  console.log("Initiating cross-chain swap (creating DstEscrow)...");

  let uuid: string | null = null;

  try {
    console.log("[DEBUG] Step 7: Sending createDstEscrow transaction...");
    const tx = await escrowFactory.createDstEscrow(dstImmutables, srcCancellationTimestamp, {
      value: SAFETY_DEPOSIT_AMOUNT,
    });
    console.log("[DEBUG] createDstEscrow transaction sent. Hash:", tx.hash);
    await tx.wait();
    console.log("Cross-chain swap initiation successful!");
    console.log("Transaction hash:", tx.hash);

    console.log("[DEBUG] Step 8: Storing initial swap data in MongoDB...");
    const swapData = {
      status: "EVM_ORDER_CREATED",
      makerEVMAddress: MAKER_EVM_ADDRESS,
      takerEVMAddress: TAKER_EVM_ADDRESS,
      makerNonEVMAddress: MAKER_XRP_ADDRESS,
      takerNonEVMAddress: TAKER_XRP_ADDRESS,
      makerEVMTokenAddress: MAKER_EVM_TOKEN_ADDRESS,
      amountEVM: AMOUNT_EVM.toString(),
      amountNonEVM: AMOUNT_XRP.toString(),
      secretHash: conditionData.hashlock,
      secret: conditionData.secret,
      evmChainId: "sepolia",
      nonEVMChainType: "XRPL",
      nonEVMDetails: {
        xrplCondition: conditionData.condition,
      },
      evmTxHash: tx.hash,
      evmTimelock: dstCancellationOffset,
      evmPublicWithdrawTimelock: dstPublicWithdrawalOffset,
    };
    console.log("[DEBUG] Swap data payload:", swapData);

    // --- Validate Swap Data before saving to DB ---
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

    // --- Create HTLC Monitor record ---
    console.log("[DEBUG] Step 9: Creating HTLC Monitor record...");
    const monitorData = {
      swapUuid: uuid,
      chainType: "EVM",
      status: "PENDING",
      txHash: tx.hash,
      secretHash: conditionData.hashlock,
      timelock: dstCancellationOffset,
    };
    await axios.post(MONITOR_API_URL, monitorData);
    console.log("HTLC Monitor record created successfully.");
  } catch (error: any) {
    console.error("Error initiating cross-chain swap:", error);
    if (error.response) {
      console.error("API Error:", error.response.data);
    }
  }

  return uuid;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
