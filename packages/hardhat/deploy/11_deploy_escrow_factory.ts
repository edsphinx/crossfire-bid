import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// --- Network-specific Contract Addresses ---
// Define a configuration object for different networks.
// These addresses are examples or the ones found on Sepolia.
// For local networks, they will be dynamically fetched.
const networkConfig: {
  [key: string]: {
    limitOrderProtocolAddress?: string;
    feeTokenAddress?: string;
    accessTokenAddress?: string;
    ownerAddress?: string; // On public networks, the owner could be a predefined address.
  };
} = {
  sepolia: {
    // These are the addresses found in the Sepolia deployment
    limitOrderProtocolAddress: "0x0b9aD27E24A17e9cFE5eDD2455238612189F0A48",
    feeTokenAddress: "0x9d42A3E42eb5CC7D47DeE5f74E15f48f31A9a691", // Sepolia-specific fee token
    accessTokenAddress: "0x9d42A3E42eb5CC7D47DeE5f74E15f48f31A9a691", // Sepolia-specific access token
    ownerAddress: "0x622DfAaf7443aA6fE0b6b106D3a68CAD0754b749", // Sepolia-specific owner
  },
  localhost: {
    // For localhost, addresses will be dynamically fetched.
    // If you need a fixed owner different from the deployer, specify it here.
  },
  hardhat: {
    // For Hardhat network, addresses will be dynamically fetched.
  },
};

/**
 * Deploys the "EscrowFactory" contract using the deployer account and
 * the appropriate constructor arguments for the network.
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployEscrowFactory: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network } = hre;
  const { deploy, log, get } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();
  const networkName = network.name;

  const isLocalNetwork = networkName === "hardhat" || networkName === "localhost";

  log(`\n--- Deploying EscrowFactory on network: ${networkName} ---`);
  log("Deployer account:", deployer);

  // Constructor arguments
  let limitOrderProtocolAddress: string;
  let feeTokenAddress: string;
  let accessTokenAddress: string;
  let ownerAddress: string;

  // Fixed values for rescueDelaySrc and rescueDelayDst
  const rescueDelaySrc = 691200; // 8 days in seconds
  const rescueDelayDst = 691200; // 8 days in seconds

  const currentNetworkConfig = networkConfig[networkName];

  if (isLocalNetwork) {
    log("Running on a local network. Dynamically fetching deployed contract addresses...");

    try {
      // Attempt to get the LimitOrderProtocol address
      const limitOrderProtocolDeployment = await get("LimitOrderProtocol");
      limitOrderProtocolAddress = limitOrderProtocolDeployment.address;
      log(`LimitOrderProtocol address fetched: ${limitOrderProtocolAddress}`);
    } catch (error) {
      throw new Error(
        `'LimitOrderProtocol' contract not found on ${networkName}. Please ensure it's deployed first. Error: ${error}`,
      );
    }

    try {
      // Attempt to get the WETH9 address (used as feeToken and accessToken)
      // We assume WETH9 is the ERC20 token you want to use for both.
      const wethDeployment = await get("WETH9"); // Assuming WETH9 is deployed with the name "WETH9"
      feeTokenAddress = wethDeployment.address;
      accessTokenAddress = wethDeployment.address;
      log(`WETH9 address (used for feeToken/accessToken) fetched: ${feeTokenAddress}`);
    } catch (error) {
      throw new Error(
        `'WETH9' contract not found on ${networkName}. Please ensure it's deployed first. Error: ${error}`,
      );
    }

    // On local networks, the owner is usually the deployer account
    ownerAddress = deployer;
    log(`Owner on local network: ${ownerAddress}`);
  } else {
    log("Running on a public network. Using predefined contract addresses...");

    if (!currentNetworkConfig) {
      throw new Error(
        `Configuration not found for network: ${networkName}. Please add it to the 'networkConfig' object.`,
      );
    }

    // Use hardcoded addresses for public networks
    if (!currentNetworkConfig.limitOrderProtocolAddress) {
      throw new Error(`limitOrderProtocolAddress not defined for ${networkName} in networkConfig.`);
    }
    limitOrderProtocolAddress = currentNetworkConfig.limitOrderProtocolAddress;

    if (!currentNetworkConfig.feeTokenAddress) {
      throw new Error(`feeTokenAddress not defined for ${networkName} in networkConfig.`);
    }
    feeTokenAddress = currentNetworkConfig.feeTokenAddress;

    if (!currentNetworkConfig.accessTokenAddress) {
      throw new Error(`accessTokenAddress not defined for ${networkName} in networkConfig.`);
    }
    accessTokenAddress = currentNetworkConfig.accessTokenAddress;

    // If no owner is specified in the network config, use the deployer
    ownerAddress = currentNetworkConfig.ownerAddress || deployer;

    log(`LimitOrderProtocol (public): ${limitOrderProtocolAddress}`);
    log(`Fee Token (public): ${feeTokenAddress}`);
    log(`Access Token (public): ${accessTokenAddress}`);
    log(`Owner (public): ${ownerAddress}`);
  }

  log("\nInitiating 'EscrowFactory' deployment...");
  await deploy("EscrowFactory", {
    from: deployer,
    args: [
      limitOrderProtocolAddress,
      feeTokenAddress,
      accessTokenAddress,
      ownerAddress,
      rescueDelaySrc,
      rescueDelayDst,
    ],
    log: true, // Show deployment logs
    autoMine: true, // Auto-mine transactions on development networks
  });

  log("\n✅ 'EscrowFactory' contract deployed successfully.");
};

export default deployEscrowFactory;
deployEscrowFactory.tags = ["EscrowFactory"];
deployEscrowFactory.dependencies = ["LimitOrderProtocol", "WETH9"]; // Ensures these are deployed first if local
