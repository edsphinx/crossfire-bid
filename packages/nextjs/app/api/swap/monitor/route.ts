// app/api/swap/monitor/route.ts
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "~~/app/lib/db/connect";
import CrossChainHtlcSwap from "~~/app/lib/db/models/CrossChainHtlcSwap";

const calculateTimeRemaining = (timestamp: number) => {
  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  const remainingSeconds = Math.max(0, timestamp - now);

  if (remainingSeconds === 0) {
    return "0s";
  }

  const days = Math.floor(remainingSeconds / (3600 * 24));
  const hours = Math.floor((remainingSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  let timeString = "";
  if (days > 0) timeString += `${days}d `;
  if (hours > 0) timeString += `${hours}h `;
  if (minutes > 0) timeString += `${minutes}m `;
  if (seconds > 0 && days === 0 && hours === 0) timeString += `${seconds}s`;
  if (timeString === "") return "Expired";

  return timeString.trim();
};

const processingData = (rawSwaps: any[]) => {
  return rawSwaps.map((swap: any) => {
    // Determine EVM status
    const evmCreated = swap.history.find((h: any) => h.status === "EVM_ORDER_CREATED");
    const evmClaimed = swap.history.find((h: any) => h.status === "EVM_CLAIMED");
    const evmRefunded = swap.history.find((h: any) => h.status === "EVM_REFUNDED");
    const evmFailed = swap.history.find((h: any) => h.status === "EVM_FAILED"); // Añadir estado de fallo EVM

    let evmStatus = "Pending EVM Escrow Creation";
    if (evmCreated) evmStatus = "EVM Escrow Created";
    if (evmClaimed) evmStatus = "EVM Claimed";
    if (evmRefunded) evmStatus = "EVM Refunded";
    if (evmFailed) evmStatus = "EVM Failed"; // Actualizar si hay fallo

    // Determine Non-EVM (XRPL) status
    const nonEvmLocked = swap.history.find((h: any) => h.status === "NON_EVM_ESCROW_LOCKED");
    const nonEvmClaimed = swap.history.find((h: any) => h.status === "NON_EVM_ESCROW_RELEASED"); // Estado de liberación
    const nonEvmFailed = swap.history.find((h: any) => h.status === "NON_EVM_FAILED"); // Añadir estado de fallo XRPL

    let nonEVMStatus = "Pending XRPL Escrow Creation";
    if (nonEvmLocked) nonEVMStatus = "XRPL Escrow Locked";
    if (nonEvmClaimed) nonEVMStatus = "XRPL Claimed";
    if (nonEvmFailed) nonEVMStatus = "XRPL Failed"; // Actualizar si hay fallo

    // Calculate overall status
    let overallStatus = "Unknown";
    if (evmClaimed && nonEvmClaimed) {
      overallStatus = "Completed Successfully";
    } else if (evmRefunded || nonEvmFailed) {
      // Si EVM se reembolsa o XRPL falla
      overallStatus = "Refunded / Failed";
    } else if (evmCreated && nonEvmLocked) {
      overallStatus = "Active Swap";
    } else if (evmCreated && !nonEvmLocked) {
      overallStatus = "Awaiting XRPL Escrow";
    } else if (!evmCreated && !nonEvmLocked) {
      overallStatus = "Initiation Pending";
    } else if (nonEvmLocked && !evmClaimed && !evmRefunded) {
      overallStatus = "Awaiting EVM Claim";
    } else if (evmFailed) {
      overallStatus = "EVM Initiation Failed";
    }

    // Calculate timelocks and remaining times
    // takerCanClaimUntil (FinishAfter for Taker) -> uses evmPublicWithdrawTimelock
    // makerCanCancelAt (CancelAfter for Maker) -> uses evmCancellationTimelock
    const takerCanClaimUntilTimestamp = swap.evmPublicWithdrawTimelock;
    const makerCanCancelAtTimestamp = swap.evmCancellationTimelock;

    const evmTimeRemaining = calculateTimeRemaining(takerCanClaimUntilTimestamp); // Tiempo hasta que el Taker pueda reclamar
    const nonEVMTimeRemaining = calculateTimeRemaining(makerCanCancelAtTimestamp); // Tiempo hasta que el Maker pueda cancelar (para XRPL, si es el caso)

    // Convert timestamps to ISO strings for frontend Date object creation
    const takerCanClaimUntilISO = takerCanClaimUntilTimestamp
      ? new Date(takerCanClaimUntilTimestamp * 1000).toISOString()
      : null;
    const makerCanCancelAtISO = makerCanCancelAtTimestamp
      ? new Date(makerCanCancelAtTimestamp * 1000).toISOString()
      : null;

    return {
      ...swap,
      evmStatus,
      nonEVMStatus,
      overallStatus,
      evmTimeRemaining,
      nonEVMTimeRemaining,
      takerCanClaimUntil: takerCanClaimUntilISO,
      makerCanCancelAt: makerCanCancelAtISO,
    };
  });
};

export async function GET(request: NextRequest) {
  await dbConnect();
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const swaps = await CrossChainHtlcSwap.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit);

    const totalSwaps = await CrossChainHtlcSwap.countDocuments();

    // --- LLAMAR A processingData AQUÍ ---
    const processedSwaps = processingData(swaps);

    return NextResponse.json(
      {
        success: true,
        data: processedSwaps, // Enviar los swaps procesados
        pagination: {
          total: totalSwaps,
          page,
          limit,
          totalPages: Math.ceil(totalSwaps / limit),
        },
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error fetching swaps:", error);
    return NextResponse.json({ success: false, message: error.message || "Error fetching swaps" }, { status: 400 });
  }
}
