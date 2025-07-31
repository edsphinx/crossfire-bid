import ESCROW_FACTORY_ABI from "../../externalAbis/EscrowFactory.json";
import * as dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config({ path: ".env.local" });

async function main() {
  const txHash = process.argv[2];
  if (!txHash) {
    console.error("Please provide a transaction hash as a command-line argument.");
    process.exit(1);
  }

  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA;
  if (!RPC_URL) {
    throw new Error("NEXT_PUBLIC_RPC_URL_SEPOLIA is not set in .env.local");
  }

  console.log(`--- [DEBUG] Inspecting Transaction: ${txHash} ---`);
  console.log(`Using RPC URL: ${RPC_URL}`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const iface = new ethers.Interface(ESCROW_FACTORY_ABI);

  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      console.error("Transaction receipt not found.");
      return;
    }

    console.log("\n--- Transaction Receipt ---");
    console.log("Block Number:", receipt.blockNumber);
    console.log("Status:", receipt.status === 1 ? "Success" : "Failed");
    console.log(`Found ${receipt.logs.length} logs.`);

    console.log("\n--- Inspecting Logs ---");
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      console.log(`\n--- Log #${i} ---`);
      console.log("  Address:", log.address);
      console.log("  Topics:", log.topics);
      console.log("  Data:", log.data);

      try {
        const parsedLog = iface.parseLog(log);
        if (parsedLog) {
          console.log("  ✅ Parsed Log:");
          console.log("    Name:", parsedLog.name);
          console.log("    Signature:", parsedLog.signature);
          console.log("    Args:", parsedLog.args.map(arg => arg.toString()).join(", "));
        }
      } catch (e) {
        console.log("  ❌ Could not parse log with EscrowFactory ABI.", e);
      }
    }
  } catch (error) {
    console.error("Error inspecting transaction:", error);
  }
}

main();
