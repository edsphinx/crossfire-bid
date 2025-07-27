# 🏗 Scaffold-ETH 2: Cross-Chain HTLC Swaps for Volatility-Triggered Auctions

<h4 align="center">
  <a href="https://docs.scaffoldeth.io">Scaffold-ETH 2 Documentation</a> |
  <a href="https://scaffoldeth.io">Scaffold-ETH 2 Website</a>
</h4>

---

## 🚀 Project Vision: Volatility-Triggered Cross-Chain Dutch Auctions with 1inch Fusion+

This project aims to build a **cross-chain Dutch auction system triggered by market volatility conditions**, leveraging 1inch Fusion+ as the execution engine.

The system will automatically detect high market volatility and initiate a Dutch Auction to swap assets between Ethereum (EVM-compatible chains) and another blockchain (e.g., ICP or Starknet), utilizing the powerful 1inch Fusion+ infrastructure.

This is a modular system, with distinct components being developed and integrated incrementally.

---

### ✅ Technical Requirements & Integrations (ETHGlobal & 1inch confirmed):

- **Integration with 1inch Fusion+**: Core to the swap execution.
- **Dutch Auction Mechanics**: Central to the asset exchange model.
- **Cross-chain Swaps**: Ethereum (EVM) ↔ Non-EVM chains (e.g., ICP).
- **Hashlock/Timelock Preservation**: Essential for secure atomic swaps.
- **Demonstrable On-chain Execution**: Proof of functionality.
- **Public, Modular, and Documented Code**: Adhering to best practices.

---

### 🧠 Current Focus: Core Cross-Chain HTLC Swap Flow

Our immediate priority is to establish a **fully functional, basic cross-chain swap flow using Escrows and Hash Time-Locked Contracts (HTLCs)** between EVM and non-EVM chains. This forms the foundational layer before introducing more complex mechanisms like Dutch auctions or automated triggers.

**Immediate Objectives (This Morning/Early Afternoon):**

- Implement and validate a basic cross-chain swap transaction flow:
  - Initiate an order on an EVM chain.
  - Lock funds via an escrow with an HTLC condition on a non-EVM chain (e.g., XRPL).
  - Successfully claim funds on the non-EVM chain upon condition fulfillment.
  - **Next step for this flow:** Implement the EVM-side claim mechanism.

**Today's Goals (This Afternoon):**

- **Integrate Volatility Detection**: Build a simple volatility detection mechanism.
- **Trigger Basic Swap**: Connect the volatility detection to automatically launch the established basic cross-chain HTLC swap flow.

**Upcoming Goals:**

- Transition the basic swap functionality to utilize **Dutch Auction** mechanics.
- Further refine and modularize the `trigger-engine` for advanced automation and integration.

**Considerations:**

- We are primarily using testnets with Fusion+ support (e.g., Base Sepolia, Arbitrum Sepolia) for EVM-side development.
- The system is being built modularly to allow for autonomous testing of each component.

---

## 🛠️ Development Environment: Scaffold-ETH 2 with Local 1inch Contracts

This project is built upon **Scaffold-ETH 2**, an open-source, up-to-date toolkit for building decentralized applications (dapps) on the Ethereum blockchain. It's designed to make it easier for developers to create and deploy smart contracts and build user interfaces that interact with those contracts.

To ensure a complete and controlled testing environment, we have integrated key 1inch smart contracts locally:

- **`contracts/1inch/cross-chain-swap`**: Contains the 1inch Cross-Chain Swap (Escrow Factory) contracts for managing atomic swaps.
- **`contracts/1inch/limit-order-protocol`**: Includes the 1inch Limit Order Protocol v5 contracts for creating and managing orders.
- **`contracts/1inch/limit-order-settlement`**: Contains related settlement contracts like FeeBank.

These locally available contracts enable full control over deployments on local development networks and public testnets, which is crucial for iterative testing during the hackathon.

---

### ⚙️ Scaffold-ETH 2 Features:

- ✅ **Contract Hot Reload**: Your frontend auto-adapts to your smart contract as you edit it.
- 🪝 **[Custom hooks](https://docs.scaffoldeth.io/hooks/)**: Collection of React hooks wrapper around [wagmi](https://wagmi.sh/) to simplify interactions with smart contracts with typescript autocompletion.
- 🧱 [**Components**](https://docs.scaffoldeth.io/components/): Collection of common web3 components to quickly build your frontend.
- 🔥 **Burner Wallet & Local Faucet**: Quickly test your application with a burner wallet and local faucet.
- 🔐 **Integration with Wallet Providers**: Connect to different wallet providers and interact with the Ethereum network.

![Debug Contracts tab](https://github.com/scaffold-eth/scaffold-eth-2/assets/55535804/b237af0c-5027-4849-a5c1-2e31495cccb1)

---

## Requirements

Before you begin, you need to install the following tools:

- [Node (>= v20.18.3)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

---

## Quickstart

To get started with Scaffold-ETH 2, follow the steps below:

1.  Install dependencies if it was skipped in CLI:

    ```bash
    cd my-dapp-example # Or your project root
    yarn install
    ```

2.  Run a local network in the first terminal:

    ```bash
    yarn chain
    ```

    This command starts a local Ethereum network using Hardhat. The network runs on your local machine and can be used for testing and development. You can customize the network configuration in `packages/hardhat/hardhat.config.ts`.

3.  On a second terminal, deploy your contracts (including the 1inch protocols if configured in deploy scripts):

    ```bash
    yarn deploy
    ```

    This command deploys smart contracts to the local network. The `yarn deploy` command uses the deploy scripts located in `packages/hardhat/deploy`. You can customize these scripts to deploy the 1inch contracts for your local testing environment.

4.  On a third terminal, start your NextJS app:

    ```bash
    yarn start
    ```

    Visit your app on: `http://localhost:3000`. You can interact with your smart contract using the `Debug Contracts` page. You can tweak the app config in `packages/nextjs/scaffold.config.ts`.

Run smart contract tests with `yarn hardhat:test`

- Edit your smart contracts in `packages/hardhat/contracts`
- Edit your frontend homepage at `packages/nextjs/app/page.tsx`. For guidance on [routing](https://nextjs.org/docs/app/app/building-your-application/routing/defining-routes) and configuring [pages/layouts](https://nextjs.org/app/building-your-application/routing/pages-and-layouts) checkout the Next.js documentation.
- Edit your deployment scripts in `packages/hardhat/deploy`

---

## Documentation

Visit our [docs](https://docs.scaffoldeth.io) to learn how to start building with Scaffold-ETH 2.

To know more about its features, check out our [website](https://scaffoldeth.io).

---

## Contributing to Scaffold-ETH 2

We welcome contributions to Scaffold-ETH 2!

Please see [CONTRIBUTING.MD](https://github.com/scaffold-eth/scaffold-eth-2/blob/main/CONTRIBUTING.md) for more information and guidelines for contributing to Scaffold-ETH 2.
