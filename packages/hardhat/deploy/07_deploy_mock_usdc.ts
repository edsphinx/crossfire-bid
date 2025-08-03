import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const deployMockTokens: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const networkName = hre.network.name;

  console.log("Deploying mock tokens with account:", deployer);
  console.log("Current network:", networkName);

  console.log("Initiating 'MockUSDC' contract deployment...");
  const initialSupplyUSDC = ethers.parseUnits("1000000000000000000000", 6); // 1,000,000 USDC with 6 decimals
  await deploy("MockUSDC", {
    from: deployer,
    args: [initialSupplyUSDC], // Initial supply for MockUSDC
    log: true,
    autoMine: true,
  });
  const mockUSDC = await hre.ethers.getContract("MockUSDC", deployer);
  const usdcAddress = await mockUSDC.getAddress();
  console.log("✅ 'MockUSDC' contract deployed to:", usdcAddress);
};

export default deployMockTokens;
deployMockTokens.tags = ["MockUSDC"];
