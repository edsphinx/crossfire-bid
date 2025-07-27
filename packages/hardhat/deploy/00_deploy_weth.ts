import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploys the "WETH9" contract using the deployer account.
 * This contract does not require any constructor arguments.
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployWETH9: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const networkName = hre.network.name;

  console.log("Deploying contracts with account:", deployer);
  console.log("Current network:", networkName);

  console.log("Initiating 'WETH9' contract deployment...");
  await deploy("WETH9", {
    from: deployer,
    // The WETH9 contract does not have any constructor arguments, so the args array is empty.
    args: [],
    log: true, // Prints deployment information to the console
    autoMine: true,
  });

  console.log("✅ 'WETH9' contract deployed.");

  const weth9Contract = await hre.ethers.getContract("WETH9", deployer);
  console.log("Deployed WETH9 contract address:", await weth9Contract.getAddress());
};
export default deployWETH9;
deployWETH9.tags = ["WETH9"];
