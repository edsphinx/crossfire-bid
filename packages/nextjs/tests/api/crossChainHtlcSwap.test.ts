import axios from "axios";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

const API_BASE_URL: string = "http://localhost:3000/api/cross-chain-htlc-swaps";

describe("CrossChainHtlcSwap API Integration Tests", () => {
  let testSwapUuid: string;
  let uniqueSecretHash: string;

  beforeAll(async () => {
    // will add stuff later
  });

  // Before each test, generate unique data
  beforeEach(() => {
    uniqueSecretHash = "0x" + crypto.createHash("sha256").update(uuidv4()).digest("hex");
  });

  it("should successfully create a new swap and have initial history", async () => {
    const initialSwapData = {
      status: "INITIATED",
      makerEVMAddress: "0xMakerEVMAddress1234567890123456789012345",
      takerEVMAddress: "0xTakerEVMAddress1234567890123456789012345",
      makerNonEVMAddress: "rMakerXRPAddressABCDEFGHJKLMNPQRSTUVWXYZ",
      takerNonEVMAddress: "rTakerXRPAddressABCDEFGHJKLMNPQRSTUVWXYZ",
      makerEVMTokenAddress: "0xTokenAddress12345678901234567890123456",
      amountEVM: "1000000000000000000",
      amountNonEVM: "25000000",
      secretHash: uniqueSecretHash,
      secret: "mysecretpreimage-" + uuidv4(),
      evmChainId: "sepolia",
      nonEVMChainType: "XRPL",
      nonEVMDetails: {
        xrplSpecificField1: "value1",
        xrplSpecificField2: "value2",
        xrplHTLCID: "HTLC_ID_FROM_XRPL_TRANSACTION",
        xrplCondition: "A020...",
      },
      evmTimelock: Math.floor(Date.now() / 1000) + 3600 * 24,
      nonEVMTimelock: Math.floor(Date.now() / 1000) + 3600 * 23,
    };

    const postResponse = await axios.post(API_BASE_URL, initialSwapData);

    expect(postResponse.status).toBe(201);
    expect(postResponse.data.success).toBe(true);
    expect(postResponse.data.data.uuid).toBeDefined();
    testSwapUuid = postResponse.data.data.uuid; // Store for subsequent tests

    const history = postResponse.data.data.history;
    expect(history).toBeInstanceOf(Array);
    expect(history.length).toBe(1);
    expect(history[0].status).toBe("INITIATED");
    expect(history[0].details?.message).toBe("Swap initiated and record created.");
  });

  it("should retrieve the created swap and confirm its history", async () => {
    expect(testSwapUuid).toBeDefined(); // Ensure UUID from previous test is available
    const getResponse = await axios.get(`${API_BASE_URL}/${testSwapUuid}`); // Assuming we will add a GET by UUID endpoint for now or maybe forever

    expect(getResponse.status).toBe(200);
    expect(getResponse.data.success).toBe(true);
    expect(getResponse.data.data.uuid).toBe(testSwapUuid);

    const history = getResponse.data.data.history;
    expect(history).toBeInstanceOf(Array);
    expect(history.length).toBe(1);
    expect(history[0].status).toBe("INITIATED");
  });
});
