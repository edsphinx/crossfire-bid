import { ethers } from "ethers";

/**
 * Checks and logs the ETH and ERC20 balances for a given wallet.
 * @param provider The ethers provider instance.
 * @param walletAddress The address to check.
 * @param tokenContracts An array of ERC20 contract instances to check balances for.
 */
async function checkBalances(
  provider: ethers.JsonRpcProvider,
  walletAddress: string,
  tokenContracts: ethers.Contract[],
): Promise<void> {
  console.log(`\n--- [BALANCE CHECK] Balances for ${walletAddress} ---`);

  // Check ERC20 token balances
  for (const tokenContract of tokenContracts) {
    try {
      const symbol = await tokenContract.symbol();
      const decimals = await tokenContract.decimals();
      const balanceWei = await tokenContract.balanceOf(walletAddress);
      const balance = ethers.formatUnits(balanceWei, decimals);
      console.log(`✅ ${symbol}: ${balance}`);
    } catch (error) {
      console.error(`❌ Failed to get balance for token at ${tokenContract.target}: ${error}`);
    }
  }

  console.log("------------------------------------------");
}

export { checkBalances };
