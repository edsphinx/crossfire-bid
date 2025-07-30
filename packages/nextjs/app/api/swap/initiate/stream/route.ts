import { NextRequest } from "next/server";
import { parseUnits } from "ethers";
import { initiateEvmEscrow } from "~~/services/core/start/evm-initiator";
import { createXrplHtlc } from "~~/services/core/start/xrpl-htlc-creator";

export async function POST(request: NextRequest) {
  const {
    makerEVMAddress,
    takerEVMAddress,
    makerEVMTokenAddress,
    amountEVM,
    safetyDepositAmount,
    makerXRPAddress,
    takerXRPAddress,
    amountXRP,
    evmPublicWithdrawTimelock,
    evmCancellationTimelock,
  } = await request.json();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendProgress = (message: string) => {
        // SSE format: data: { "message": "..." }\n\n
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ message })}\n\n`));
      };

      try {
        // --- Validation ---
        if (
          !makerEVMAddress ||
          !takerEVMAddress ||
          !amountEVM ||
          !amountXRP ||
          !evmPublicWithdrawTimelock ||
          !evmCancellationTimelock
        ) {
          throw new Error("Missing required parameters");
        }

        const parsedAmountEVM = parseUnits(amountEVM.toString(), 18n);
        const parsedSafetyDepositAmount = parseUnits(safetyDepositAmount.toString(), 18n);

        // --- 1. Initiate EVM Escrow ---
        const evmInitiatorResult = await initiateEvmEscrow(
          makerEVMAddress,
          takerEVMAddress,
          makerEVMTokenAddress,
          parsedAmountEVM,
          parsedSafetyDepositAmount,
          makerXRPAddress,
          takerXRPAddress,
          amountXRP,
          evmPublicWithdrawTimelock,
          evmCancellationTimelock,
          sendProgress,
        );

        if (!evmInitiatorResult) {
          throw new Error("EVM escrow initiation failed.");
        }

        const {
          uuid,
          hashlock,
          xrplCondition,
          evmTimelock,
          evmPublicWithdrawTimelock: evmPublicWithdrawTimelockResult,
        } = evmInitiatorResult;

        // --- 2. Create XRP HTLC ---
        const xrpCreatorResult = await createXrplHtlc(
          uuid,
          amountXRP,
          takerXRPAddress,
          xrplCondition,
          evmTimelock,
          evmPublicWithdrawTimelockResult,
          hashlock,
          sendProgress, // Pass the progress callback
        );

        if (!xrpCreatorResult) {
          throw new Error("XRP HTLC creation failed.");
        }

        // --- Final Success Message ---
        const finalData = {
          message: "Swap initiated successfully!",
          uuid,
          evmTxHash: evmInitiatorResult.evmTxHash,
          nonEVMTxHash: xrpCreatorResult.nonEVMTxHash,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`));
        controller.close();
      } catch (error: any) {
        const errorMessage = { error: "Swap initiation failed", details: error.message };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
