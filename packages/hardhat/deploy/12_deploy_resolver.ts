import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployResolver: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log, get } = hre.deployments;
  const networkName = hre.network.name;
  console.log(`--- [DEPLOYMENT] Starting Resolver deployment for network: ${networkName} ---`);
  log(`Deployer account: ${deployer}`);

  let limitOrderProtocolAddress: string;
  let escrowFactoryAddress: string;

  // --- Conditional Logic for Network Configuration ---
  if (networkName === "hardhat" || networkName === "localhost") {
    // For local networks, get the addresses from previous deployments.
    log("Fetching addresses from local deployments...");
    const limitOrderProtocolDeployment = await get("LimitOrderProtocol");
    const escrowFactoryDeployment = await get("EscrowFactory");

    limitOrderProtocolAddress = limitOrderProtocolDeployment.address;
    escrowFactoryAddress = escrowFactoryDeployment.address;
  } else if (networkName === "sepolia") {
    // For Sepolia, use addresses from environment variables.
    log("Fetching addresses from environment variables for Sepolia...");
    const sepLOP = process.env.SEPOLIA_LIMIT_ORDER_PROTOCOL;
    const sepEscrowFactory = process.env.SEPOLIA_ESCROW_FACTORY;

    // Check if the addresses are provided.
    if (!sepLOP || !sepEscrowFactory) {
      throw new Error(
        "ERROR: SEPOLIA_LIMIT_ORDER_PROTOCOL and SEPOLIA_ESCROW_FACTORY environment variables must be set for Sepolia.",
      );
    }

    limitOrderProtocolAddress = sepLOP;
    escrowFactoryAddress = sepEscrowFactory;

    log(`EscrowFactory address fetched: ${sepEscrowFactory}`);
    log(`EscrowFactory address fetched: ${escrowFactoryAddress}`);
  } else {
    // Handle other networks or provide a default error.
    throw new Error(`Unsupported network: ${networkName}`);
  }
  log(`Deployer(Maker) address: ${deployer}`);
  log(`LimitOrderProtocol ${networkName} address resolved: ${limitOrderProtocolAddress}`);
  log(`EscrowFactory ${networkName} address resolved: ${escrowFactoryAddress}`);

  // --- Resolver Contract for Deployer(Maker) Deployment ---
  console.log("Initiating 'Resolver' contract for Deployer(Maker) deployment...");
  await deploy("srcResolver", {
    contract: "Resolver",
    from: deployer,
    args: [
      escrowFactoryAddress, // constructor argument: factory
      limitOrderProtocolAddress, // constructor argument: lop
    ],
    log: true, // Prints deployment information to the console
    autoMine: true, // Speeds up the deployment on local networks
  });

  console.log("✅ 'Resolver' contract for Deployer(Maker) deployed successfully.");

  const srcResolverContract = await hre.ethers.getContract("srcResolver", deployer);
  console.log("Deployed Resolver contract for Deployer(Maker) address:", await srcResolverContract.getAddress());

  // --- Resolver Contract for Taker Deployment ---
  console.log("Initiating 'Resolver' contract for Taker deployment...");
  await deploy("dstResolver", {
    contract: "Resolver",
    from: deployer,
    args: [
      escrowFactoryAddress, // constructor argument: factory
      limitOrderProtocolAddress, // constructor argument: lop
    ],
    log: true, // Prints deployment information to the console
    autoMine: true, // Speeds up the deployment on local networks
  });

  console.log("✅ 'Resolver' contract for Taker deployed successfully.");

  const dstResolverContract = await hre.ethers.getContract("dstResolver", deployer);
  console.log("Deployed Resolver contract for Taker address:", await dstResolverContract.getAddress());
};

export default deployResolver;
deployResolver.tags = ["Resolver"];
deployResolver.dependencies = ["LimitOrderProtocol", "EscrowFactory"];
