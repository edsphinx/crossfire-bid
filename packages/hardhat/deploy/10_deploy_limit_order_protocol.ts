import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// --- Network-specific Contract Addresses ---
// Define a configuration object for different networks.
const networkConfig: {
  [key: string]: { wethAddress: string };
} = {
  sepolia: {
    wethAddress: "0x9d42A3E42eb5CC7D47DeE5f74E15f48f31A9a691", // Sepolia WETH address
  },
  localhost: {
    wethAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH address for local testing (often Mainnet WETH on Hardhat fork)
  },
  hardhat: {
    wethAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH address for Hardhat network
  },
  mainnet: {
    wethAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Mainnet WETH address
  },
};

/**
 * Deploys the "LimitOrderProtocol" contract using the deployer account and
 * the appropriate constructor arguments.
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployLimitOrderProtocol: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network } = hre;
  const { deploy, log, get } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();
  const networkName = network.name;

  const isLocalNetwork = networkName === "hardhat" || networkName === "localhost";

  console.log("Deploying contracts with account:", deployer);

  // Deploy params
  let wethAddress;

  const currentNetworkConfig = networkConfig[networkName];

  if (isLocalNetwork) {
    log("Running on a local network. Fetching dynamically deployed contract addresses...");

    try {
      const wethDeployment = await get("WETH9"); // Assuming WETH9 is deployed with the name "WETH9"
      wethAddress = wethDeployment.address;
      log(`Fetched WETH9 address: ${wethAddress}`);
    } catch (error) {
      throw new Error(`WETH9 contract not found on ${networkName}. Please ensure it's deployed first. Error: ${error}`);
    }
  } else {
    log("Running on a public network. Using hardcoded contract addresses...");

    if (!currentNetworkConfig) {
      throw new Error(
        `Configuration not found for network: ${networkName}. Please add it to the 'networkConfig' object in the deploy script.`,
      );
    }

    wethAddress = currentNetworkConfig.wethAddress;
  }

  console.log("Initiating 'LimitOrderProtocol' deployment with correct Sepolia addresses...");
  await deploy("LimitOrderProtocol", {
    from: deployer,
    args: [wethAddress],
    log: true,
    autoMine: true,
  });

  console.log("✅ 'LimitOrderProtocol' contract deployed.");
};

export default deployLimitOrderProtocol;
deployLimitOrderProtocol.tags = ["LimitOrderProtocol"];
deployLimitOrderProtocol.dependencies = ["WETH9"];
