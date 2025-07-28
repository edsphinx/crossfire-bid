// --- Mongoose Schema and Model ---
// Consider placing this in packages/nextjs/lib/db/models/CrossChainHtlcSwap.ts
import mongoose, { Document, Model, Schema } from "mongoose";

// Define possible statuses for the swap workflow
export type SwapStatus =
  | "INITIATED" // Initial record creation
  | "EVM_ORDER_CREATED" // EVM order/escrow created
  | "NON_EVM_ESCROW_LOCKED" // Non-EVM HTLC/escrow created
  | "SECRET_REVEALED" // Secret has been revealed/preimage is known
  | "EVM_CLAIMED" // Funds claimed on EVM side
  | "NON_EVM_CLAIMED" // Funds claimed on Non-EVM side
  | "COMPLETED" // Both sides claimed, swap is done
  | "EVM_REFUNDED" // EVM side refunded due to expiry/failure
  | "NON_EVM_REFUNDED" // Non-EVM side refunded
  | "FAILED"; // General failure state

export type ChainType = "EVM" | "XRPL" | "SOLANA" | "COSMOS" | "OTHER"; // Extend as needed

export interface ISwapEvent {
  timestamp: Date;
  status: SwapStatus; // The status at the time of this event
  txHash?: string; // Transaction hash associated with this event (could be EVM or Non-EVM)
  chainType?: ChainType; // Which chain this event pertains to (EVM, XRPL, etc.)
  details: Record<string, any>; // Any specific details for this event (e.g., "secret revealed", "escrow ID confirmed")
  errorMessage?: string; // If this event signifies an error
  // Add other relevant fields for an event
}

export interface ICrossChainHtlcSwap extends Document {
  uuid: string; // Renamed from swapId for clarity, still using uuidv4
  status: SwapStatus; // Renamed from overallStatus
  makerEVMAddress: string;
  takerEVMAddress: string;
  makerNonEVMAddress: string; // Renamed for universality
  takerNonEVMAddress: string; // Renamed for universality
  makerEVMTokenAddress: string;
  amountEVM: string;
  amountNonEVM: string; // Renamed for universality

  secretHash: string; // The SHA256 hash of the secret (from the HTLC)
  secret?: string; // The actual secret (preimage), should be encrypted in production!

  // Chain-specific data
  evmChainId: string; // e.g., 'sepolia', 'mainnet', '1', '11155111'
  nonEVMChainType: ChainType; // e.g., 'XRPL', 'SOLANA', 'ICP'

  // Non-EVM specific details (flexible for different non-EVM chains)
  nonEVMDetails?: {
    [key: string]: any; // e.g., { xrplEscrowID: '...', xrplCondition: '...' }
  };

  // Transaction hashes (can be universal)
  evmTxHash?: string; // For EVM order/escrow creation
  nonEVMTxHash?: string; // For Non-EVM HTLC/escrow creation
  evmClaimTxHash?: string;
  nonEVMClaimTxHash?: string;

  // Sequence numbers
  nonEVMSequence?: number; // For XRP Ledger OfferSequence

  // Timelocks
  evmTimelock?: number; // Unix timestamp
  evmPublicWithdrawTimelock?: number; // Unix timestamp for public withdrawal
  nonEVMTimelock?: number; // Unix timestamp

  // Error logging
  errorMessage?: string;

  // To store the history of events/state changes
  history: ISwapEvent[];

  // Mongoose automatically adds these if `timestamps: true` is used
  createdAt: Date;
  updatedAt: Date;
}

const SwapEventSchema: Schema = new Schema(
  {
    timestamp: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      required: true,
      enum: [
        "INITIATED",
        "EVM_ORDER_CREATED",
        "NON_EVM_ESCROW_LOCKED",
        "SECRET_REVEALED",
        "EVM_CLAIMED",
        "NON_EVM_CLAIMED",
        "COMPLETED",
        "EVM_REFUNDED",
        "NON_EVM_REFUNDED",
        "FAILED",
      ],
    },
    txHash: { type: String },
    chainType: { type: String, enum: ["EVM", "XRPL", "SOLANA", "COSMOS", "OTHER"] },
    details: { type: Object, default: {} },
    errorMessage: { type: String },
  },
  { _id: false },
);

const CrossChainHtlcSwapSchema: Schema = new Schema(
  {
    uuid: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      required: true,
      enum: [
        "INITIATED",
        "EVM_ORDER_CREATED",
        "NON_EVM_ESCROW_LOCKED",
        "SECRET_REVEALED",
        "EVM_CLAIMED",
        "NON_EVM_CLAIMED",
        "COMPLETED",
        "EVM_REFUNDED",
        "NON_EVM_REFUNDED",
        "FAILED",
      ],
    },
    makerEVMAddress: { type: String, required: true },
    takerEVMAddress: { type: String, required: true },
    makerNonEVMAddress: { type: String, required: true },
    takerNonEVMAddress: { type: String, required: true },
    makerEVMTokenAddress: { type: String, required: true },
    amountEVM: { type: String, required: true },
    amountNonEVM: { type: String, required: true },

    secretHash: { type: String, required: true, unique: true },
    secret: { type: String }, // Mark as optional, and remember encryption!

    evmChainId: { type: String, required: true },
    nonEVMChainType: { type: String, required: true, enum: ["XRPL", "SOLANA", "COSMOS", "OTHER"] },
    nonEVMDetails: { type: Object }, // Store as a generic object

    evmTxHash: { type: String },
    nonEVMTxHash: { type: String },
    evmClaimTxHash: { type: String },
    nonEVMClaimTxHash: { type: String },

    nonEVMSequence: { type: Number },

    evmTimelock: { type: Number },
    evmPublicWithdrawTimelock: { type: Number },
    nonEVMTimelock: { type: Number },

    errorMessage: { type: String },

    history: {
      type: [SwapEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, getters: true, minimize: false },
    toObject: { virtuals: true, getters: true, minimize: false },
  },
);

// Use mongoose.models.CrossChainHtlcSwap for direct access
const CrossChainHtlcSwap: Model<ICrossChainHtlcSwap> =
  mongoose.models.CrossChainHtlcSwap ||
  mongoose.model<ICrossChainHtlcSwap>("CrossChainHtlcSwap", CrossChainHtlcSwapSchema);

export default CrossChainHtlcSwap;
