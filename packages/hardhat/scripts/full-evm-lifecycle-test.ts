import { ethers, Wallet, Contract } from "ethers";
import { config } from "hardhat";
import { execSync } from "child_process";
import ESCROW_FACTORY_ABI from "../../externalAbis/EscrowFactory.json";
import DST_ESCROW_ABI from "../../externalAbis/EscrowDst.json";
import { packTimelocks } from "../helpers/timelocks-helper";

async function main() {
  console.log("--- [DEBUG] Starting Full EVM Lifecycle Test ---");

  // --- 1. Configuration ---
  const networkName = "sepolia";
  const networkConfig = config.networks[networkName];
  if (!("url" in networkConfig)) {
    throw new Error(`Network URL not found for ${networkName}`);
  }
  const RPC_URL = networkConfig.url;
  const DEPLOYER_PRIVATE_KEY_ENCRYPTED = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
  const DEPLOYER_PASSWORD = process.env.DEPLOYER_PASSWORD;

  if (!DEPLOYER_PRIVATE_KEY_ENCRYPTED || !DEPLOYER_PASSWORD) {
    throw new Error("DEPLOYER_PRIVATE_KEY_ENCRYPTED or DEPLOYER_PASSWORD is not set in .env");
  }
  const DEPLOYER_PRIVATE_KEY = (await Wallet.fromEncryptedJson(DEPLOYER_PRIVATE_KEY_ENCRYPTED, DEPLOYER_PASSWORD)).privateKey;

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);

  const ESCROW_FACTORY_ADDRESS = "0x0bd657709620f1a5901c4651dd8be9eff4dfd9ae";
  const MAKER_EVM_ADDRESS = wallet.address;
  const TAKER_EVM_ADDRESS = "0xeA5A20D8d9Eeed3D8275993bdF3Bdb4749e7C485";
  const MAKER_EVM_TOKEN_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
  const AMOUNT_EVM = ethers.parseUnits("0.0001", 18);
  const SAFETY_DEPOSIT_AMOUNT = ethers.parseUnits("0.00001", 18);

  const escrowFactory = new Contract(ESCROW_FACTORY_ADDRESS, ESCROW_FACTORY_ABI, wallet);
  const wethContract = new Contract(
    MAKER_EVM_TOKEN_ADDRESS,
    ["function approve(address spender, uint256 amount) public returns (bool)"],
    wallet,
  );

  // --- 2. Create Escrow ---
  console.log("\n--- [STEP 1] CREATING ESCROW ---");
  const conditionData = JSON.parse(execSync("node scripts/helpers/xrpl-condition-generator.js").toString());
  const secret = `0x${conditionData.secret}`;
  const hashlock = conditionData.hashlock;

  const currentTime = Math.floor(Date.now() / 1000);
  const finishAfter = currentTime + 60; // 1 minute
  const cancelAfter = currentTime + 90; // 90 seconds

  const timelocksPacked = packTimelocks(currentTime, {
    dstWithdrawal: finishAfter,
    dstCancellation: cancelAfter,
  });

  const immutables = {
    orderHash: ethers.encodeBytes32String("VortexAuctionOrder"),
    hashlock: hashlock,
    maker: BigInt(MAKER_EVM_ADDRESS),
    taker: BigInt(TAKER_EVM_ADDRESS),
    token: BigInt(MAKER_EVM_TOKEN_ADDRESS),
    amount: AMOUNT_EVM,
    safetyDeposit: SAFETY_DEPOSIT_AMOUNT,
    timelocks: timelocksPacked,
  };

  console.log(
    "Using Immutables:",
    JSON.stringify(immutables, (key, value) => (typeof value === "bigint" ? value.toString() : value), 2),
  );

  await (await wethContract.approve(ESCROW_FACTORY_ADDRESS, AMOUNT_EVM)).wait();
  console.log("WETH Approved.");

  const createTx = await escrowFactory.createDstEscrow(immutables, cancelAfter, { value: SAFETY_DEPOSIT_AMOUNT });
  console.log("Create Escrow Tx Sent:", createTx.hash);
  const creationReceipt = await createTx.wait();
  console.log("Create Escrow Tx Confirmed.");

  // --- 3. Wait for FinishAfter ---
  console.log(`\n--- [STEP 2] WAITING FOR 65 SECONDS (for FinishAfter timelock) ---`);
  await new Promise(resolve => setTimeout(resolve, 65000));
  console.log("Wait finished.");

  // --- 4. Claim Escrow ---
  console.log("\n--- [STEP 3] CLAIMING ESCROW ---");
  const escrowFactoryInterface = new ethers.Interface(ESCROW_FACTORY_ABI);
  let dstEscrowAddress: string | null = null;
  for (const log of creationReceipt.logs) {
    try {
      const parsedLog = escrowFactoryInterface.parseLog(log);
      if (parsedLog && parsedLog.name === "DstEscrowCreated") {
        dstEscrowAddress = parsedLog.args.escrow;
        break;
      }
    } catch (e) {
      console.error("Error parsing log:", e);
    }
  }

  if (!dstEscrowAddress) {
    throw new Error("Could not find DstEscrowCreated event in transaction logs.");
  }
  console.log("Found DstEscrow contract address:", dstEscrowAddress);

  const dstEscrowContract = new Contract(dstEscrowAddress, DST_ESCROW_ABI, wallet);

  // Reconstruct immutables exactly as they were for creation
  const block = await provider.getBlock(creationReceipt.blockNumber);
  if (!block) {
    throw new Error("Could not get creation block.");
  }
  const deployedAtTimestamp = block.timestamp;
  console.log("Creation Block Timestamp:", deployedAtTimestamp);

  const reconstructedTimelocks = packTimelocks(deployedAtTimestamp, {
    dstWithdrawal: finishAfter,
    dstCancellation: cancelAfter,
  });

  const reconstructedImmutables = {
    ...immutables,
    timelocks: reconstructedTimelocks,
  };

  console.log(
    "Reconstructed Immutables:",
    JSON.stringify(reconstructedImmutables, (key, value) => (typeof value === "bigint" ? value.toString() : value), 2),
  );

  try {
    const claimTx = await dstEscrowContract.withdraw(reconstructedImmutables, secret);
    console.log("Claim Escrow Tx Sent:", claimTx.hash);
    await claimTx.wait();
    console.log("✅✅✅ EVM ESCROW CLAIMED SUCCESSFULLY! ✅✅✅");
  } catch (error) {
    console.error("❌❌❌ ERROR CLAIMING EVM ESCROW ❌❌❌");
    console.error(error);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
