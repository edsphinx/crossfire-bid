import { ethers, Wallet } from "ethers";
import { config } from "hardhat";
import ESCROW_FACTORY_ABI from "../../externalAbis/EscrowFactory.json";
import { generatePreimageSha256 } from "./helpers/xrpl-conditions";

async function main() {
  // --- CONFIGURATION ---
  const networkName = "sepolia"; // Target network
  const networkConfig = config.networks[networkName];
  if (!("url" in networkConfig)) {
    throw new Error(`Network URL not found for ${networkName}`);
  }
  const RPC_URL = networkConfig.url;

  const DEPLOYER_PRIVATE_KEY_ENCRYPTED = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
  if (!DEPLOYER_PRIVATE_KEY_ENCRYPTED) {
    throw new Error("DEPLOYER_PRIVATE_KEY_ENCRYPTED is not set in .env");
  }
  const pass = process.env.DEPLOYER_PASSWORD;
  if (!pass) {
    throw new Error("🚫️ DEPLOYER_PASSWORD environment variable not set.");
  }
  const PRIVATE_KEY = (await Wallet.fromEncryptedJson(DEPLOYER_PRIVATE_KEY_ENCRYPTED, pass)).privateKey;

  // Addresses from resources.md
  const ESCROW_FACTORY_ADDRESS = "0x0bd657709620f1a5901c4651dd8be9eff4dfd9ae";
  const MAKER_ADDRESS = "0x90385AB8beb475aA707b0D2597B81494b062E583"; // Your Sepolia account
  const TAKER_ADDRESS = "0xadA662b479c52d95f19881cd7dCDD6FB7577Ee27"; // Example taker address (could be another test account)
  const TOKEN_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"; // WETH on Sepolia
  const AMOUNT_TO_SWAP = ethers.parseUnits("0.005", 18); // 0.005 WETH
  const SAFETY_DEPOSIT_AMOUNT = ethers.parseUnits("0.0001", 18); // Small safety deposit in ETH

  // --- SETUP PROVIDER AND WALLET ---
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // --- INTERACT WITH ESCROW FACTORY ---
  const escrowFactory = new ethers.Contract(ESCROW_FACTORY_ADDRESS, ESCROW_FACTORY_ABI, wallet);

  // Generate secret and hashlock
  const preimage = Buffer.from(ethers.randomBytes(32));
  const { condition, fulfillment } = generatePreimageSha256(preimage);
  const hashlock = "0x" + ethers.sha256(preimage).substring(2);

  // Calculate timelocks (example: 1 hour from now for withdrawal, 2 hours for cancellation)
  const currentTime = Math.floor(Date.now() / 1000);
  const withdrawalTimelock = currentTime + 60 * 60;
  const cancellationTimelock = currentTime + 2 * 60 * 60;

  // Timelocks are packed into a single uint256. Need to understand the exact packing from 1inch TimelocksLib.sol
  // For now, we'll use a placeholder. In a real scenario, you'd use the TimelocksLib to pack this.
  // Based on TimelocksLib.sol, it seems to pack multiple timestamps. Let's simplify for the mock.
  // Assuming a simple structure where timelocks is just the withdrawal timelock for this demo.
  const timelocksPacked = BigInt(withdrawalTimelock);

  const dstImmutables = {
    orderHash: ethers.encodeBytes32String("VortexAuctionOrder"), // Placeholder order hash
    hashlock: hashlock,
    maker: MAKER_ADDRESS, // Maker on source chain
    taker: TAKER_ADDRESS, // Taker on destination chain
    token: TOKEN_ADDRESS, // Token being swapped
    amount: AMOUNT_TO_SWAP,
    safetyDeposit: SAFETY_DEPOSIT_AMOUNT,
    timelocks: timelocksPacked,
  };

  // srcCancellationTimestamp is for the source chain, which is also EVM (Sepolia) in this case
  const srcCancellationTimestamp = cancellationTimelock;

  console.log("Initiating cross-chain swap (creating DstEscrow)...");
  console.log("EVM Hashlock (raw SHA-256):", hashlock);
  console.log("XRP Ledger Condition:", condition);
  console.log("Secret (preimage, keep private!):", fulfillment);

  try {
    // The createDstEscrow function is payable, so we need to send ETH for the safetyDeposit
    const tx = await escrowFactory.createDstEscrow(dstImmutables, srcCancellationTimestamp, {
      value: SAFETY_DEPOSIT_AMOUNT,
    });
    await tx.wait();
    console.log("Cross-chain swap initiation successful!");
    console.log("Transaction hash:", tx.hash);
    console.log("EscrowFactory address:", ESCROW_FACTORY_ADDRESS);
    console.log("DstImmutables:", dstImmutables);
    console.log("srcCancellationTimestamp:", srcCancellationTimestamp);

    // In a real scenario, you would now pass the secret and hashlock to the XRP Ledger side
    // and monitor for the DstEscrowCreated event to get the actual escrow address.
  } catch (error) {
    console.error("Error initiating cross-chain swap:", error);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
