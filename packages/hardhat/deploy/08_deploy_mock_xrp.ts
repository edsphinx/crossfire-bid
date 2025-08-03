import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const deployMockTokens: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const networkName = hre.network.name;

  console.log("Deploying mock tokens with account:", deployer);
  console.log("Current network:", networkName);

  console.log("Initiating 'MockXRP' contract deployment...");
  const initialSupplyXRP = ethers.parseUnits("1000000000000000000000", 6); // 1,000,000 XRP with 6 decimals
  await deploy("MockXRP", {
    from: deployer,
    args: [initialSupplyXRP], // Initial supply for MockXRP
    log: true,
    autoMine: true,
  });
  const mockXRP = await hre.ethers.getContract("MockXRP", deployer);
  const xrpAddress = await mockXRP.getAddress();
  console.log("✅ 'MockXRP' contract deployed to:", xrpAddress);
};

export default deployMockTokens;
deployMockTokens.tags = ["MockXRP"];
