import { NextRequest, NextResponse } from "next/server";
import dbConnect from "~~/app/lib/db/connect";
import HTLC_Monitor from "~~/app/lib/db/models/HTLC_Monitor";

interface RouteContext {
  params: {
    uuid: string;
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  await dbConnect();
  try {
    const { uuid } = context.params;
    const monitor = await HTLC_Monitor.findOne({ swapUuid: uuid });
    if (!monitor) {
      return NextResponse.json({ success: false, message: "HTLC Monitor record not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: monitor }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching HTLC Monitor record by UUID:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Error fetching HTLC Monitor record" },
      { status: 400 },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  await dbConnect();
  try {
    const { uuid } = context.params;
    const body = await request.json();
    const updates: any = {};
    const newEvent: any = {
      timestamp: new Date(),
      status: body.status,
      details: {},
    };

    if (body.status) {
      updates.status = body.status;
    }
    if (body.errorMessage) {
      updates.errorMessage = body.errorMessage;
      newEvent.errorMessage = body.errorMessage;
    }
    if (body.details) {
      newEvent.details = body.details;
    }

    const updatedMonitor = await HTLC_Monitor.findOneAndUpdate(
      { swapUuid: uuid },
      {
        $set: updates,
        $push: { history: newEvent },
      },
      { new: true, runValidators: true },
    );

    if (!updatedMonitor) {
      return NextResponse.json(
        { success: false, message: "HTLC Monitor record not found for update" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: updatedMonitor }, { status: 200 });
  } catch (error: any) {
    console.error("Error updating HTLC Monitor record:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Error updating HTLC Monitor record" },
      { status: 400 },
    );
  }
}
