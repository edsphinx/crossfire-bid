"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ethers } from "ethers";
// import { Toaster, toast } from "sonner";s
// Para formatear cantidades EVM
import { useInterval } from "usehooks-ts";
// Para refrescar los datos periódicamente
import { AddressInput } from "~~/components/scaffold-eth";

// Para mostrar notificaciones

// Interfaz que coincide con la respuesta del endpoint backend /api/swap/monitor/[uuid]
interface DetailedSwapData {
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

  evmEscrowStatus: string;
  evmCreationTxHash?: string;
  evmClaimTxHash?: string;
  evmRefundTxHash?: string;
  evmTimelockISO?: string; // CancelAfter (ISO string)
  evmPublicWithdrawTimelockISO?: string; // FinishAfter (ISO string)
  evmTimeRemainingClaim?: string; // Tiempo restante para que el taker reclame (formato legible)
  evmTimeRemainingCancel?: string; // Tiempo restante para que el maker cancele (formato legible)
  evmEscrowOpen: boolean; // Indica si el escrow EVM está activo/pendiente

  xrplEscrowStatus: string;
  xrplCreationTxHash?: string;
  xrplClaimTxHash?: string;
  xrplCancelTxHash?: string;
  xrplOfferSequence?: number;
  xrplCondition?: string;
  xrplTimelockISO?: string; // CancelAfter (si existe un timelock específico de XRPL, ISO string)
  xrplTimeRemainingClaim?: string; // Tiempo restante para que el taker reclame en XRPL
  xrplTimeRemainingCancel?: string; // Tiempo restante para que el maker cancele en XRPL
  xrplEscrowOpen: boolean; // Indica si el escrow XRPL está activo/pendiente

  // Historial combinado de eventos del swap y monitores
  combinedHistory: Array<{
    timestamp: string; // Fecha y hora formateada
    status: string; // Estado del evento (ej. "EVM ORDER CREATED", "PENDING")
    chainType?: string; // Tipo de cadena asociada (EVM, XRPL)
    txHash?: string; // Hash de transacción del evento
    details?: string; // Detalles adicionales del evento
    errorMessage?: string; // Mensaje de error si el evento fue un fallo
  }>;
}

const SwapDetailsPage: React.FC = () => {
  const params = useParams();
  const uuid = params.uuid as string; // Obtener el UUID de la URL dinámica

  const [swapDetails, setSwapDetails] = useState<DetailedSwapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Función para obtener los detalles del swap desde el backend
  const fetchSwapDetails = useCallback(async () => {
    if (!uuid) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/swap/monitor/${uuid}`); // Llama a tu nuevo endpoint API
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Error al obtener detalles del swap.");
      }

      if (result.success && result.data) {
        setSwapDetails(result.data); // Establece los datos del swap
      } else {
        console.warn("API response did not contain expected swap data:", result);
        setSwapDetails(null);
        setError("Formato de datos inválido recibido desde la API.");
      }
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al cargar los detalles del swap.");
      console.error("Error fetching swap details:", err);
      // toast.error(err.message || "Error al cargar los detalles del swap.");
    } finally {
      setLoading(false);
    }
  }, [uuid]);

  // Efecto para cargar los detalles del swap cuando el componente se monta o el UUID cambia
  useEffect(() => {
    if (uuid) {
      fetchSwapDetails();
    }
  }, [uuid, fetchSwapDetails]); // Dependencia en uuid para recargar si la URL cambia

  // Hook para refrescar los detalles del swap cada 5 segundos
  useInterval(() => {
    fetchSwapDetails();
  }, 5000); // Refresca cada 5 segundos para mantener los estados actualizados

  // --- Renderizado condicional basado en el estado de carga y error ---
  if (loading) {
    return (
      <div className="flex items-center flex-col flex-grow pt-10">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="mt-4 text-xl">Cargando detalles del swap...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center flex-col flex-grow pt-10">
        <div className="alert alert-error mt-4 max-w-md">
          <p className="font-bold">Error:</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!swapDetails) {
    return (
      <div className="flex items-center flex-col flex-grow pt-10">
        <p className="text-xl">No se encontraron detalles para el swap con UUID: {uuid}.</p>
      </div>
    );
  }

  // --- Renderizado de los detalles del swap ---
  return (
    <div className="flex flex-col items-center flex-grow pt-10 px-4 md:px-0">
      {/* /<Toaster position="bottom-right" richColors /> Componente para notificaciones toast */}
      {/* Título y estado general del swap */}
      <div className="px-5 mb-4 text-center">
        <h1 className="text-3xl font-bold mb-2">Detalles del Swap Cross-Chain</h1>
        <p className="text-lg text-gray-600">UUID: {swapDetails.uuid}</p>
        <span
          className={`badge mt-2 text-lg px-4 py-2 ${
            swapDetails.overallStatus?.includes("Completed")
              ? "badge-success" // Verde para completado
              : swapDetails.overallStatus?.includes("Active") || swapDetails.overallStatus?.includes("Awaiting")
                ? "badge-info" // Azul para activo/pendiente
                : swapDetails.overallStatus?.includes("Refunded") || swapDetails.overallStatus?.includes("Failed")
                  ? "badge-error" // Rojo para reembolsado/fallido
                  : "badge-warning" // Amarillo para otros estados (ej. Unknown, Initiated)
          }`}
        >
          Estado General: {swapDetails.overallStatus}
        </span>
      </div>
      {/* Sección de detalles de los escrows (EVM y XRPL) - Diseño en dos columnas en pantallas grandes */}
      <div className="flex flex-col lg:flex-row gap-8 w-full max-w-6xl mt-8">
        {/* Tarjeta de Detalles del Escrow EVM */}
        <div className="card bg-base-100 shadow-xl w-full lg:w-1/2">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4 text-primary">EVM Escrow</h2>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Estado:</strong>{" "}
                <span
                  className={`font-semibold ${
                    swapDetails.evmEscrowStatus === "Claimed"
                      ? "text-green-500"
                      : swapDetails.evmEscrowStatus === "Refunded" || swapDetails.evmEscrowStatus === "Failed"
                        ? "text-red-500"
                        : swapDetails.evmEscrowStatus === "Open"
                          ? "text-blue-500"
                          : "text-gray-500"
                  }`}
                >
                  {swapDetails.evmEscrowStatus}
                </span>
              </p>
              <p>
                <strong>Maker:</strong>{" "}
                <AddressInput value={swapDetails.makerEVMAddress} onChange={() => {}} disabled />{" "}
                {/* Usa tu componente AddressInput */}
              </p>
              <p>
                <strong>Taker:</strong>{" "}
                <AddressInput value={swapDetails.takerEVMAddress} onChange={() => {}} disabled />
              </p>
              <p>
                <strong>Cantidad:</strong> {ethers.formatEther(BigInt(swapDetails.amountEVM))} WETH
              </p>
              <p>
                <strong>Tx Creación:</strong>{" "}
                {swapDetails.evmCreationTxHash ? (
                  <Link
                    href={`https://sepolia.etherscan.io/tx/${swapDetails.evmCreationTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-primary text-xs"
                  >
                    {swapDetails.evmCreationTxHash.substring(0, 10)}...
                  </Link>
                ) : (
                  "Pendiente"
                )}
              </p>
              {swapDetails.evmClaimTxHash && (
                <p>
                  <strong>Tx Reclamo:</strong>{" "}
                  <Link
                    href={`https://sepolia.etherscan.io/tx/${swapDetails.evmClaimTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-primary text-xs"
                  >
                    {swapDetails.evmClaimTxHash.substring(0, 10)}...
                  </Link>
                </p>
              )}
              {swapDetails.evmRefundTxHash && (
                <p>
                  <strong>Tx Reembolso:</strong>{" "}
                  <Link
                    href={`https://sepolia.etherscan.io/tx/${swapDetails.evmRefundTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-primary text-xs"
                  >
                    {swapDetails.evmRefundTxHash.substring(0, 10)}...
                  </Link>
                </p>
              )}

              <div className="divider">Timelocks</div>
              <p>
                <strong>Taker puede reclamar hasta:</strong>{" "}
                {swapDetails.evmPublicWithdrawTimelockISO
                  ? new Date(swapDetails.evmPublicWithdrawTimelockISO).toLocaleString()
                  : "N/A"}
              </p>
              <p>
                <strong>Tiempo restante (reclamo):</strong> {swapDetails.evmTimeRemainingClaim}
              </p>
              <p>
                <strong>Maker puede cancelar después:</strong>{" "}
                {swapDetails.evmTimelockISO ? new Date(swapDetails.evmTimelockISO).toLocaleString() : "N/A"}
              </p>
              <p>
                <strong>Tiempo restante (cancelación):</strong> {swapDetails.evmTimeRemainingCancel}
              </p>

              {swapDetails.evmEscrowOpen && (
                <div className="mt-4 alert alert-info">
                  <p>Este escrow EVM está abierto. El Taker puede reclamar los fondos.</p>
                  {/* Aquí podrías añadir un botón para reclamar si el usuario es el taker */}
                </div>
              )}
              {!swapDetails.evmEscrowOpen && swapDetails.evmEscrowStatus === "Pending Creation" && (
                <div className="mt-4 alert alert-warning">
                  <p>El escrow EVM aún no ha sido creado o está pendiente de confirmación.</p>
                </div>
              )}
              {!swapDetails.evmEscrowOpen && swapDetails.evmEscrowStatus === "Not Initiated" && (
                <div className="mt-4 alert alert-warning">
                  <p>La iniciación del escrow EVM no ha comenzado.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tarjeta de Detalles del Escrow XRPL */}
        <div className="card bg-base-100 shadow-xl w-full lg:w-1/2">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4 text-secondary">XRPL Escrow</h2>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Estado:</strong>{" "}
                <span
                  className={`font-semibold ${
                    swapDetails.xrplEscrowStatus === "Claimed"
                      ? "text-green-500"
                      : swapDetails.xrplEscrowStatus === "Canceled / Refunded" ||
                          swapDetails.xrplEscrowStatus === "Failed"
                        ? "text-red-500"
                        : swapDetails.xrplEscrowStatus === "Open"
                          ? "text-blue-500"
                          : "text-gray-500"
                  }`}
                >
                  {swapDetails.xrplEscrowStatus}
                </span>
              </p>
              <p>
                <strong>Maker:</strong> {swapDetails.makerNonEVMAddress?.substring(0, 10)}...
              </p>
              <p>
                <strong>Taker:</strong> {swapDetails.takerNonEVMAddress?.substring(0, 10)}...
              </p>
              <p>
                <strong>Cantidad:</strong> {ethers.formatUnits(BigInt(swapDetails.amountNonEVM), 6)} XRP
              </p>
              <p>
                <strong>Offer Sequence:</strong> {swapDetails.xrplOfferSequence || "N/A"}
              </p>
              <p>
                <strong>Condition:</strong>{" "}
                {swapDetails.xrplCondition ? `${swapDetails.xrplCondition.substring(0, 10)}...` : "N/A"}
              </p>
              <p>
                <strong>Tx Creación:</strong>{" "}
                {swapDetails.xrplCreationTxHash ? (
                  <Link
                    href={`https://test.bithomp.com/explorer/${swapDetails.xrplCreationTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-secondary text-xs"
                  >
                    {swapDetails.xrplCreationTxHash.substring(0, 10)}...
                  </Link>
                ) : (
                  "Pendiente"
                )}
              </p>
              {swapDetails.xrplClaimTxHash && (
                <p>
                  <strong>Tx Reclamo:</strong>{" "}
                  <Link
                    href={`https://test.bithomp.com/explorer/${swapDetails.xrplClaimTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-secondary text-xs"
                  >
                    {swapDetails.xrplClaimTxHash.substring(0, 10)}...
                  </Link>
                </p>
              )}
              {swapDetails.xrplCancelTxHash && (
                <p>
                  <strong>Tx Cancelación:</strong>{" "}
                  <Link
                    href={`https://test.bithomp.com/explorer/${swapDetails.xrplCancelTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-secondary text-xs"
                  >
                    {swapDetails.xrplCancelTxHash.substring(0, 10)}...
                  </Link>
                </p>
              )}

              <div className="divider">Timelocks</div>
              <p>
                <strong>Taker puede reclamar hasta:</strong>{" "}
                {swapDetails.evmPublicWithdrawTimelockISO
                  ? new Date(swapDetails.evmPublicWithdrawTimelockISO).toLocaleString()
                  : "N/A"}
              </p>
              <p>
                <strong>Tiempo restante (reclamo):</strong> {swapDetails.xrplTimeRemainingClaim}
              </p>
              <p>
                <strong>Maker puede cancelar después:</strong>{" "}
                {swapDetails.evmTimelockISO ? new Date(swapDetails.evmTimelockISO).toLocaleString() : "N/A"}
              </p>
              <p>
                <strong>Tiempo restante (cancelación):</strong> {swapDetails.xrplTimeRemainingCancel}
              </p>

              {swapDetails.xrplEscrowOpen && (
                <div className="mt-4 alert alert-info">
                  <p>Este escrow XRPL está abierto. El Taker puede reclamar los fondos.</p>
                  {/* Aquí podrías añadir un botón para reclamar/cancelar si el usuario es el taker/maker */}
                </div>
              )}
              {!swapDetails.xrplEscrowOpen && swapDetails.xrplEscrowStatus === "Pending Creation" && (
                <div className="mt-4 alert alert-warning">
                  <p>El escrow XRPL aún no ha sido creado o está pendiente de confirmación.</p>
                </div>
              )}
              {!swapDetails.xrplEscrowOpen && swapDetails.xrplEscrowStatus === "Not Initiated" && (
                <div className="mt-4 alert alert-warning">
                  <p>La iniciación del escrow XRPL no ha comenzado.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Detalles Criptográficos & Historial Completo */}
      <div className="flex flex-col bg-base-100 shadow-lg rounded-2xl w-full max-w-6xl mt-8 px-8 py-8">
        <h2 className="card-title text-2xl mb-4 text-accent">Detalles Criptográficos & Historial Completo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <p>
              <strong>Secret Hash:</strong> {swapDetails.secretHash}
            </p>
          </div>
          <div>
            {swapDetails.secret ? (
              <p>
                <strong>Secret (Preimage):</strong> {swapDetails.secret}
              </p>
            ) : (
              <p className="text-gray-500">
                <strong>Secret:</strong> Pendiente de revelación (se mostrará una vez reclamado en alguna cadena).
              </p>
            )}
          </div>
        </div>

        <h3 className="text-lg font-semibold mb-2">Historial de Eventos:</h3>
        <ul className="list-disc list-inside text-sm max-h-60 overflow-y-auto p-3 border border-base-content/20 rounded-lg bg-base-200">
          {swapDetails.combinedHistory.length > 0 ? (
            swapDetails.combinedHistory.map((event, index) => (
              <li key={index} className="mb-1">
                <strong>{event.timestamp}:</strong> <span className="font-medium text-primary">{event.status}</span>
                {event.chainType && ` (${event.chainType})`}
                {event.txHash && ` (Tx: ${event.txHash.substring(0, 10)}...)`}
                {event.details && ` - ${event.details}`}
                {event.errorMessage && ` - Error: ${event.errorMessage}`}
              </li>
            ))
          ) : (
            <p className="text-center text-gray-500">No hay eventos en el historial.</p>
          )}
        </ul>
      </div>
    </div>
  );
};

export default SwapDetailsPage;
