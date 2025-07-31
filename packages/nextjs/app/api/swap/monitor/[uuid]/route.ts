import { NextRequest, NextResponse } from "next/server";
import dbConnect from "~~/app/lib/db/connect";
import CrossChainHtlcSwap, { ChainType } from "~~/app/lib/db/models/CrossChainHtlcSwap";
import HTLC_Monitor from "~~/app/lib/db/models/HTLC_Monitor";

interface RouteContext {
  params: Promise<{
    uuid: string;
  }>;
}

// Helper para calcular el tiempo restante
const calculateTimeRemaining = (timestamp: number | undefined) => {
  if (timestamp === undefined) return "N/A";
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
  if (seconds > 0 && days === 0 && hours === 0) timeString += `${seconds}s`; // Solo segundos si es menos de una hora
  if (timeString === "") return "Expired";

  return timeString.trim();
};

// Interfaz para la respuesta detallada del swap
interface DetailedSwapResponse {
  uuid: string;
  overallStatus: string;
  makerEVMAddress: string;
  takerEVMAddress: string;
  makerNonEVMAddress: string;
  takerNonEVMAddress: string;
  amountEVM: string;
  amountNonEVM: string;
  secretHash: string;
  secret?: string; // Solo si revelado
  evmChainId: string;
  nonEVMChainType: string;

  // Detalles específicos de EVM
  evmEscrowStatus: string;
  evmCreationTxHash?: string;
  evmClaimTxHash?: string;
  evmRefundTxHash?: string;
  evmTimelockISO?: string; // CancelAfter
  evmPublicWithdrawTimelockISO?: string; // FinishAfter
  evmTimeRemainingClaim?: string; // Tiempo restante para que el taker reclame
  evmTimeRemainingCancel?: string; // Tiempo restante para que el maker cancele
  evmEscrowOpen: boolean;

  // Detalles específicos de XRPL
  xrplEscrowStatus: string;
  xrplCreationTxHash?: string;
  xrplClaimTxHash?: string;
  xrplCancelTxHash?: string;
  xrplOfferSequence?: number;
  xrplCondition?: string;
  xrplTimelockISO?: string; // CancelAfter (si existe un timelock específico de XRPL)
  xrplTimeRemainingClaim?: string; // Tiempo restante para que el taker reclame en XRPL
  xrplTimeRemainingCancel?: string; // Tiempo restante para que el maker cancele en XRPL
  xrplEscrowOpen: boolean;

  // Historial combinado
  combinedHistory: Array<{
    timestamp: string;
    status: string;
    chainType?: ChainType; // Usar ChainType del modelo
    txHash?: string;
    details?: string;
    errorMessage?: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  await dbConnect();

  try {
    const { uuid } = await context.params; // Next.js 15: await params
    if (!uuid) {
      return NextResponse.json({ success: false, message: "UUID is required" }, { status: 400 });
    }

    // 1. Obtener el registro principal del swap
    const swap = await CrossChainHtlcSwap.findOne({ uuid });
    if (!swap) {
      return NextResponse.json({ success: false, message: "Swap not found" }, { status: 404 });
    }

    // 2. Obtener los registros del monitor para este swap
    const monitors = await HTLC_Monitor.find({ swapUuid: uuid });
    const evmMonitor = monitors.find(m => m.chainType === "EVM");
    const xrplMonitor = monitors.find(m => m.chainType === "XRPL");

    // --- Procesamiento de datos para el frontend ---
    const detailedSwap: DetailedSwapResponse = {
      uuid: swap.uuid,
      overallStatus: swap.status, // Usaremos el status general del swap como base
      makerEVMAddress: swap.makerEVMAddress,
      takerEVMAddress: swap.takerEVMAddress,
      makerNonEVMAddress: swap.makerNonEVMAddress,
      takerNonEVMAddress: swap.takerNonEVMAddress,
      amountEVM: swap.amountEVM,
      amountNonEVM: swap.amountNonEVM,
      secretHash: swap.secretHash,
      secret: swap.secret, // Se envía si está presente (revelado)
      evmChainId: swap.evmChainId,
      nonEVMChainType: swap.nonEVMChainType,

      // Inicializar estados de escrow
      evmEscrowStatus: "Pending Creation",
      evmEscrowOpen: false,
      xrplEscrowStatus: "Pending Creation",
      xrplEscrowOpen: false,

      combinedHistory: [],
    };

    // --- Procesar EVM Escrow ---
    if (evmMonitor) {
      detailedSwap.evmEscrowStatus = evmMonitor.status; // Estado del monitor
      detailedSwap.evmCreationTxHash = evmMonitor.txHash; // Hash de creación del escrow EVM

      const evmClaimedEvent = swap.history.find(h => h.status === "EVM_CLAIMED");
      const evmRefundedEvent = swap.history.find(h => h.status === "EVM_REFUNDED");
      const evmCreatedEvent = swap.history.find(h => h.status === "EVM_ORDER_CREATED");

      if (evmClaimedEvent) {
        detailedSwap.evmEscrowStatus = "Claimed";
        detailedSwap.evmClaimTxHash = evmClaimedEvent.txHash;
      } else if (evmRefundedEvent) {
        detailedSwap.evmEscrowStatus = "Refunded";
        detailedSwap.evmRefundTxHash = evmRefundedEvent.txHash;
      } else if (evmCreatedEvent) {
        detailedSwap.evmEscrowStatus = "Open";
        detailedSwap.evmEscrowOpen = true;
      } else if (evmMonitor.status === "FAILED") {
        detailedSwap.evmEscrowStatus = "Failed";
      }

      detailedSwap.evmTimelockISO = swap.evmTimelock ? new Date(swap.evmTimelock * 1000).toISOString() : undefined;
      detailedSwap.evmPublicWithdrawTimelockISO = swap.evmPublicWithdrawTimelock
        ? new Date(swap.evmPublicWithdrawTimelock * 1000).toISOString()
        : undefined;

      // Taker puede reclamar hasta (basado en evmPublicWithdrawTimelock)
      detailedSwap.evmTimeRemainingClaim = calculateTimeRemaining(swap.evmPublicWithdrawTimelock);
      // Maker puede cancelar después (basado en evmTimelock)
      detailedSwap.evmTimeRemainingCancel = calculateTimeRemaining(swap.evmTimelock);
    } else {
      detailedSwap.evmEscrowStatus = "Not Initiated";
    }

    // --- Procesar XRPL Escrow ---
    if (xrplMonitor) {
      detailedSwap.xrplEscrowStatus = xrplMonitor.status; // Estado del monitor
      detailedSwap.xrplCreationTxHash = xrplMonitor.txHash; // Hash de creación del escrow XRPL
      detailedSwap.xrplOfferSequence = swap.nonEVMSequence; // Secuencia del escrow XRPL
      detailedSwap.xrplCondition = swap.nonEVMDetails?.xrplCondition; // Condición XRPL

      const nonEvmClaimedEvent = swap.history.find(h => h.status === "NON_EVM_CLAIMED");
      const nonEvmLockedEvent = swap.history.find(h => h.status === "NON_EVM_ESCROW_LOCKED");
      const nonEvmRefundedEvent = swap.history.find(h => h.status === "NON_EVM_REFUNDED"); // Por si acaso XRPL tiene refund

      if (nonEvmClaimedEvent) {
        detailedSwap.xrplEscrowStatus = "Claimed";
        detailedSwap.xrplClaimTxHash = nonEvmClaimedEvent.txHash;
      } else if (nonEvmRefundedEvent) {
        detailedSwap.xrplEscrowStatus = "Canceled / Refunded";
        detailedSwap.xrplCancelTxHash = nonEvmRefundedEvent.txHash;
      } else if (nonEvmLockedEvent) {
        detailedSwap.xrplEscrowStatus = "Open";
        detailedSwap.xrplEscrowOpen = true;
      } else if (xrplMonitor.status === "FAILED") {
        detailedSwap.xrplEscrowStatus = "Failed";
      }

      // Los timelocks de XRPL a menudo se coordinan con EVM, pero si tienes `nonEVMTimelock`, úsalo.
      // Aquí, asumo que los tiempos de reclamo/cancelación de XRPL se basan en los timelocks de EVM
      // para la coordinación del swap cross-chain.
      detailedSwap.xrplTimeRemainingClaim = calculateTimeRemaining(swap.evmPublicWithdrawTimelock); // Taker puede reclamar
      detailedSwap.xrplTimeRemainingCancel = calculateTimeRemaining(swap.evmTimelock); // Maker puede cancelar
    } else {
      detailedSwap.xrplEscrowStatus = "Not Initiated";
    }

    // --- Combinar historial ---
    const combinedEvents: Array<{
      timestamp: Date;
      status: string;
      chainType?: ChainType;
      txHash?: string;
      details?: Record<string, any>; // Mantener como Record<string, any> para detalles
      errorMessage?: string;
    }> = [];

    // Add swap history events (ISwapEvent)
    swap.history.forEach(event => {
      combinedEvents.push({
        timestamp: event.timestamp,
        status: event.status,
        chainType: event.chainType,
        txHash: event.txHash,
        details: event.details,
        errorMessage: event.errorMessage,
      });
    });

    // Add EVM monitor history events (IMonitorEvent)
    evmMonitor?.history.forEach(event => {
      combinedEvents.push({
        timestamp: event.timestamp,
        status: event.status,
        chainType: "EVM", // ChainType viene del monitor padre
        txHash: evmMonitor.txHash, // TxHash viene del monitor padre
        details: event.details,
        errorMessage: event.errorMessage,
      });
    });

    // Add XRPL monitor history events (IMonitorEvent)
    xrplMonitor?.history.forEach(event => {
      combinedEvents.push({
        timestamp: event.timestamp,
        status: event.status,
        chainType: "XRPL", // ChainType viene del monitor padre
        txHash: xrplMonitor.txHash, // TxHash viene del monitor padre
        details: event.details,
        errorMessage: event.errorMessage,
      });
    });

    detailedSwap.combinedHistory = combinedEvents
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()) // Ordenar por fecha ascendente
      .map(event => ({
        timestamp: new Date(event.timestamp).toLocaleString(),
        status: event.status.replace(/_/g, " "),
        chainType: event.chainType,
        txHash: event.txHash,
        details: event.details?.message ? event.details.message : JSON.stringify(event.details), // Convertir detalles a string
        errorMessage: event.errorMessage,
      }));

    return NextResponse.json({ success: true, data: detailedSwap }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching swap details:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Error fetching swap details" },
      { status: 400 },
    );
  }
}
