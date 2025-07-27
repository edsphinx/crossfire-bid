import { NextRequest, NextResponse } from "next/server";
import dbConnect from "~~/app/lib/db/connect";
import CrossChainHtlcSwap, { ISwapEvent, SwapStatus } from "~~/app/lib/db/models/CrossChainHtlcSwap";

interface RouteContext {
  params: {
    uuid: string;
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  await dbConnect();

  try {
    const { uuid } = context.params;
    const swap = await CrossChainHtlcSwap.findOne({ uuid });
    if (!swap) {
      return NextResponse.json({ success: false, message: "Swap not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: swap }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching swap by UUID:", error);
    return NextResponse.json({ success: false, message: error.message || "Error fetching swap" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  await dbConnect();

  try {
    const { uuid } = context.params;
    const body = await request.json();
    const updates: any = {};
    const newEvent: ISwapEvent = {
      timestamp: new Date(),
      status: body.status as SwapStatus,
      details: {},
    };

    // Update main fields
    if (body.status) {
      updates.status = body.status;
      newEvent.status = body.status;
    }
    if (body.secret) {
      updates.secret = body.secret;
      newEvent.details.secretRevealed = true; // Add detail to event
    }
    if (body.evmTxHash) {
      updates.evmTxHash = body.evmTxHash;
      newEvent.txHash = body.evmTxHash;
      newEvent.chainType = "EVM";
      newEvent.details.txType = "EVM_ORDER_CREATION"; // More specific event detail
    }
    if (body.nonEVMTxHash) {
      updates.nonEVMTxHash = body.nonEVMTxHash;
      newEvent.txHash = body.nonEVMTxHash;
      newEvent.chainType = body.nonEVMChainType; // Use the actual chain type
      newEvent.details.txType = "NON_EVM_HTLC_CREATION";
    }
    // ... handle other updates and add details to newEvent ...
    if (body.errorMessage) {
      updates.errorMessage = body.errorMessage;
      newEvent.errorMessage = body.errorMessage;
      newEvent.status = "FAILED"; // If an error occurs, set status to FAILED in history
    }

    const updatedSwap = await CrossChainHtlcSwap.findOneAndUpdate(
      { uuid },
      {
        $set: updates, // Update top-level fields
        $push: { history: newEvent }, // Add a new event to the history array
      },
      { new: true, runValidators: true },
    );

    if (!updatedSwap) {
      return NextResponse.json({ success: false, message: "Swap not found for update" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updatedSwap }, { status: 200 });
  } catch (error: any) {
    console.error("Error updating swap:", error);
    return NextResponse.json({ success: false, message: error.message || "Error updating swap" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  await dbConnect();

  try {
    const { uuid } = context.params;
    const deletedSwap = await CrossChainHtlcSwap.findOneAndDelete({ uuid });

    if (!deletedSwap) {
      return NextResponse.json({ success: false, message: "Swap not found for deletion" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Swap deleted successfully" }, { status: 200 });
  } catch (error: any) {
    console.error("Error deleting swap:", error);
    return NextResponse.json({ success: false, message: error.message || "Error deleting swap" }, { status: 400 });
  }
}
