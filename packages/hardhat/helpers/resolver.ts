import { Interface, Signature, TransactionRequest } from "ethers";
// import Sdk from "@1inch/cross-chain-sdk";
import * as Sdk from "@1inch/cross-chain-sdk";
import Contract from "../artifacts/contracts/resolver/Resolver.sol/Resolver.json";

function useSdk(): void {
  // Check if both Sdk and its Address property are valid objects
  if (Sdk && Sdk.Address) {
    console.log("Sdk and Sdk.Address are valid objects. Ready to use!");
    // You can safely use Sdk.Address here
    // const myAddress = new Sdk.Address("0x...");
  } else {
    // If they are not valid, log an error message
    console.log("ERROR: Sdk or its Address property could not be loaded correctly.");
    console.log(`Status of Sdk: ${Sdk}`);
    console.log(`Status of Sdk.Address: ${Sdk?.Address}`); // Use optional chaining to prevent errors
  }
}
export class Resolver {
  private readonly iface = new Interface(Contract.abi);

  constructor(
    public readonly srcAddress: string,
    public readonly dstAddress: string,
  ) {}

  public deploySrc(
    chainId: number,
    order: Sdk.CrossChainOrder,
    signature: string,
    takerTraits: Sdk.TakerTraits,
    amount: bigint,
    hashLock = order.escrowExtension.hashLockInfo,
  ): TransactionRequest {
    console.log(`srcAddress: ${this.srcAddress}`);
    console.log(`dstAddress: ${this.dstAddress}`);
    if (!this.srcAddress || !this.dstAddress) {
      throw new Error("srcAddress or dstAddress not set");
    }
    let _address: Sdk.Address;
    try {
      console.log("Revision de imports de Sdk");
      useSdk();
      console.log(`Before creation Sdk,address: ${this.srcAddress}`);
      _address = new Sdk.Address(this.srcAddress);
      console.log(`After creation Sdk.Address: ${_address}`);
    } catch (e) {
      console.log(`this.srcAddress: ${this.srcAddress}`);
      try {
        console.log(
          `Before creation Sdk.Address with hardcoded srcAddress: 0x95401dc811bb5740090279Ba06cfA8fcF6113778`,
        );
        const newAddress = new Sdk.Address("0x95401dc811bb5740090279Ba06cfA8fcF6113778");
        console.log(`After creation Sdk.Address: ${newAddress}`);
      } catch (e) {
        console.log(
          `Before creation Sdk.Address with hardcoded srcAddress: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`,
        );
        const newAddress = new Sdk.Address("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
        console.log(`After creation Sdk.Address: ${newAddress}`);
        console.log(`Error parsing Hardcoded srcAddress 0x95401dc811bb5740090279Ba06cfA8fcF6113778: ${e}`);
      }
      console.log(`Error parsing this.srcAddress: ${e}`);
      throw new Error("srcAddress not valid");
    }
    if (_address.isZero()) {
      throw new Error("srcAddress not set");
    } else if (!_address) {
      throw new Error("dstAddress not set");
    }
    console.log(`_address: ${_address}`);
    console.log(`order: ${order}`);
    console.log(`signature: ${signature}`);
    const { r, yParityAndS: vs } = Signature.from(signature);
    console.log(`r: ${r}`);
    console.log(`vs: ${vs}`);
    console.log(`amount: ${amount}`);
    console.log(`takerTraits: ${takerTraits}`);
    const { args, trait } = takerTraits.encode();
    console.log(`args: ${args}`);
    console.log(`trait: ${trait}`);
    console.log(`hashLock: ${hashLock}`);
    console.log(`chainId: ${chainId}`);
    console.log(`order.escrowExtension.srcSafetyDeposit: ${order.escrowExtension.srcSafetyDeposit}`);
    console.log(`order.escrowExtension.dstSafetyDeposit: ${order.escrowExtension.dstSafetyDeposit}`);
    const immutables = order.toSrcImmutables(chainId, _address, amount, hashLock);

    return {
      to: this.srcAddress,
      data: this.iface.encodeFunctionData("deploySrc", [immutables.build(), order.build(), r, vs, amount, trait, args]),
      value: order.escrowExtension.srcSafetyDeposit,
    };
  }

  public deployDst(
    /**
     * Immutables from SrcEscrowCreated event with complement applied
     */
    immutables: Sdk.Immutables,
  ): TransactionRequest {
    return {
      to: this.dstAddress,
      data: this.iface.encodeFunctionData("deployDst", [
        immutables.build(),
        immutables.timeLocks.toSrcTimeLocks().privateCancellation,
      ]),
      value: immutables.safetyDeposit,
    };
  }

  public withdraw(
    side: "src" | "dst",
    escrow: Sdk.Address,
    secret: string,
    immutables: Sdk.Immutables,
  ): TransactionRequest {
    return {
      to: side === "src" ? this.srcAddress : this.dstAddress,
      data: this.iface.encodeFunctionData("withdraw", [escrow.toString(), secret, immutables.build()]),
    };
  }

  public cancel(side: "src" | "dst", escrow: Sdk.Address, immutables: Sdk.Immutables): TransactionRequest {
    return {
      to: side === "src" ? this.srcAddress : this.dstAddress,
      data: this.iface.encodeFunctionData("cancel", [escrow.toString(), immutables.build()]),
    };
  }
}
