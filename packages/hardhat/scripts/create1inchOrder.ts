import { ethers, Wallet } from "ethers";
import { config } from "hardhat";
import password from "@inquirer/password";
import {
  LimitOrderBuilder,
  LimitOrderPredicateBuilder,
  LimitOrderProtocolFacade,
  Web3ProviderConnector,
} from "@1inch/limit-order-sdk";

export async function main() {
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
  const pass = await password({ message: "Enter your password to decrypt the private key:" });
  const PRIVATE_KEY = (await Wallet.fromEncryptedJson(DEPLOYER_PRIVATE_KEY_ENCRYPTED, pass)).privateKey;

  // Addresses from resources.md
  const MAKER_TOKEN_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"; // WETH on Sepolia
  const TAKER_TOKEN_ADDRESS = "0xC50E09fe277004c96A9eb4a1c06b0F39822e468C"; // MockDAI on Sepolia
  const LIMIT_ORDER_PROTOCOL_ADDRESS = "0x111111125421cA6dc452d289314280a0f8842A65"; // 1inch Router/LOP on Sepolia
  const DUTCH_AUCTION_CALCULATOR_ADDRESS = "0x45B2bDeB068a917B31E5752969fB807Cd955d5EF";

  // --- SETUP PROVIDER AND WALLET ---
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const connector = new Web3ProviderConnector(provider);

  // --- 1INCH SDK SETUP ---
  const limitOrderBuilder = new LimitOrderBuilder(
    LIMIT_ORDER_PROTOCOL_ADDRESS,
    11155111, // Sepolia Chain ID
    connector,
  );
  const limitOrderProtocolFacade = new LimitOrderProtocolFacade(LIMIT_ORDER_PROTOCOL_ADDRESS, connector);
  const limitOrderPredicateBuilder = new LimitOrderPredicateBuilder(limitOrderProtocolFacade);

  // --- BUILD THE LIMIT ORDER (DUTCH AUCTION) ---
  const makerAddress = wallet.address;
  const makerAsset = MAKER_TOKEN_ADDRESS;
  const takerAsset = TAKER_TOKEN_ADDRESS;
  const makingAmount = ethers.parseUnits("0.1", 18); // Example: 0.1 Maker Token

  // Dutch Auction Parameters
  const startTime = Math.floor(Date.now() / 1000); // Current timestamp
  const duration = 60 * 60; // 1 hour auction duration
  const endTime = startTime + duration;
  const takingAmountStart = ethers.parseUnits("100", 18); // Initial taking amount (e.g., 100 Taker Token)
  const takingAmountEnd = ethers.parseUnits("50", 18); // Final taking amount (e.g., 50 Taker Token)

  // Encode startTime and endTime into a single uint256 for extraData
  const startTimeEndTime = (BigInt(startTime) << BigInt(128)) | BigInt(endTime);

  // Encode extraData for DutchAuctionCalculator
  const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "uint256"],
    [startTimeEndTime, takingAmountStart, takingAmountEnd],
  );

  // Interaction with DutchAuctionCalculator
  const dutchAuctionCalculatorInterface = new ethers.Interface([
    "function getTakingAmount(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 remainingMakingAmount, bytes extraData) external view returns (uint256)",
  ]);

  const interaction = dutchAuctionCalculatorInterface.encodeFunctionData("getTakingAmount", [
    {
      salt: 0,
      maker: ethers.ZeroAddress,
      receiver: ethers.ZeroAddress,
      makerAsset: ethers.ZeroAddress,
      takerAsset: ethers.ZeroAddress,
      makingAmount: 0,
      takingAmount: 0,
      makerTraits: 0,
    },
    "0x",
    ethers.ZeroHash,
    ethers.ZeroAddress,
    0,
    0,
    extraData,
  ]);

  // Predicate: Simple timestamp predicate for order expiration
  const expiration = startTime + 60 * 60 * 24; // Order expires in 24 hours
  const predicate = limitOrderPredicateBuilder.timestampBelow(expiration);

  const order = limitOrderBuilder.buildLimitOrder({
    makerAsset,
    takerAsset,
    makerAddress,
    makingAmount: makingAmount.toString(),
    takingAmount: takingAmountStart.toString(),
    predicate,
    interaction: DUTCH_AUCTION_CALCULATOR_ADDRESS + interaction.substring(2),
  });

  // --- SIGN THE ORDER ---
  const signature = await limitOrderBuilder.buildOrderSignature(wallet, order);

  console.log("1inch Limit Order (Dutch Auction) created and signed:");
  console.log("Order:", order);
  console.log("Signature:", signature);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
