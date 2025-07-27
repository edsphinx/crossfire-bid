import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

async function main() {
  const API_BASE_URL: string = "http://localhost:3000/api/cross-chain-htlc-swaps"; // Your Next.js API base URL

  console.log("--- Starting API Test Script ---");

  let testSwapUuid: string = ""; // To store the UUID of the swap we create

  // --- 1. Test POST: Create a New Swap ---
  console.log("\n--- 1. Testing POST: Creating a New Swap ---");
  try {
    const uniqueSecretHash = "0x" + crypto.createHash("sha256").update(uuidv4()).digest("hex");
    const initialSwapData = {
      status: "INITIATED", // This will be used by the API to set the initial history status
      makerEVMAddress: "0xMakerEVMAddress1234567890123456789012345",
      takerEVMAddress: "0xTakerEVMAddress1234567890123456789012345",
      makerNonEVMAddress: "rMakerXRPAddressABCDEFGHJKLMNPQRSTUVWXYZ",
      takerNonEVMAddress: "rTakerXRPAddressABCDEFGHJKLMNPQRSTUVWXYZ",
      makerEVMTokenAddress: "0xTokenAddress12345678901234567890123456",
      amountEVM: "1000000000000000000", // 1 ETH in wei
      amountNonEVM: "25000000", // 25 XRP in drops
      secretHash: uniqueSecretHash,
      secret: "mysecretpreimage",
      evmChainId: "sepolia",
      nonEVMChainType: "XRPL",
      nonEVMDetails: {
        xrplSpecificField1: "value1",
        xrplSpecificField2: "value2",
        xrplHTLCID: "HTLC_ID_FROM_XRPL_TRANSACTION",
        xrplCondition: "A020...",
      },
      evmTimelock: Math.floor(Date.now() / 1000) + 3600 * 24, // 24 hours from now
      nonEVMTimelock: Math.floor(Date.now() / 1000) + 3600 * 23, // 23 hours from now
    };

    const postResponse = await axios.post(API_BASE_URL, initialSwapData);
    console.log("POST Response Status:", postResponse.status);
    // console.log('POST Response Data:', postResponse.data); // Uncomment for full data

    if (postResponse.data.success && postResponse.data.data.uuid) {
      testSwapUuid = postResponse.data.data.uuid;
      console.log(`Successfully created swap with UUID: ${testSwapUuid}`);

      // --- VERIFY INITIAL HISTORY ENTRY ---
      const history = postResponse.data.data.history;
      if (
        history &&
        Array.isArray(history) &&
        history.length === 1 &&
        history[0].status === "INITIATED" &&
        history[0].details?.message === "Swap initiated and record created."
      ) {
        console.log("✅ History: Initial INITIATED event found.");
      } else {
        console.error("❌ History: Initial INITIATED event NOT found or malformed.");
        console.log("History data:", history);
        return; // Exit if initial history is bad
      }
    } else {
      console.error("Failed to create swap or UUID not returned.");
      return;
    }
  } catch (error: any) {
    console.error("Error during POST request:", error.response ? error.response.data : error.message);
    return;
  }

  // --- 2. Test GET by UUID: Retrieve the Created Swap ---
  console.log("\n--- 2. Testing GET by UUID: Retrieving the Created Swap ---");
  try {
    const getResponse = await axios.get(`${API_BASE_URL}/${testSwapUuid}`);
    console.log("GET Response Status:", getResponse.status);
    // console.log('GET Response Data:', getResponse.data); // Uncomment for full data

    if (getResponse.data.success && getResponse.data.data.uuid === testSwapUuid) {
      console.log(`Successfully retrieved swap: ${getResponse.data.data.uuid}`);
      // VERIFY HISTORY AGAIN AFTER GET
      const history = getResponse.data.data.history;
      if (history && Array.isArray(history) && history.length === 1 && history[0].status === "INITIATED") {
        console.log("✅ History: Initial INITIATED event confirmed on GET.");
      } else {
        console.error("❌ History: Initial INITIATED event missing or malformed on GET.");
      }
    } else {
      console.error("Failed to retrieve swap or UUID mismatch.");
    }
  } catch (error: any) {
    console.error("Error during GET request by UUID:", error.response ? error.response.data : error.message);
  }

  // --- 3. Test PUT: Update Swap Status and Add TX Hash ---
  console.log("\n--- 3. Testing PUT: Updating Swap Status and Adding TX Hash ---");
  let initialHistoryLength = 0;
  try {
    // First, get the current history length to compare after PUT
    const currentSwapResponse = await axios.get(`${API_BASE_URL}/${testSwapUuid}`);
    if (currentSwapResponse.data.success && currentSwapResponse.data.data.history) {
      initialHistoryLength = currentSwapResponse.data.data.history.length;
    }

    const updateData = {
      status: "EVM_ORDER_CREATED", // Update status
      evmTxHash: "0xevmTxHash1234567890abcdef1234567890abcdef1234567890", // Add a new TX hash
      nonEVMDetails: {
        // You can update nested objects, merge logic on API side
        xrplSpecificField1: "updated_value_1",
        xrplEscrowConfirmed: true,
      },
    };

    const putResponse = await axios.put(`${API_BASE_URL}/${testSwapUuid}`, updateData);
    console.log("PUT Response Status:", putResponse.status);
    // console.log('PUT Response Data:', putResponse.data); // Uncomment for full data

    if (
      putResponse.data.success &&
      putResponse.data.data.status === "EVM_ORDER_CREATED" &&
      putResponse.data.data.evmTxHash === updateData.evmTxHash
    ) {
      console.log("Successfully updated swap status and EVM TX hash.");

      // --- VERIFY HISTORY UPDATE AFTER PUT ---
      const history = putResponse.data.data.history;
      if (history && Array.isArray(history) && history.length === initialHistoryLength + 1) {
        console.log("✅ History: Length increased by 1 after PUT.");
        const lastEvent = history[history.length - 1];
        if (
          lastEvent.status === "EVM_ORDER_CREATED" &&
          lastEvent.txHash === updateData.evmTxHash &&
          lastEvent.chainType === "EVM" &&
          lastEvent.details?.txType === "EVM_ORDER_CREATION"
        ) {
          console.log("✅ History: New EVM_ORDER_CREATED event details correctly recorded.");
        } else {
          console.error("❌ History: New EVM_ORDER_CREATED event details mismatch.");
          console.log("Last history event:", lastEvent);
        }
      } else {
        console.error("❌ History: Length did NOT increase by 1 after PUT or history is malformed.");
        console.log("History data:", history);
      }
    } else {
      console.error("Failed to update swap or data mismatch after PUT.");
    }
  } catch (error: any) {
    console.error("Error during PUT request:", error.response ? error.response.data : error.message);
  }

  // --- 4. Test GET (again): Retrieve Updated Swap ---
  console.log("\n--- 4. Testing GET: Retrieving the Updated Swap to Confirm ---");
  try {
    const finalGetResponse = await axios.get(`${API_BASE_URL}/${testSwapUuid}`);
    console.log("GET (Final) Response Status:", finalGetResponse.status);
    // console.log('GET (Final) Response Data:', finalGetResponse.data); // Uncomment for full data

    if (finalGetResponse.data.success && finalGetResponse.data.data.status === "EVM_ORDER_CREATED") {
      console.log("Confirmed swap updated successfully.");

      // --- FINAL HISTORY VERIFICATION ---
      const history = finalGetResponse.data.data.history;
      if (history && Array.isArray(history) && history.length === 2 && history[1].status === "EVM_ORDER_CREATED") {
        console.log("✅ History: Final GET confirms 2 events and EVM_ORDER_CREATED status.");
      } else {
        console.error("❌ History: Final GET history check failed.");
        console.log("History data:", history);
      }
    } else {
      console.error("Confirmation failed: Swap status not updated correctly.");
    }
  } catch (error: any) {
    console.error("Error during final GET request:", error.response ? error.response.data : error.message);
  }

  // --- Optional: Test GET All Swaps ---
  console.log("\n--- Optional: Testing GET: Retrieving All Swaps ---");
  try {
    const getAllResponse = await axios.get(API_BASE_URL);
    console.log("GET All Swaps Status:", getAllResponse.status);
    console.log("Number of swaps retrieved:", getAllResponse.data.data.length);
  } catch (error: any) {
    console.error("Error during GET all swaps request:", error.response ? error.response.data : error.message);
  }

  console.log("\n--- API Test Script Finished ---");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
