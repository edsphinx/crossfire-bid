import { ChainType } from "./CrossChainHtlcSwap";
import mongoose, { Document, Model, Schema } from "mongoose";

export interface IMonitorEvent {
  timestamp: Date;
  status: "PENDING" | "RESOLVED" | "CANCELED" | "FAILED";
  details: Record<string, any>;
  errorMessage?: string;
}

export interface IHTLC_Monitor extends Document {
  swapUuid: string;
  chainType: ChainType;
  status: "PENDING" | "RESOLVED" | "CANCELED" | "FAILED";
  txHash: string;
  secretHash: string;
  timelock: number;
  lastCheckedAt: Date;
  retryCount: number;
  errorMessage?: string;
  history: IMonitorEvent[];
}

const MonitorEventSchema: Schema = new Schema(
  {
    timestamp: { type: Date, required: true, default: Date.now },
    status: { type: String, required: true, enum: ["PENDING", "RESOLVED", "CANCELED", "FAILED"] },
    details: { type: Object, default: {} },
    errorMessage: { type: String },
  },
  { _id: false },
);

const HTLC_MonitorSchema: Schema = new Schema(
  {
    swapUuid: { type: String, required: true, index: true },
    chainType: { type: String, required: true, enum: ["EVM", "XRPL", "SOLANA", "COSMOS", "OTHER"] },
    status: { type: String, required: true, enum: ["PENDING", "RESOLVED", "CANCELED", "FAILED"] },
    txHash: { type: String, required: true, unique: true },
    secretHash: { type: String, required: true },
    timelock: { type: Number, required: true },
    lastCheckedAt: { type: Date, default: Date.now },
    retryCount: { type: Number, default: 0 },
    errorMessage: { type: String },
    history: { type: [MonitorEventSchema], default: [] },
  },
  {
    timestamps: true,
  },
);

const HTLC_Monitor: Model<IHTLC_Monitor> =
  mongoose.models.HTLC_Monitor || mongoose.model<IHTLC_Monitor>("HTLC_Monitor", HTLC_MonitorSchema);

export default HTLC_Monitor;
