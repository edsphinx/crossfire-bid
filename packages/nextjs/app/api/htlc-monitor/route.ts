import { NextRequest, NextResponse } from "next/server";
import dbConnect from "~~/app/lib/db/connect";
import HTLC_Monitor from "~~/app/lib/db/models/HTLC_Monitor";

export async function POST(request: NextRequest) {
  await dbConnect();

  try {
    const body = await request.json();
    const newMonitor = new HTLC_Monitor(body);
    await newMonitor.save();
    return NextResponse.json({ success: true, data: newMonitor }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating HTLC monitor record:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Error creating HTLC monitor record" },
      { status: 400 },
    );
  }
}

export async function GET() {
  await dbConnect();
  try {
    const monitors = await HTLC_Monitor.find({});
    return NextResponse.json({ success: true, data: monitors }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching HTLC monitor records:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Error fetching HTLC monitor records" },
      { status: 400 },
    );
  }
}
