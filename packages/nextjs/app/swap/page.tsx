"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { useAccount } from "wagmi";
import { AddressInput } from "~~/components/scaffold-eth";
import { DateTimePicker } from "~~/components/ui/date-time-picker";

const DEFAULT_VALUES = {
  MAKER_EVM_ADDRESS: "0x90385AB8beb475aA707b0D2597B81494b062E583",
  TAKER_EVM_ADDRESS: "0xeA5A20D8d9Eeed3D8275993bdF3Bdb4749e7C485",
  MAKER_EVM_TOKEN_ADDRESS: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH Sepolia
  AMOUNT_EVM: "0.0005", // 0.0005 WETH
  SAFETY_DEPOSIT_AMOUNT: "0.00001", // 0.00001 ETH
  MAKER_XRP_ADDRESS: "rLqCZBkhbzwvw5XPT6FUamtoTXmcLYMBQG", // Your XRP Ledger address
  TAKER_XRP_ADDRESS: "r4bH6ktwrZmxqZSYLuJTxVpg8PQ8yYVKk5", // Taker's XRP Ledger address
  AMOUNT_XRP: "1000000", // 1 XRP = 1,000,000 drops
};

// --- API Stream Processor Function ---
interface StreamData {
  error?: string;
  details?: string;
  uuid?: string;
  evmTxHash?: string;
  nonEVMTxHash?: string;
  message?: string;
}

/**
 * Processes a streaming API response, handling Server-Sent Events (SSE) format.
 *
 * @param response The Fetch API Response object.
 * @param onUpdate Callback function called with each parsed data chunk from the stream.
 * @param onComplete Callback function called when the stream ends (successfully or with an error).
 */
const processApiResponseStream = async (
  response: Response,
  onUpdate: (data: StreamData) => void,
  onComplete: (success: boolean) => void,
) => {
  if (!response.body) {
    throw new Error("Streaming response not available. Make sure the backend sends a readable stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ""; // Buffer to handle partial lines

  try {
    while (true) {
      const { done, value } = await reader.read();
      const chunk = decoder.decode(value, { stream: true }); // Decode in streaming mode
      buffer += chunk;

      // Process complete lines from the buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep the last (potentially incomplete) line in the buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const jsonString = line.substring(6); // Remove "data: " prefix
            const data: StreamData = JSON.parse(jsonString);
            onUpdate(data);
          } catch (parseError: any) {
            console.error("Error parsing stream data line:", line, parseError);
            onUpdate({ error: "Parsing error", details: `Failed to parse stream data: ${parseError.message}` });
          }
        }
      }

      if (done) {
        // Process any remaining data in the buffer
        if (buffer.startsWith("data: ")) {
          try {
            const jsonString = buffer.substring(6);
            const data: StreamData = JSON.parse(jsonString);
            onUpdate(data);
          } catch (parseError: any) {
            console.error("Error parsing final stream data line:", buffer, parseError);
            onUpdate({ error: "Parsing error", details: `Failed to parse final stream data: ${parseError.message}` });
          }
        }
        onComplete(true);
        break;
      }
    }
  } catch (error: any) {
    console.error("Error during stream processing:", error);
    onUpdate({
      error: "Stream connection error",
      details: error.message || "An unexpected error occurred during streaming.",
    });
    onComplete(false);
  } finally {
    reader.releaseLock(); // Release the reader lock when done or error
  }
};

// --- SwapInitiatorPage Component ---
const SwapInitiatorPage: React.FC = () => {
  const { address: connectedAddress } = useAccount();

  // State for form inputs
  const [formData, setFormData] = useState({
    makerEVMAddress: connectedAddress || DEFAULT_VALUES.MAKER_EVM_ADDRESS,
    takerEVMAddress: DEFAULT_VALUES.TAKER_EVM_ADDRESS,
    makerEVMTokenAddress: DEFAULT_VALUES.MAKER_EVM_TOKEN_ADDRESS,
    amountEVM: DEFAULT_VALUES.AMOUNT_EVM,
    safetyDepositAmount: DEFAULT_VALUES.SAFETY_DEPOSIT_AMOUNT,
    makerXRPAddress: DEFAULT_VALUES.MAKER_XRP_ADDRESS,
    takerXRPAddress: DEFAULT_VALUES.TAKER_XRP_ADDRESS,
    amountXRP: DEFAULT_VALUES.AMOUNT_XRP,
    evmPublicWithdrawTimelock: undefined as Date | undefined,
    evmCancellationTimelock: undefined as Date | undefined,
  });

  // State for progress messages (full history)
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  // Ref for auto-scrolling the progress div
  const progressMessagesRef = useRef<HTMLDivElement>(null);

  const addProgressMessage = useCallback((message: string) => {
    setProgressMessages(prev => [...prev, message]);
  }, []);

  // Effect for auto-scrolling
  useEffect(() => {
    if (progressMessagesRef.current) {
      progressMessagesRef.current.scrollTop = progressMessagesRef.current.scrollHeight;
    }
  }, [progressMessages]); // Scroll whenever messages are added

  useEffect(() => {
    // Esta función se define localmente para asegurar que new Date() se llama en el cliente.
    const getInitialFutureDate = (minutes: number) => {
      const date = new Date();
      date.setMinutes(date.getMinutes() + minutes);
      return date;
    };

    setFormData(prev => {
      return {
        ...prev,
        // Solo asigna un valor si actualmente es undefined
        evmPublicWithdrawTimelock: prev.evmPublicWithdrawTimelock || getInitialFutureDate(1),
        evmCancellationTimelock: prev.evmCancellationTimelock || getInitialFutureDate(10),
      };
    });
  }, []);

  useEffect(() => {
    if (connectedAddress && connectedAddress !== formData.makerEVMAddress) {
      setFormData(prev => ({ ...prev, makerEVMAddress: connectedAddress }));
    }
  }, [connectedAddress, formData.makerEVMAddress]);

  // State for UI feedback (final status messages, displayed below the form)
  const [loading, setLoading] = useState(false);
  const [finalMessage, setFinalMessage] = useState<string | null>(null); // Renamed to avoid confusion
  const [finalError, setFinalError] = useState<string | null>(null); // Renamed to avoid confusion

  // Generic handler for text/number input changes
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  // Handler for DateTimePicker changes
  const handleDateChange = useCallback((name: string, date: Date | undefined) => {
    setFormData(prev => ({ ...prev, [name]: date }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFinalMessage(null); // Clear previous final messages
    setFinalError(null); // Clear previous final errors
    setProgressMessages([]); // Clear previous progress history for a new swap
    toast.info("Initiating swap... Please wait.");

    try {
      // Basic client-side validation
      const requiredFields = [
        "makerEVMAddress",
        "takerEVMAddress",
        "amountEVM",
        "amountXRP",
        "takerXRPAddress",
        "evmPublicWithdrawTimelock",
        "evmCancellationTimelock",
      ];
      for (const field of requiredFields) {
        const value =
          formData[field as keyof Omit<typeof formData, "evmPublicWithdrawTimelock" | "evmCancellationTimelock">];
        if (!value || (typeof value === "string" && value.trim() === "")) {
          throw new Error(`Please fill in the required field: ${field.replace(/([A-Z])/g, " $1").toLowerCase()}`);
        }
      }

      // Ensure timelock dates are valid Date objects before conversion
      if (
        !(formData.evmPublicWithdrawTimelock instanceof Date) ||
        isNaN(formData.evmPublicWithdrawTimelock.getTime())
      ) {
        throw new Error("Invalid 'Finish After' date. Please select a valid date and time.");
      }
      if (!(formData.evmCancellationTimelock instanceof Date) || isNaN(formData.evmCancellationTimelock.getTime())) {
        throw new Error("Invalid 'Cancel After' date. Please select a valid date and time.");
      }

      const finishAfterTimestamp = Math.floor(formData.evmPublicWithdrawTimelock.getTime() / 1000);
      const cancelAfterTimestamp = Math.floor(formData.evmCancellationTimelock.getTime() / 1000);

      const apiPayload = {
        makerEVMAddress: formData.makerEVMAddress,
        takerEVMAddress: formData.takerEVMAddress,
        makerEVMTokenAddress: formData.makerEVMTokenAddress,
        amountEVM: formData.amountEVM, // Sent as string, API Route should parse
        safetyDepositAmount: formData.safetyDepositAmount, // Sent as string
        makerXRPAddress: formData.makerXRPAddress,
        takerXRPAddress: formData.takerXRPAddress,
        amountXRP: formData.amountXRP,
        evmPublicWithdrawTimelock: finishAfterTimestamp,
        evmCancellationTimelock: cancelAfterTimestamp,
      };

      const response = await fetch("/api/swap/initiate/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiPayload),
      });

      if (!response.ok) {
        // If HTTP status is not 2xx, try to parse JSON error message
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || "Failed to initiate swap due to server error.");
      }

      // Process the streaming response
      await processApiResponseStream(
        response,
        (data: StreamData) => {
          if (data.error) {
            toast.error(data.details || data.error);
            setFinalError(data.details || data.error); // Set final error
            addProgressMessage(`❌ Error: ${data.details || data.error}`);
            setLoading(false); // Stop loading on first error from stream
          } else if (data.uuid) {
            // Final success message from stream
            toast.success(data.message || "Swap initiated successfully!");
            setFinalMessage(
              `Swap initiated successfully! UUID: ${data.uuid}. EVM Tx: ${data.evmTxHash || "N/A"}. XRP Tx: ${
                data.nonEVMTxHash || "N/A"
              }`,
            );
            addProgressMessage(`✅ ${data.message || "Swap Completed."}`);
            // Optionally, redirect to the monitor page with the UUID
            // router.push(`/swap/monitor/${data.uuid}`);
          } else if (data.message) {
            // General progress messages
            addProgressMessage(`➡️ ${data.message}`);
          }
        },
        (success: boolean) => {
          setLoading(false); // Always set loading to false when stream completes
          if (!success && !finalError) {
            // If stream completed with an error, but no specific error was set yet
            setFinalError("The streaming connection closed unexpectedly or encountered a problem.");
            addProgressMessage("❌ Error: The streaming connection closed unexpectedly or encountered a problem.");
          }
        },
      );
    } catch (err: any) {
      setFinalError(err.message || "An unexpected error occurred during swap initiation.");
      console.error("Error submitting swap:", err);
      toast.error(err.message || "Error initiating swap.");
      addProgressMessage(`❌ Error: ${err.message || "Error initiating swap."}`);
    } finally {
      // setLoading(false); // Handled by processApiResponseStream's onComplete or specific error states
    }
  };

  return (
    <div className="flex flex-col items-center flex-grow pt-10 px-4 md:px-0">
      <Toaster position="bottom-right" richColors />
      <div className="px-5 mb-4">
        <h1 className="text-center mb-2">
          <span className="block text-2xl font-bold">Initiate Cross-Chain Swap</span>
        </h1>
        <p className="text-center text-lg">Configure and launch an atomic swap between EVM and XRP Ledger.</p>
      </div>

      {/* Main content area: Form on left, Progress on right */}
      <div className="flex flex-col md:flex-row gap-8 w-full max-w-6xl">
        {/* Form Section */}
        <div className="flex flex-col bg-base-100 px-8 py-8 rounded-2xl shadow-lg w-full md:w-1/2">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* EVM Inputs */}
            <div>
              <label className="label">
                <span className="label-text">Maker EVM Address (You)</span>
              </label>
              <AddressInput
                value={formData.makerEVMAddress}
                onChange={addr => setFormData(prev => ({ ...prev, makerEVMAddress: addr }))}
                placeholder="0x..."
                disabled={loading}
              />
            </div>
            <div>
              <label className="label">
                <span className="label-text">Taker EVM Address</span>
              </label>
              <AddressInput
                value={formData.takerEVMAddress}
                onChange={addr => setFormData(prev => ({ ...prev, takerEVMAddress: addr }))}
                placeholder="0x..."
                disabled={loading}
              />
            </div>
            <div>
              <label className="label">
                <span className="label-text">EVM Token Address (WETH Sepolia)</span>
              </label>
              <AddressInput
                value={formData.makerEVMTokenAddress}
                onChange={addr => setFormData(prev => ({ ...prev, makerEVMTokenAddress: addr }))}
                placeholder="0x..."
                disabled={true} // Assuming WETH for now, keep disabled
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
                name="amountEVM"
                value={formData.amountEVM}
                onChange={handleInputChange}
                placeholder="e.g., 0.001"
                disabled={loading}
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
                name="safetyDepositAmount"
                value={formData.safetyDepositAmount}
                onChange={handleInputChange}
                placeholder="e.g., 0.00001"
                disabled={loading}
              />
            </div>

            {/* Timelocks Divider */}
            <div className="divider">HTLC Timelocks</div>

            {/* Timelock Inputs */}
            <div>
              <label className="label">
                <span className="label-text">Finish After (Claim Window Opens)</span>
              </label>
              <DateTimePicker
                value={formData.evmPublicWithdrawTimelock}
                onChange={date => handleDateChange("evmPublicWithdrawTimelock", date)}
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">The earliest time the Taker can claim the funds.</p>
            </div>
            <div>
              <label className="label">
                <span className="label-text">Cancel After (Refund Window Opens)</span>
              </label>
              <DateTimePicker
                value={formData.evmCancellationTimelock}
                onChange={date => handleDateChange("evmCancellationTimelock", date)}
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">
                The earliest time you (the Maker) can cancel and reclaim the funds if not claimed.
              </p>
            </div>

            {/* XRP Divider */}
            <div className="divider">XRP Ledger Details</div>

            {/* XRP Inputs */}
            <div>
              <label className="label">
                <span className="label-text">Maker XRP Address (Your XRP Account)</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                name="makerXRPAddress"
                value={formData.makerXRPAddress}
                onChange={handleInputChange}
                placeholder="r..."
                disabled={loading}
              />
            </div>
            <div>
              <label className="label">
                <span className="label-text">Taker XRP Address</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                name="takerXRPAddress"
                value={formData.takerXRPAddress}
                onChange={handleInputChange}
                placeholder="r..."
                disabled={loading}
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
                name="amountXRP"
                value={formData.amountXRP}
                onChange={handleInputChange}
                placeholder="e.g., 1000000 (for 1 XRP)"
                disabled={loading}
              />
            </div>

            <button type="submit" className="btn btn-primary w-full mt-6" disabled={loading}>
              {loading ? <span className="loading loading-spinner"></span> : "Initiate Swap"}
            </button>

            {/* Final Status Messages (below the form) */}
            {finalMessage && <div className="alert alert-success mt-4">{finalMessage}</div>}
            {finalError && <div className="alert alert-error mt-4">{finalError}</div>}
          </form>
        </div>

        {/* Progress Display Section (now alongside the form) */}
        {(loading || progressMessages.length > 0) && ( // Show if loading OR if there are messages (to keep history)
          <div className="flex flex-col bg-base-100 px-8 py-8 rounded-2xl shadow-lg w-full md:w-1/2">
            <h3 className="font-bold text-xl mb-4 text-center">Swap Progress Log</h3>
            <div
              ref={progressMessagesRef} // Attach ref for auto-scrolling
              className="flex-grow max-h-[600px] overflow-y-auto text-sm text-gray-600 space-y-2 p-3 border border-base-content/20 rounded-lg bg-base-200"
            >
              {progressMessages.length === 0 && !loading ? (
                <p className="text-center text-gray-500">No progress messages yet. Initiate a swap to see the log.</p>
              ) : (
                progressMessages.map((msg, index) => (
                  <p key={index} className="flex items-center gap-2">
                    {msg.startsWith("✅") ? (
                      <span className="text-green-500 text-lg">✔</span>
                    ) : msg.startsWith("❌") ? (
                      <span className="text-red-500 text-lg">✖</span>
                    ) : (
                      <span className="text-blue-500 text-lg">●</span>
                    )}{" "}
                    {/* Íconos visuales */}
                    {msg.substring(msg.indexOf(" ") + 1)} {/* Quita el prefijo de ícono para mostrar solo el texto */}
                  </p>
                ))
              )}
              {loading && (
                <p className="flex items-center gap-2 text-blue-500">
                  <span className="loading loading-spinner loading-sm"></span>
                  Processing...
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SwapInitiatorPage;
