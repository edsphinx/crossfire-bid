import { NextRequest, NextResponse } from "next/server";
import { resolveEvmEscrow } from "../../../../services/core/finish/evm-resolver_v4";

export async function POST(request: NextRequest) {
  try {
    // For simplicity, we'll hardcode the test UUID and action here.
    // In a real scenario, you might pass this in the request body.
    const params = await request;
    console.log(params);
    const testUuid = "db0f3d01-9874-4c1a-9edd-ad6093ac7e2d";
    const actionToPerform: "claim" | "refund" = "claim";

    console.log(`--- [API] Starting Test Resolution for UUID: ${testUuid} (Action: ${actionToPerform}) ---`);

    const result = await resolveEvmEscrow(testUuid, actionToPerform);

    if (result) {
      console.log(`--- [API] Test Resolution Successful ---`);
      return NextResponse.json({ success: true, data: result }, { status: 200 });
    } else {
      console.error(`--- [API] Test Resolution Failed ---`);
      return NextResponse.json({ success: false, message: "EVM Escrow resolution test failed" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Error in test-resolver API:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
