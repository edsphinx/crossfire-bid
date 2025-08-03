"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import { useInterval } from "usehooks-ts";

// Updated interface to match what the backend now sends
interface SwapData {
  _id: string;
  uuid: string;
  status: string; // The original status from DB
  makerEVMAddress: string;
  takerEVMAddress: string;
  makerNonEVMAddress: string;
  takerNonEVMAddress: string;
  makerEVMTokenAddress: string;
  amountEVM: string;
  amountNonEVM: string;
  secretHash: string;
  secret?: string;
  evmChainId: string;
  nonEVMChainType: string;
  nonEVMDetails: {
    xrplCondition: string;
  };
  evmTxHash?: string;
  evmTimelock: number; // Original EVM timelock (CancelAfter for Maker)
  evmPublicWithdrawTimelock: number; // Original EVM public withdraw timelock (FinishAfter for Taker)
  history: Array<{
    timestamp: string;
    status: string;
    txHash?: string;
    chainType?: string;
    details?: { message?: string; txType?: string };
  }>;
  createdAt: string;
  updatedAt: string;
  __v: number;
  nonEVMSequence?: number;
  nonEVMTxHash?: string;
  id: string;

  // These are now processed by the backend and sent directly
  evmStatus: string;
  nonEVMStatus: string;
  overallStatus: string; // This should always be a string from backend processing
  evmTimeRemaining: string; // Time until Taker can claim (from evmPublicWithdrawTimelock)
  nonEVMTimeRemaining: string; // Time until Maker can cancel (from evmCancellationTimelock)
  takerCanClaimUntil: string | null; // ISO string for Taker's claim window (from evmPublicWithdrawTimelock)
  makerCanCancelAt: string | null; // ISO string for Maker's cancel window (from evmCancellationTimelock)
}

const SwapMonitorPage: React.FC = () => {
  const [swaps, setSwaps] = useState<SwapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSwaps = async () => {
    try {
      const response = await fetch("/api/swap/monitor");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Error al obtener datos de swaps.");
      }

      if (result.success && Array.isArray(result.data)) {
        setSwaps(result.data);
      } else {
        console.warn("API response did not contain expected data array or success status:", result);
        setSwaps([]);
        setError("Invalid data format received from API.");
      }
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al cargar los swaps.");
      console.error("Error fetching swaps:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSwaps();
  }, []);

  useInterval(() => {
    fetchSwaps();
  }, 10000); // Refresca cada 10 segundos

  return (
    <div className="flex items-center flex-col flex-grow pt-10">
      <div className="px-5">
        <h1 className="text-center mb-4">
          <span className="block text-2xl font-bold">Monitoreo de Swaps Cross-Chain</span>
        </h1>
        <p className="text-center text-lg">Estado en tiempo real de los swaps atómicos.</p>
      </div>

      <div className="flex flex-col bg-base-100 px-8 py-8 rounded-2xl shadow-lg w-full max-w-4xl mt-8">
        {loading && <p className="text-center">Cargando swaps...</p>}
        {error && <div className="alert alert-error mt-4">{error}</div>}

        {!loading && swaps.length === 0 && !error && <p className="text-center">No hay swaps activos para mostrar.</p>}

        {!loading && swaps.length > 0 && (
          <div className="grid grid-cols-1 gap-6">
            {swaps.map(swap => (
              <div key={swap.uuid} className="card bg-base-200 shadow-xl mb-4">
                <div className="card-body">
                  <h2 className="card-title text-xl mb-2">
                    Swap UUID: {swap.uuid.substring(0, 8)}...
                    <span
                      className={`badge ml-2 ${
                        // Usar optional chaining para asegurar que overallStatus es una cadena antes de llamar a .includes()
                        swap.overallStatus?.includes("Completed")
                          ? "badge-success"
                          : swap.overallStatus?.includes("Active") || swap.overallStatus?.includes("Awaiting")
                            ? "badge-info"
                            : swap.overallStatus?.includes("Refunded") || swap.overallStatus?.includes("Failed")
                              ? "badge-error"
                              : "badge-warning" // Default or Unknown
                      }`}
                    >
                      {swap.overallStatus}
                    </span>
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p>
                        <strong>Maker EVM:</strong> {swap.makerEVMAddress?.substring(0, 6)}...
                      </p>
                      <p>
                        <strong>Taker EVM:</strong> {swap.takerEVMAddress?.substring(0, 6)}...
                      </p>
                      <p>
                        <strong>Amount EVM:</strong> {ethers.formatEther(BigInt(swap.amountEVM))} WETH
                      </p>
                      <p>
                        <strong>EVM Status:</strong> {swap.evmStatus}
                      </p>
                      <p>
                        <strong>EVM Tx Hash:</strong> {swap.evmTxHash ? `${swap.evmTxHash.substring(0, 6)}...` : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p>
                        <strong>Maker XRP:</strong> {swap.makerNonEVMAddress?.substring(0, 6)}...
                      </p>
                      <p>
                        <strong>Taker XRP:</strong> {swap.takerNonEVMAddress?.substring(0, 6)}... (Type:{" "}
                        {swap.nonEVMChainType})
                      </p>
                      <p>
                        <strong>Amount XRP:</strong> {ethers.formatUnits(BigInt(swap.amountNonEVM), 6)} XRP
                      </p>
                      <p>
                        <strong>XRPL Status:</strong> {swap.nonEVMStatus}
                      </p>
                      <p>
                        <strong>XRPL Tx Hash:</strong>{" "}
                        {swap.nonEVMTxHash ? `${swap.nonEVMTxHash.substring(0, 6)}...` : "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-gray-700 pt-4">
                    <p>
                      <strong>Secret Hash:</strong> {swap.secretHash?.substring(0, 10)}...
                    </p>
                    {swap.secret && (
                      <p>
                        <strong>Secret:</strong> {swap.secret?.substring(0, 10)}... (Only if claimed)
                      </p>
                    )}
                    <p>
                      <strong>Taker can claim until:</strong>{" "}
                      {swap.takerCanClaimUntil ? new Date(swap.takerCanClaimUntil).toLocaleString() : "N/A"} (
                      {swap.evmTimeRemaining} left)
                    </p>
                    <p>
                      <strong>Maker can cancel after:</strong>{" "}
                      {swap.makerCanCancelAt ? new Date(swap.makerCanCancelAt).toLocaleString() : "N/A"} (approx.)
                    </p>
                  </div>

                  <h3 className="text-lg font-semibold mt-4">History:</h3>
                  <ul className="list-disc list-inside text-sm max-h-24 overflow-y-auto">
                    {swap.history?.map((event, index) => (
                      <li key={index}>
                        <strong>{new Date(event.timestamp).toLocaleString()}:</strong>{" "}
                        {event.status?.replace(/_/g, " ")} {event.txHash && `(Tx: ${event.txHash.substring(0, 6)}...)`}
                      </li>
                    ))}
                  </ul>

                  <div className="card-actions justify-end mt-4">
                    <Link href={`/swap/monitor/${swap.uuid}`} className="btn btn-sm btn-primary">
                      View Details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SwapMonitorPage;
