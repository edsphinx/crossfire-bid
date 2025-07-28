import { execSync } from "child_process";

async function main() {
  console.log("--- [DEBUG] Starting Trigger ---");

  // --- 1. Initiate EVM Escrow ---
  console.log("[DEBUG] Step 1: Initiating EVM escrow...");
  let uuid: string | null = null;
  try {
    const output = execSync("yarn ts-node scripts/initiateCrossChainSwap.ts", { encoding: "utf-8" });
    console.log(output);
    // Extract UUID from the output
    const match = output.match(/Swap data stored successfully. UUID: ([\w-]+)/);
    if (match && match[1]) {
      uuid = match[1];
      console.log(`[DEBUG] EVM escrow initiated successfully. UUID: ${uuid}`);
    } else {
      throw new Error("Could not extract UUID from initiateCrossChainSwap_v13.ts output.");
    }
  } catch (error: any) {
    console.error("[ERROR] Step 1 failed: Error initiating EVM escrow:", error.message);
    process.exitCode = 1;
    return;
  }

  // --- 2. Create XRP HTLC ---
  if (uuid) {
    console.log(`[DEBUG] Step 2: Creating XRP HTLC for UUID: ${uuid}...`);
    try {
      const output = execSync(`yarn ts-node scripts/createXRPHTLC_v13.ts ${uuid}`, { encoding: "utf-8" });
      console.log(output);
      console.log("[DEBUG] XRP HTLC created successfully.");
    } catch (error: any) {
      console.error(`[ERROR] Step 2 failed: Error creating XRP HTLC for UUID ${uuid}:`, error.message);
      process.exitCode = 1;
      return;
    }
  }

  console.log("--- [DEBUG] Trigger finished. ---");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
