import axios from "axios";
import { main as create1inchOrder } from "./create1inchOrder"; // Import the 1inch order creation function

// --- CONFIGURATION ---
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";
const CRYPTO_PAIR = "bitcoin,ethereum"; // BTC and ETH
const CURRENCY = "usd";
const VOLATILITY_THRESHOLD = 0.05; // Example: 5% price change
const INTERVAL_MS = 60 * 1000; // Check every 1 minute (adjust as needed)

// Placeholder for storing previous prices for volatility calculation
let previousPrices: { btc: number | null; eth: number | null } = { btc: null, eth: null };

async function trigger1inchOrder(currentPriceBTC: number, currentPriceETH: number) {
  console.log(`\n--- Volatility Detected! Triggering 1inch Order ---`);
  console.log(`Current BTC Price: $${currentPriceBTC}`);
  console.log(`Current ETH Price: $${currentPriceETH}`);
  // TODO: Implement actual call to 1inch LOP order creation/update logic here.
  // You might pass relevant price data or other parameters.
  try {
    await create1inchOrder(); // Call the 1inch order creation function
    console.log("1inch order creation triggered successfully.");
  } catch (error) {
    console.error("Error triggering 1inch order:", error);
  }
}

async function checkVolatility() {
  try {
    console.log(`Checking volatility for ${CRYPTO_PAIR.toUpperCase()}...`);
    const response = await axios.get(COINGECKO_API_URL, {
      params: {
        ids: CRYPTO_PAIR,
        vs_currencies: CURRENCY,
      },
    });

    const data = response.data;
    const btcPrice = data.bitcoin ? data.bitcoin[CURRENCY] : null;
    const ethPrice = data.ethereum ? data.ethereum[CURRENCY] : null;

    if (btcPrice === null || ethPrice === null) {
      console.error("Could not fetch prices for BTC or ETH.");
      return;
    }

    console.log(`BTC: $${btcPrice}, ETH: $${ethPrice}`);

    // --- Simple Volatility Calculation (Percentage Change) ---
    if (previousPrices.btc !== null && previousPrices.eth !== null) {
      const btcChange = Math.abs((btcPrice - previousPrices.btc) / previousPrices.btc);
      const ethChange = Math.abs((ethPrice - previousPrices.eth) / previousPrices.eth);

      console.log(`BTC Change: ${btcChange.toFixed(4)} (${(btcChange * 100).toFixed(2)}%)`);
      console.log(`ETH Change: ${ethChange.toFixed(4)} (${(ethChange * 100).toFixed(2)}%)`);

      if (btcChange > VOLATILITY_THRESHOLD || ethChange > VOLATILITY_THRESHOLD) {
        await trigger1inchOrder(btcPrice, ethPrice);
      } else {
        console.log("Volatility below threshold. No action taken.");
      }
    } else {
      console.log("Initial price fetch. No volatility calculation yet.");
    }

    // Update previous prices for the next check
    previousPrices = { btc: btcPrice, eth: ethPrice };
  } catch (error: any) {
    console.error("Error checking volatility:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
    }
  }
}

// Run the check periodically
setInterval(checkVolatility, INTERVAL_MS);

console.log(`Volatility monitor started. Checking every ${INTERVAL_MS / 1000} seconds.`);
console.log(`Threshold: ${VOLATILITY_THRESHOLD * 100}% price change for BTC or ETH.`);
checkVolatility(); // Run immediately on start
