import { NextRequest, NextResponse } from "next/server";
import { closeXrplHtlc } from "~~/services/core/finish/xrpl-htlc-closer";

interface RouteContext {
  params: Promise<{
    uuid: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  // Ahora obtenemos el uuid directamente de los parámetros de la URL
  const { uuid } = await context.params;

  // Implementa Server-Sent Events (SSE) para el progreso si lo deseas,
  // similar a tu endpoint POST original. Por simplicidad, aquí usaré
  // una respuesta JSON estándar, pero puedes adaptarlo.

  const sendProgress = (message: string) => {
    // Puedes enviar esto a un logger o a un WebSocket para actualizaciones en tiempo real
    console.log(`[XRPL Closer Progress for UUID ${uuid}]: ${message}`);
    // Si quisieras SSE aquí también, deberías ajustar la función POST para usar ReadableStream
    // como lo haces en tu `api/cross-chain-htlc-swaps/route.ts`.
  };

  try {
    if (!uuid) {
      // Aunque el enrutamiento debería asegurar que uuid esté presente, es una buena práctica
      // tener una validación aquí por si acaso.
      return NextResponse.json({ error: "Missing required parameter: uuid" }, { status: 400 });
    }

    sendProgress(`Attempting to close XRPL HTLC for UUID: ${uuid}`);

    const result = await closeXrplHtlc(uuid, sendProgress);

    if (!result) {
      // closeXrplHtlc ya debería haber registrado el error internamente.
      return NextResponse.json({ error: "Failed to close XRPL HTLC. Check server logs for details." }, { status: 500 });
    }

    sendProgress(`XRPL HTLC Closed Successfully! Transaction Hash: ${result.xrplFinishTxHash}`);

    return NextResponse.json(
      {
        message: "XRPL HTLC closed successfully!",
        uuid,
        xrplFinishTxHash: result.xrplFinishTxHash,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error(`[API Error /close-xrpl-escrow/${uuid}]: ${error.message}`); // Añadido uuid al log de error
    return NextResponse.json(
      {
        error: "Error processing request to close XRPL HTLC",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
