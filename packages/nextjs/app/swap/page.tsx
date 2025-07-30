"use client";

// Componente del cliente
import React, { useState } from "react";
import { toast } from "sonner";
// De Scaffold-ETH 2 para la dirección de EVM
// import { Switch } from "@headlessui/react";
// import { parseEther } from "ethers";
// Para convertir strings a BigInt para ethers
import { useAccount } from "wagmi";
// Ejemplo para un toggle, instala si no lo tienes
import { AddressInput } from "~~/components/scaffold-eth";
import { DateTimePicker } from "~~/components/ui/date-time-picker";

// Componente de Scaffold-ETH 2 para input de dirección
// Puedes usar un hook personalizado para manejar la llamada a la API
// import { useScaffoldContractRead, useScaffoldContractWrite } from "~~/hooks/scaffold-eth";

const DEFAULT_MAKER_EVM_ADDRESS = "0x90385AB8beb475aA707b0D2597B81494b062E583"; // Dirección del Maker de EVM
const DEFAULT_TAKER_EVM_ADDRESS = "0xeA5A20D8d9Eeed3D8275993bdF3Bdb4749e7C485"; // Dirección del Taker de EVM
const DEFAULT_MAKER_EVM_TOKEN_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"; // WETH Sepolia
const DEFAULT_AMOUNT_EVM = "0.0005"; // 0.0005 WETH
const DEFAULT_SAFETY_DEPOSIT_AMOUNT = "0.00001"; // 0.00001 ETH
const DEFAULT_MAKER_XRP_ADDRESS = "rLqCZBkhbzwvw5XPT6FUamtoTXmcLYMBQG"; // Tu dirección XRP Ledger
const DEFAULT_TAKER_XRP_ADDRESS = "r4bH6ktwrZmxqZSYLuJTxVpg8PQ8yYVKk5"; // Dirección del Taker de XRP Ledger
const DEFAULT_AMOUNT_XRP = "1000000"; // 1 XRP = 1,000,000 drops

const getInitialFinishAfter = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 1); // Por defecto, 1 minuto en el futuro
  return date;
};

const getInitialCancelAfter = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 10); // Por defecto, 10 minutos en el futuro
  return date;
};

const SwapInitiatorPage: React.FC = () => {
  const { address: connectedAddress } = useAccount();
  const [evmPublicWithdrawTimelock, setEvmPublicWithdrawTimelock] = useState<Date | undefined>(getInitialFinishAfter());
  const [evmCancellationTimelock, setEvmCancellationTimelock] = useState<Date | undefined>(getInitialCancelAfter());

  // Estados para los inputs del formulario
  const [makerEVMAddress, setMakerEVMAddress] = useState<string>(connectedAddress || DEFAULT_MAKER_EVM_ADDRESS);
  const [takerEVMAddress, setTakerEVMAddress] = useState<string>(DEFAULT_TAKER_EVM_ADDRESS);
  const [makerEVMTokenAddress, setMakerEVMTokenAddress] = useState<string>(DEFAULT_MAKER_EVM_TOKEN_ADDRESS);
  const [amountEVM, setAmountEVM] = useState<string>(DEFAULT_AMOUNT_EVM);
  const [safetyDepositAmount, setSafetyDepositAmount] = useState<string>(DEFAULT_SAFETY_DEPOSIT_AMOUNT);
  const [makerXRPAddress, setMakerXRPAddress] = useState<string>(DEFAULT_MAKER_XRP_ADDRESS);
  const [takerXRPAddress, setTakerXRPAddress] = useState<string>(DEFAULT_TAKER_XRP_ADDRESS);
  const [amountXRP, setAmountXRP] = useState<string>(DEFAULT_AMOUNT_XRP);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    // let response;

    toast.info("Initiating swap... Please wait.");

    try {
      // Validación básica
      if (
        !makerEVMAddress ||
        !takerEVMAddress ||
        !amountEVM ||
        !amountXRP ||
        !takerXRPAddress ||
        !evmPublicWithdrawTimelock ||
        !evmCancellationTimelock
      ) {
        throw new Error("Por favor, rellena todos los campos obligatorios.");
      }

      const finishAfterTimestamp = Math.floor(evmPublicWithdrawTimelock.getTime() / 1000);
      const cancelAfterTimestamp = Math.floor(evmCancellationTimelock.getTime() / 1000);

      // Llamada a tu API Route de Next.js
      const response = await fetch("/api/swap/initiate/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          makerEVMAddress,
          takerEVMAddress,
          makerEVMTokenAddress,
          amountEVM, // Se envía como string, la API Route lo parseará
          safetyDepositAmount, // Se envía como string
          makerXRPAddress,
          takerXRPAddress,
          amountXRP,
          evmPublicWithdrawTimelock: finishAfterTimestamp,
          evmCancellationTimelock: cancelAfterTimestamp,
        }),
      });

      if (!response.body) {
        throw new Error("Streaming response not available.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const processStream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n\n").filter(line => line.startsWith("data:"));

          for (const line of lines) {
            const json = line.replace("data: ", "");
            const data = JSON.parse(json);

            if (data.error) {
              toast.error(data.details || data.error);
              setError(data.details || data.error);
              setLoading(false);
              return;
            } else if (data.uuid) {
              toast.success(data.message);
              setMessage(
                `Swap initiated successfully! UUID: ${data.uuid}. EVM Tx: ${data.evmTxHash}. XRP Tx: ${data.nonEVMTxHash}`,
              );
              setLoading(false);
              return;
            } else {
              toast.info(data.message);
            }
          }
        }
      };

      processStream();

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al iniciar el swap.");
      }

      setMessage(
        `Swap iniciado exitosamente! UUID: ${data.uuid}. EVM Tx: ${data.evmTxHash}. XRP Tx: ${data.nonEVMTxHash}`,
      );
      // Opcional: Redirigir a la página de monitoreo con el UUID
      // router.push(`/swap/monitor/${data.uuid}`);
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado.");
      console.error("Error submitting swap:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center flex-col flex-grow pt-10">
      <div className="px-5">
        <h1 className="text-center mb-4">
          <span className="block text-2xl font-bold">Iniciar Swap Cross-Chain</span>
        </h1>
        <p className="text-center text-lg">Configura y lanza un swap atómico entre EVM y XRP Ledger.</p>
      </div>

      <div className="flex flex-col bg-base-100 px-8 py-8 rounded-2xl shadow-lg w-full max-w-lg mt-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Inputs para EVM */}
          <div>
            <label className="label">
              <span className="label-text">Maker EVM Address (You)</span>
            </label>
            <AddressInput value={makerEVMAddress} onChange={setMakerEVMAddress} placeholder="0x..." />
          </div>
          <div>
            <label className="label">
              <span className="label-text">Taker EVM Address</span>
            </label>
            <AddressInput value={takerEVMAddress} onChange={setTakerEVMAddress} placeholder="0x..." />
          </div>
          <div>
            <label className="label">
              <span className="label-text">EVM Token Address (WETH Sepolia)</span>
            </label>
            <AddressInput
              value={makerEVMTokenAddress}
              onChange={setMakerEVMTokenAddress}
              placeholder="0x..."
              disabled // Para simplificar, asumo WETH por ahora
            />
          </div>
          <div>
            <label className="label">
              <span className="label-text">Amount EVM (WETH)</span>
            </label>
            <input
              type="number"
              step="any"
              className="input input-bordered w-full"
              value={amountEVM}
              onChange={e => setAmountEVM(e.target.value)}
              placeholder="e.g., 0.001"
            />
          </div>
          <div>
            <label className="label">
              <span className="label-text">Safety Deposit Amount (ETH)</span>
            </label>
            <input
              type="number"
              step="any"
              className="input input-bordered w-full"
              value={safetyDepositAmount}
              onChange={e => setSafetyDepositAmount(e.target.value)}
              placeholder="e.g., 0.00001"
            />
          </div>

          {/* Separador Timelocks */}
          <div className="divider">HTLC Timelocks</div>

          {/* Inputs para Timelocks */}
          <div>
            <label className="label">
              <span className="label-text">Finish After (Claim Window Opens)</span>
            </label>
            <DateTimePicker value={evmPublicWithdrawTimelock} onChange={setEvmPublicWithdrawTimelock} />
            <p className="text-xs text-gray-500 mt-1">The earliest time the Taker can claim the funds.</p>
          </div>
          <div>
            <label className="label">
              <span className="label-text">Cancel After (Refund Window Opens)</span>
            </label>
            <DateTimePicker value={evmCancellationTimelock} onChange={setEvmCancellationTimelock} />
            <p className="text-xs text-gray-500 mt-1">
              The earliest time you (the Maker) can cancel and reclaim the funds if not claimed.
            </p>
          </div>

          {/* Separador XRP */}
          <div className="divider">XRP Ledger Details</div>

          {/* Inputs para XRP */}
          <div>
            <label className="label">
              <span className="label-text">Maker XRP Address (Your XRP Account)</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={makerXRPAddress}
              onChange={e => setMakerXRPAddress(e.target.value)}
              placeholder="r..."
              disabled // Placeholder, debería venir del usuario
            />
          </div>
          <div>
            <label className="label">
              <span className="label-text">Taker XRP Address</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={takerXRPAddress}
              onChange={e => setTakerXRPAddress(e.target.value)}
              placeholder="r..."
            />
          </div>
          <div>
            <label className="label">
              <span className="label-text">Amount XRP (drops)</span>
            </label>
            <input
              type="number"
              step="1"
              className="input input-bordered w-full"
              value={amountXRP}
              onChange={e => setAmountXRP(e.target.value)}
              placeholder="e.g., 1000000 (for 1 XRP)"
            />
          </div>

          <button type="submit" className="btn btn-primary w-full mt-6" disabled={loading}>
            {loading ? <span className="loading loading-spinner"></span> : "Iniciar Swap"}
          </button>

          {message && <div className="alert alert-success mt-4">{message}</div>}
          {error && <div className="alert alert-error mt-4">{error}</div>}
        </form>
      </div>
    </div>
  );
};

export default SwapInitiatorPage;
