import { NextRequest, NextResponse } from "next/server";
import { closeEvmEscrow } from "~~/services/core/evm-resolver";

// Importa la función para cerrar el escrow EVM

export async function POST(request: NextRequest, { params }: { params: { uuid: string } }) {
  // Obtenemos el uuid directamente de los parámetros de la URL
  const { uuid } = await params;

  // El cuerpo de la solicitud POST debe contener la acción (claim o refund)
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    return NextResponse.json({ error: `Invalid JSON body ${error}` }, { status: 400 });
  }

  const { action } = requestBody;

  // Función para enviar mensajes de progreso (puedes adaptarla para SSE o WebSockets)
  const sendProgress = (message: string) => {
    console.log(`[EVM Closer Progress for UUID ${uuid}]: ${message}`);
    // Si quisieras SSE aquí, deberías ajustar la función POST para usar ReadableStream.
    // Por simplicidad, solo se loguea en la consola.
  };

  try {
    if (!uuid) {
      return NextResponse.json({ error: "Missing required parameter: uuid" }, { status: 400 });
    }
    if (action !== "claim" && action !== "refund") {
      return NextResponse.json({ error: "Invalid action. Must be 'claim' or 'refund'." }, { status: 400 });
    }

    sendProgress(`Attempting to ${action} EVM HTLC for UUID: ${uuid}`);

    // Llama a la función closeEvmEscrow con el UUID y la acción
    const result = await closeEvmEscrow(uuid, action, sendProgress);

    if (!result) {
      // closeEvmEscrow ya debería haber registrado el error internamente.
      return NextResponse.json(
        { error: `Failed to ${action} EVM HTLC. Check server logs for details.` },
        { status: 500 },
      );
    }

    sendProgress(`EVM HTLC ${result.action} Successfully! Transaction Hash: ${result.evmFinishTxHash}`);

    return NextResponse.json(
      {
        message: `EVM HTLC ${result.action} successfully!`,
        uuid,
        evmFinishTxHash: result.evmFinishTxHash,
        action: result.action,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error(`[API Error /close-evm-escrow/${uuid}]: ${error.message}`);
    return NextResponse.json(
      {
        error: `Error processing request to ${action} EVM HTLC`,
        details: error.message,
      },
      { status: 500 },
    );
  }
}
