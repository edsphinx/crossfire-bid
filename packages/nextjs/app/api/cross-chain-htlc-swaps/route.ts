import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import dbConnect from "~~/app/lib/db/connect";
import CrossChainHtlcSwap, { ChainType, ISwapEvent, SwapStatus } from "~~/app/lib/db/models/CrossChainHtlcSwap";

export async function POST(request: NextRequest) {
  await dbConnect();

  try {
    const body = await request.json();
    const {
      status, // Should be 'INITIATED' or similar for a POST
      makerEVMAddress,
      takerEVMAddress,
      makerNonEVMAddress,
      takerNonEVMAddress,
      makerEVMTokenAddress,
      amountEVM,
      amountNonEVM,
      secretHash,
      secret, // Remember security!
      evmChainId,
      nonEVMChainType,
      nonEVMDetails,
      evmTxHash,
      nonEVMTxHash,
      evmClaimTxHash,
      nonEVMClaimTxHash,
      nonEVMSequence,
      evmTimelock,
      evmPublicWithdrawTimelock,
      nonEVMTimelock,
      creationTime,
      safetyDepositAmount, // Added
      errorMessage,
    } = body;

    const newUuid = uuidv4();
    const determinedStatus: SwapStatus = (status as SwapStatus) || "INITIATED";

    // Create the initial history event for the swap creation
    const initialEvent: ISwapEvent = {
      timestamp: new Date(),
      status: determinedStatus,
      details: {
        // Initialize details as an empty object here
        message: "Swap initiated and record created.",
        // We might add initial transaction details here if available from the client
        // e.g., if a transaction was sent on the client side to initiate.
        // For now, let's assume txHash magically is added later in a PUT if I dont forget.
      },
      // Maybe can optionally add txHash, chainType here if the "INITIATED" step involves one
      // For instance, if swap creation itself is triggered by an on-chain transaction, still
      // pending to decide whether to add or the final workflow of this.
      txHash: evmTxHash || nonEVMTxHash || undefined, // Add initial txHash
      chainType: evmTxHash ? "EVM" : nonEVMTxHash ? (nonEVMChainType as ChainType) : undefined,
    };

    const newSwap = new CrossChainHtlcSwap({
      uuid: newUuid,
      status: determinedStatus, // Default to INITIATED if not provided
      makerEVMAddress,
      takerEVMAddress,
      makerNonEVMAddress,
      takerNonEVMAddress,
      makerEVMTokenAddress,
      amountEVM,
      amountNonEVM,
      secretHash,
      secret,
      evmChainId,
      nonEVMChainType,
      nonEVMDetails,
      evmTxHash,
      nonEVMTxHash,
      evmClaimTxHash,
      nonEVMClaimTxHash,
      nonEVMSequence,
      evmTimelock,
      evmPublicWithdrawTimelock,
      nonEVMTimelock,
      creationTime,
      safetyDepositAmount, // Added
      errorMessage,
      history: [initialEvent],
    });

    // --- CONSOLE LOG (BEFORE SAVE) ---
    console.log("--- Server Log: newSwap object BEFORE save() ---");
    console.log(JSON.stringify(newSwap.toObject(), null, 2));
    console.log("-----------------------------------------------");

    await newSwap.save();

    // --- CONSOLE LOG (AFTER SAVE) ---
    console.log("--- Server Log: newSwap object BEFORE sending response ---");
    console.log(JSON.stringify(newSwap.toObject(), null, 2));
    console.log("-------------------------------------------------------");

    return NextResponse.json({ success: true, data: newSwap }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating swap:", error);
    return NextResponse.json({ success: false, message: error.message || "Error creating swap" }, { status: 400 });
  }
}

export async function GET() {
  await dbConnect();
  try {
    const swaps = await CrossChainHtlcSwap.find({});
    return NextResponse.json({ success: true, data: swaps }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching swaps:", error);
    return NextResponse.json({ success: false, message: error.message || "Error fetching swaps" }, { status: 400 });
  }
}