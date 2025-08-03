import "dotenv/config";
import { ethers, Wallet, Contract, isAddress, getAddress, randomBytes, Network } from "ethers";
import { uint8ArrayToHex, UINT_40_MAX } from "@1inch/byte-utils";
import { execSync } from "child_process";
import {
  AuctionDetails,
  Immutables,
  TimeLocks,
  Address,
  HashLock,
  CrossChainOrder,
  TakerTraits,
  AmountMode,
  DstImmutablesComplement,
  NetworkEnum,
  randBigInt,
  EscrowFactory,
} from "@1inch/cross-chain-sdk";
import * as fs from "fs";
import * as path from "path";
import { Resolver } from "../helpers/resolver";
import { assert } from "../helpers/assert";
import { checkBalances } from "../helpers/check-balance";
// import { abi as MockUSDCABI, address as MockUSDCAddress } from "../deployments/localhost/MockUSDC.json";

// const networkName = "sepolia";
// Helper function to stringify bigints
// const jsonReplacer = (key: any, value: any) => (typeof value === "bigint" ? value.toString() : value);

// Helper function to load deployment info
function getDeployment(contractName: string, networkName: string) {
  console.log(`   [getDeployment] Loading deployment for: ${contractName} on network: ${networkName}`);
  const filePath = path.join(__dirname, `../deployments/${networkName}/${contractName}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`   [getDeployment] ❌ Deployment file not found at: ${filePath}`);
    throw new Error(`Deployment file not found for ${contractName} on ${networkName} at ${filePath}`);
  }
  const fileContent = fs.readFileSync(filePath, "utf8");
  const deployment = JSON.parse(fileContent);
  assert(deployment.address && isAddress(deployment.address), `Invalid or missing address for ${contractName}`);
  assert(deployment.abi && deployment.abi.length > 0, `ABI not found or empty for ${contractName}`);
  console.log(
    `   [getDeployment] ✅ Successfully loaded deployment for ${contractName} at address ${deployment.address}`,
  );
  return deployment;
}

// Function to pause execution and display a timer
async function pauseWithTimer(durationInMinutes: number): Promise<void> {
  const durationInSeconds = durationInMinutes * 60;
  console.log(`Pausing execution for ${durationInMinutes} minutes...`);

  for (let i = durationInSeconds; i > 0; i--) {
    // Use a carriage return '\r' to overwrite the current line
    process.stdout.write(`Time remaining: ${i} seconds.\r`);
    // Wait for 1 second before the next iteration
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Clear the line once the timer is done
  console.log("\nPause finished.");
}

async function main() {
  console.log("--- [DEBUG] Starting Full EVM Lifecycle Test v49 (Using Resolver Helper) ---");

  // --- 1. Configuration ---
  console.log("\n--- [STEP 1] CONFIGURATION & VERIFICATION ---");
  // const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545/";
  const RPC_URL = "http://127.0.0.1:8545/";
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  console.log("✅ Provider created for RPC:", RPC_URL);
  const network = await provider.getNetwork();
  let networkName = "hardhat";
  console.log("✅ Network:", network.name);
  const chainId = Number(network.chainId); // network.chainId;
  console.log("✅ Chain ID:", network.chainId);

  let DEPLOYER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  let TAKER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  // const makerWallet = new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider); // Maker / Owner
  // const takerWallet = new Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider); // Taker
  if (chainId === 31337) {
    DEPLOYER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    TAKER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    networkName = "localhost";
  } else if (chainId === 11155111) {
    const DEPLOYER_PRIVATE_KEY_ENCRYPTED = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
    const DEPLOYER_PASSWORD = process.env.DEPLOYER_PASSWORD;
    const TAKER_PRIVATE_KEY_ENCRYPTED = process.env.TAKER_PRIVATE_KEY_ENCRYPTED;
    const TAKER_PASSWORD = process.env.TAKER_PASSWORD;
    networkName = "sepolia";

    if (!DEPLOYER_PRIVATE_KEY_ENCRYPTED || !DEPLOYER_PASSWORD || !TAKER_PRIVATE_KEY_ENCRYPTED || !TAKER_PASSWORD) {
      throw new Error(
        "DEPLOYER_PRIVATE_KEY_ENCRYPTED or DEPLOYER_PASSWORD or TAKER_PRIVATE_KEY_ENCRYPTED or TAKER_PASSWORD is not set in .env",
      );
    }
    DEPLOYER_PRIVATE_KEY = (await Wallet.fromEncryptedJson(DEPLOYER_PRIVATE_KEY_ENCRYPTED, DEPLOYER_PASSWORD))
      .privateKey;
    TAKER_PRIVATE_KEY = (await Wallet.fromEncryptedJson(TAKER_PRIVATE_KEY_ENCRYPTED, TAKER_PASSWORD)).privateKey;
  }
  if (!DEPLOYER_PRIVATE_KEY || !TAKER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY or TAKER_PRIVATE_KEY is not set in .env");
  }
  const makerWallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const takerWallet = new Wallet(TAKER_PRIVATE_KEY, provider);
  console.log(`✅ Maker/Owner Wallet Address: ${makerWallet.address}`);
  console.log(`✅ Taker Wallet Address: ${takerWallet.address}`);

  const escrowFactoryDeployment = getDeployment("EscrowFactory", networkName);
  const wethDeployment = getDeployment("MockWETH", networkName);
  const usdcDeployment = getDeployment("MockUSDC", networkName);
  const xrpDeployment = getDeployment("MockXRP", networkName);
  const resolverDeployment = getDeployment("srcResolver", networkName);
  const lopDeployment = getDeployment("LimitOrderProtocol", networkName);
  console.log("✅ All deployment artifacts loaded.");

  const MAKER_EVM_ADDRESS = getAddress(makerWallet.address);
  const TAKER_EVM_ADDRESS = getAddress(takerWallet.address);
  const RESOLVER_ADDRESS = getAddress(resolverDeployment.address);
  const LOP_ADDRESS =
    Network.name == "sepolia" ? process.env.SEPOLIA_LIMIT_ORDER_PROTOCOL : getAddress(lopDeployment.address);
  const MAKER_EVM_TOKEN_ADDRESS = getAddress(wethDeployment.address);
  const MAKER_USDC_TOKEN_ADDRESS = getAddress(usdcDeployment.address);
  const TAKER_XRP_TOKEN_ADDRESS = getAddress(xrpDeployment.address);
  const ESCROW_FACTORY_ADDRESS = getAddress(escrowFactoryDeployment.address);

  // const mockUSDC = new ethers.Contract(MockUSDCAddress, MockUSDCABI, makerWallet);
  // const makerTokenBalance = await mockUSDC.balanceOf(makerWallet.address);
  // console.log(`✅ Maker balance: ${makerTokenBalance}`);
  // const amountToTransfer = ethers.parseUnits("1000", 6);
  // const tx = await mockUSDC.transfer(TAKER_EVM_ADDRESS, amountToTransfer);
  // console.log(`tx sent: ${tx.hash}`);
  // await tx.wait();
  // const takerBalance = await mockUSDC.balanceOf(TAKER_EVM_ADDRESS);
  // console.log(`✅ Taker balance: ${takerBalance}`);
  // console.log("✅ All addresses loaded and checksummed:");
  console.log(`   - Maker: ${MAKER_EVM_ADDRESS}`);
  console.log(`   - Taker: ${TAKER_EVM_ADDRESS}`);
  console.log(`   - Resolver: ${RESOLVER_ADDRESS}`);
  console.log(`   - LimitOrderProtocol (LOP): ${LOP_ADDRESS}`);
  console.log(`   - MockWETH: ${MAKER_EVM_TOKEN_ADDRESS}`);
  console.log(`   - MockUSDC: ${TAKER_XRP_TOKEN_ADDRESS}`);
  console.log(`   - EscrowFactory: ${ESCROW_FACTORY_ADDRESS}`);

  // const wethContract = new Contract(MAKER_EVM_TOKEN_ADDRESS, wethDeployment.abi, makerWallet);
  const usdcContract = new Contract(MAKER_USDC_TOKEN_ADDRESS, usdcDeployment.abi, makerWallet);
  const xrpContract = new Contract(TAKER_XRP_TOKEN_ADDRESS, xrpDeployment.abi, makerWallet);
  const escrowFactory = new Contract(ESCROW_FACTORY_ADDRESS, escrowFactoryDeployment.abi, provider);
  console.log("✅ Contract instances created.");

  // const AMOUNT_EVM = ethers.parseUnits("1", 18);
  const AMOUNT_USDC = ethers.parseUnits("1000000", 6);
  const AMOUNT_XRP = ethers.parseUnits("1000000", 6);
  const SAFETY_DEPOSIT_AMOUNT = ethers.parseUnits("0.00001", 18);

  try {
    await checkBalances(provider, makerWallet.address, [usdcContract, xrpContract]);
    await checkBalances(provider, takerWallet.address, [usdcContract, xrpContract]);
    await makerWallet.sendTransaction({ to: takerWallet.address, value: SAFETY_DEPOSIT_AMOUNT });
    // const tx0 = await wethContract.deposit({ value: AMOUNT_EVM });
    // console.log("✅ Deposited 0.0001 ETH to Maker");
    // console.log(tx0);
    // console.log("Starting USDC and XRP transfers...");
    // const tx1 = await usdcDeployment.topUpFromDonor(takerWallet.address, MAKER_EVM_ADDRESS, AMOUNT_USDC);
    // console.log("✅ Transferred 1000000 USDC to Taker");
    // console.log(tx1);
    // const tx2 = await xrpDeployment.topUpFromDonor(takerWallet.address, MAKER_EVM_ADDRESS, AMOUNT_XRP);
    // console.log("✅ Transferred 1000000 XRP to Taker");
    // console.log(tx2);
    // console.log("Finished USDC and XRP transfers.");
    // await checkBalances(provider, makerWallet.address, [usdcContract, xrpContract]);
    // await checkBalances(provider, takerWallet.address, [usdcContract, xrpContract]);
    const ethBalanceWeiMaker = await provider.getBalance(takerWallet.address);
    const ethBalanceMaker = ethers.formatEther(ethBalanceWeiMaker);
    console.log(`✅ Maker ETH: ${ethBalanceMaker}`);
    const ethBalanceWeiTaker = await provider.getBalance(takerWallet.address);
    const ethBalanceTaker = ethers.formatEther(ethBalanceWeiTaker);
    console.log(`✅ Taker ETH: ${ethBalanceTaker}`);
    // const ethBalanceWeiTaker = await provider.getBalance(takerWallet.address);
    // const ethBalanceTaker = ethers.formatEther(ethBalanceWeiTaker);
    // console.log(`✅ Maker ETH: ${ethBalanceTaker}`);
    // console.log("✅ ETH balances checked.");
    console.log("------------------------------------------");
  } catch (error) {
    console.error(`❌ Failed to get ETH balance: ${error}`);
  }

  // --- 2. Create and Sign Order ---
  console.log("\n--- [STEP 2] CREATING AND SIGNING ORDER ---");
  const { secret, hashlock } = JSON.parse(execSync("node scripts/helpers/evm-hashlock-generator.js").toString());
  console.log(`✅ Generated Secret: ${secret}`);
  console.log(`✅ Generated Hashlock: ${hashlock}`);

  const timeLocks = TimeLocks.new({
    srcWithdrawal: 10n,
    srcPublicWithdrawal: 120n,
    srcCancellation: 121n,
    srcPublicCancellation: 122n,
    dstWithdrawal: 10n,
    dstPublicWithdrawal: 100n,
    dstCancellation: 101n,
  });

  const secrets = Array.from({ length: 11 }).map(() => uint8ArrayToHex(randomBytes(32))); // note: use crypto secure random number in the real world
  const secretHashes = secrets.map(s => HashLock.hashSecret(s));
  const leaves = HashLock.getMerkleLeaves(secrets);

  const order = CrossChainOrder.new(
    new Address(ESCROW_FACTORY_ADDRESS),
    {
      salt: 1n,
      maker: new Address(MAKER_EVM_ADDRESS),
      makingAmount: AMOUNT_USDC,
      takingAmount: AMOUNT_XRP,
      makerAsset: new Address(MAKER_USDC_TOKEN_ADDRESS),
      takerAsset: new Address(TAKER_XRP_TOKEN_ADDRESS),
    },
    {
      hashLock: HashLock.forMultipleFills(leaves),
      timeLocks: timeLocks,
      srcChainId: NetworkEnum.ETHEREUM,
      dstChainId: NetworkEnum.SONIC,
      srcSafetyDeposit: SAFETY_DEPOSIT_AMOUNT,
      dstSafetyDeposit: SAFETY_DEPOSIT_AMOUNT,
    },
    {
      auction: new AuctionDetails({
        initialRateBump: 0,
        points: [],
        duration: 120n,
        startTime: BigInt(Math.floor(Date.now() / 1000)),
      }),
      whitelist: [{ address: new Address(RESOLVER_ADDRESS), allowFrom: 0n }],
      resolvingStartTime: 0n,
    },
    {
      nonce: randBigInt(UINT_40_MAX),
      allowPartialFills: false,
      allowMultipleFills: false,
      orderExpirationDelay: 3600n,
    },
  );
  console.log("✅ CrossChainOrder object created via SDK.");

  const typedData = order.getTypedData(chainId);
  console.log(">>> Signing typed data with Maker wallet...");
  if (!LOP_ADDRESS) {
    throw new Error("LOP_ADDRESS is undefined");
  }
  // const signature = await makerWallet.signOrder(srcChainId, order)
  // typedData.domain.verifyingContract = new Address(LOP_ADDRESS);
  const signature = await makerWallet.signTypedData(
    typedData.domain,
    { Order: typedData.types.Order },
    typedData.message,
  );
  console.log("✅ Order created and signed correctly.");

  // --- 3. Fill Order (deploySrc) ---
  console.log("\n--- [STEP 3] FILLING ORDER (deploySrc) ---");
  // await (await usdcContract.approve(LOP_ADDRESS, AMOUNT_USDC)).wait();
  // await (await xrpContract.approve(LOP_ADDRESS, AMOUNT_XRP)).wait();
  // console.log("✅ Maker WETH approved to Limit Order Protocol.");

  console.log(">>> Building deploySrc transaction with Resolver helper...");
  console.log("RESOLVER_ADDRESS before verification:", RESOLVER_ADDRESS);
  // if (RESOLVER_ADDRESS === undefined) {
  //   console.log("RESOLVER_ADDRESS is undefined");
  //   throw new Error("RESOLVER_ADDRESS is undefined");
  // } else if (RESOLVER_ADDRESS === null) {
  //   console.log("RESOLVER_ADDRESS is null");
  //   throw new Error("RESOLVER_ADDRESS is null");
  // } else if (RESOLVER_ADDRESS === "") {
  //   console.log("RESOLVER_ADDRESS is empty");
  //   throw new Error("RESOLVER_ADDRESS is empty");
  // } else if (RESOLVER_ADDRESS === "0x") {
  //   console.log("RESOLVER_ADDRESS is 0x");
  //   throw new Error("RESOLVER_ADDRESS is 0x");
  // } else if (RESOLVER_ADDRESS === "0x0000000000000000000000000000000000000000") {
  //   console.log("RESOLVER_ADDRESS is 0x0000000000000000000000000000000000000000");
  //   throw new Error("RESOLVER_ADDRESS is 0x0000000000000000000000000000000000000000");
  // } else if (RESOLVER_ADDRESS === "0x0000000000000000000000000000000000000000000000000000000000000000") {
  //   console.log("RESOLVER_ADDRESS is 0x0000000000000000000000000000000000000000000000000000000000000000");
  //   throw new Error("RESOLVER_ADDRESS is 0x0000000000000000000000000000000000000000000000000000000000000000");
  // } else {
  //   console.log("RESOLVER_ADDRESS after verification is:", RESOLVER_ADDRESS);
  // }
  // if (typeof RESOLVER_ADDRESS !== "string") {
  //   console.log("RESOLVER_ADDRESS is not a string");
  //   console.log(`RESOLVER_ADDRESS is typeof ${typeof RESOLVER_ADDRESS}`);
  //   throw new Error("RESOLVER_ADDRESS is not a string");
  // }
  const resolverHelper = new Resolver(RESOLVER_ADDRESS, RESOLVER_ADDRESS);

  const idx = secrets.length - 1;
  const takerTraits = TakerTraits.default()
    .setExtension(order.extension)
    .setInteraction(
      new EscrowFactory(new Address(ESCROW_FACTORY_ADDRESS)).getMultipleFillInteraction(
        HashLock.getProof(leaves, idx),
        idx,
        secretHashes[idx],
      ),
    )
    .setAmountMode(AmountMode.maker)
    .setAmountThreshold(AMOUNT_USDC);

  console.log(">>> Building deploySrc transaction with Resolver helper...");
  const deploySrcTxRequest = resolverHelper.deploySrc(
    chainId,
    order,
    signature,
    takerTraits,
    AMOUNT_USDC,
    HashLock.fromString(secretHashes[idx]),
  );

  console.log(">>> Sending raw deploySrc transaction with Maker/Owner wallet...");
  let deploySrcTx: any;
  try {
    console.log("Starting deploySrc transaction...");
    //  = await makerWallet.sendTransaction(deploySrcTxRequest);
    deploySrcTx = await makerWallet.sendTransaction({
      ...deploySrcTxRequest,
      gasLimit: 10_000_000,
      from: makerWallet.getAddress(),
    });
    const receipt = await deploySrcTx.wait(1);
    console.log("✅ deploySrc transaction sent.");
    if (receipt === null || receipt.status === 0) {
      console.log("deploySrc transaction failed to get a receipt");
      throw new Error("deploySrc transaction reverted");
    } else if (receipt !== null) {
      console.log("✅ deploySrc transaction confirmed. Block:", receipt.blockNumber);
      console.log(receipt);
    }
  } catch (error) {
    console.log("Error sending deploySrc transaction with Maker/Owner wallet:", error);
    throw new Error("Error sending deploySrc transaction with Maker/Owner wallet");
  }
  const deploySrcReceipt = await deploySrcTx.wait();
  if (deploySrcReceipt === null || deploySrcReceipt.status === 0) {
    console.log("deploySrc transaction failed to get a receipt");
    throw new Error("deploySrc transaction reverted");
  } else if (deploySrcReceipt !== null) {
    console.log("✅ deploySrc transaction confirmed. Block:", deploySrcReceipt.blockNumber);
  }
  await pauseWithTimer(0.15);

  // --- 4. Parse Event and deployDst ---
  console.log("\n--- [STEP 4] PARSING EVENT AND DEPLOYING DST ---");
  let srcImmutablesFromEvent, dstImmutablesComplementFromEvent;
  console.log(">>> Parsing SrcEscrowCreated event...");
  console.log("escrowFactory interface:", escrowFactory.interface);
  console.log("deploySrcReceipt:", deploySrcReceipt);
  if (deploySrcReceipt === null) {
    console.log("deploySrcReceipt is null");
    throw new Error("deploySrcReceipt is null");
  }
  if (deploySrcReceipt.logs === null) {
    console.log("deploySrcReceipt.logs is null");
    throw new Error("deploySrcReceipt.logs is null");
  }
  console.log("deploySrcReceipt.root:", deploySrcReceipt.root);
  console.log("deploySrcReceipt.logs:", deploySrcReceipt.logs);
  for (const log of deploySrcReceipt.logs) {
    let count = 1;
    try {
      const parsedLog = escrowFactory.interface.parseLog(log);
      console.log("Log Revision:", count);
      console.log("parsedLog:", parsedLog);
      console.log("parsedLog.name:", parsedLog?.name);
      count++;
      if (parsedLog && parsedLog.name === "SrcEscrowCreated") {
        srcImmutablesFromEvent = parsedLog.args.srcImmutables;
        dstImmutablesComplementFromEvent = parsedLog.args.dstImmutablesComplement;
        break;
      }
    } catch (e) {
      console.log(`Error: ${e}`);
    }
  }

  if (!srcImmutablesFromEvent && !dstImmutablesComplementFromEvent)
    throw new Error("Could not find SrcEscrowCreated event");

  console.log("✅ SrcEscrowCreated event found and parsed.");
  console.log("srcImmutablesFromEvent:", srcImmutablesFromEvent);
  console.log("dstImmutablesComplementFromEvent:", dstImmutablesComplementFromEvent);

  const srcImmutables = Immutables.decode(srcImmutablesFromEvent);
  console.log(">>> Building DstImmutablesComplement...");
  console.log("dstImmutablesComplementFromEvent:", dstImmutablesComplementFromEvent);
  console.log("dstImmutablesComplementFromEvent.maker:", dstImmutablesComplementFromEvent.maker);
  console.log("dstImmutablesComplementFromEvent.amount:", dstImmutablesComplementFromEvent.amount);
  console.log("dstImmutablesComplementFromEvent.token:", dstImmutablesComplementFromEvent.token);
  console.log("dstImmutablesComplementFromEvent.safetyDeposit:", dstImmutablesComplementFromEvent.safetyDeposit);
  const dstComplement = DstImmutablesComplement.new({
    maker: new Address(dstImmutablesComplementFromEvent.maker),
    amount: dstImmutablesComplementFromEvent.amount,
    token: new Address(dstImmutablesComplementFromEvent.token),
    safetyDeposit: dstImmutablesComplementFromEvent.safetyDeposit,
  });
  console.log("dstComplement:", dstComplement);
  const dstImmutables = srcImmutables.withComplement(dstComplement).withTaker(new Address(TAKER_EVM_ADDRESS));
  console.log("dstImmutables:", dstImmutables);

  console.log(">>> Building deployDst transaction with Resolver helper...");
  const deployDstTxRequest = resolverHelper.deployDst(dstImmutables);
  console.log("deployDstTxRequest:", deployDstTxRequest);

  console.log(">>> Sending raw deployDst transaction with Maker/Owner wallet...");
  const deployDstTx = await makerWallet.sendTransaction(deployDstTxRequest);
  console.log("deployDstTx:", deployDstTx);
  const deployDstReceipt = await deployDstTx.wait();

  if (deployDstReceipt === null || deployDstReceipt.status === 0) {
    console.log("deployDst transaction failed to get a receipt");
    throw new Error("deployDst transaction reverted");
  } else if (deployDstReceipt !== null) {
    console.log("✅ deployDst transaction confirmed. Block:", deployDstReceipt.blockNumber);
  }
  console.log("deployDstReceipt:", deployDstReceipt);
  // --- 5. Claim Escrow ---
  console.log("\n--- [STEP 5] CLAIMING ESCROW ---");
  let dstEscrowAddress: string | null = null;
  for (const log of deployDstReceipt.logs) {
    try {
      const parsedLog = escrowFactory.interface.parseLog(log);
      if (parsedLog && parsedLog.name === "DstEscrowCreated") {
        dstEscrowAddress = parsedLog.args.escrow;
        break;
      }
    } catch (e) {
      console.log(`Error: ${e}`);
    }
  }
  if (!dstEscrowAddress) {
    console.log("Could not find DstEscrowCreated event");
    throw new Error("Could not find DstEscrowCreated event");
  } else {
    console.log("✅ DstEscrowCreated event found and parsed.");
    console.log("✅ Found DstEscrow contract address:", dstEscrowAddress);
  }

  console.log(">>> Waiting for withdrawal timelock (11 seconds)...");
  await new Promise(resolve => setTimeout(resolve, 11000));
  console.log("✅ Wait finished.");

  const deployedAtTimestamp = (await provider.getBlock(deployDstReceipt.blockNumber))!.timestamp;
  const immutablesForClaim = dstImmutables.withDeployedAt(BigInt(deployedAtTimestamp));

  console.log(">>> Building withdraw transaction with Resolver helper...");
  const withdrawTxRequest = resolverHelper.withdraw("dst", new Address(dstEscrowAddress), secret, immutablesForClaim);

  console.log(">>> Sending raw withdraw transaction with Taker wallet...");
  const claimTx = await takerWallet.sendTransaction(withdrawTxRequest);
  await claimTx.wait();
  console.log("✅✅✅ EVM ESCROW CLAIMED SUCCESSFULLY! ✅✅✅");
}

main().catch(error => {
  console.error("\n🔥🔥🔥 SCRIPT FAILED 🔥🔥🔥");
  console.error(error);
  process.exitCode = 1;
});
