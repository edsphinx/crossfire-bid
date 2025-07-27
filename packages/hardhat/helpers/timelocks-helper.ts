/**
 * @module TimelocksHelper
 * @description A helper module for packing and unpacking 1inch Fusion+ Timelocks.
 *              The Timelocks struct is a uint256 that compactly stores various
 *              timestamps related to the escrow's lifecycle.
 *              Each timestamp is stored as an offset (uint32) from the contract's
 *              deployment timestamp (deployedAt), which is stored in the highest 32 bits.
 *
 *              The structure of the packed uint256 is (from most significant to least significant bits):
 *              [deployedAt (32 bits)]
 *              [DstCancellation (32 bits)]
 *              [DstPublicWithdrawal (32 bits)]
 *              [DstWithdrawal (32 bits)]
 *              [SrcPublicCancellation (32 bits)]
 *              [SrcCancellation (32 bits)]
 *              [SrcPublicWithdrawal (32 bits)]
 *              [SrcWithdrawal (32 bits)]
 *
 *              Each stage's timestamp is an offset from `deployedAt`.
 *              `actual_timestamp = deployedAt + stored_offset_for_stage`
 *              So, `stored_offset = actual_timestamp - deployedAt`.
 *              These offsets must fit within a `uint32`.
 */

export enum TimelockStage {
  SrcWithdrawal = 0,
  SrcPublicWithdrawal = 1,
  SrcCancellation = 2,
  SrcPublicCancellation = 3,
  DstWithdrawal = 4,
  DstPublicWithdrawal = 5,
  DstCancellation = 6,
}

const DEPLOYED_AT_OFFSET = 224n; // Use bigint literal
const STAGE_BITS = 32n; // Use bigint literal
const UINT32_MAX = 0xffffffffn; // Use bigint literal

/**
 * Packs individual timelock timestamps into a single bigint (uint256)
 * according to the 1inch TimelocksLib.sol packing strategy.
 *
 * @param deployedAt The timestamp (in seconds) when the escrow contract was deployed.
 * @param timelocks An object containing the actual timestamps (in seconds) for each stage.
 *                  Timestamps should be greater than or equal to `deployedAt`.
 * @returns The packed Timelocks bigint (uint256).
 * @throws Error if any offset exceeds uint32 max value.
 */
export function packTimelocks(
  deployedAt: number,
  timelocks: {
    srcWithdrawal?: number;
    srcPublicWithdrawal?: number;
    srcCancellation?: number;
    srcPublicCancellation?: number;
    dstWithdrawal?: number;
    dstPublicWithdrawal?: number;
    dstCancellation?: number;
  },
): bigint {
  let packedValue = 0n; // Use bigint literal

  // Pack deployedAt into the highest 32 bits
  packedValue |= BigInt(deployedAt) << DEPLOYED_AT_OFFSET;

  // Pack each stage's offset from deployedAt
  const stages = [
    { stage: TimelockStage.SrcWithdrawal, value: timelocks.srcWithdrawal },
    { stage: TimelockStage.SrcPublicWithdrawal, value: timelocks.srcPublicWithdrawal },
    { stage: TimelockStage.SrcCancellation, value: timelocks.srcCancellation },
    { stage: TimelockStage.SrcPublicCancellation, value: timelocks.srcPublicCancellation },
    { stage: TimelockStage.DstWithdrawal, value: timelocks.dstWithdrawal },
    { stage: TimelockStage.DstPublicWithdrawal, value: timelocks.dstPublicWithdrawal },
    { stage: TimelockStage.DstCancellation, value: timelocks.dstCancellation },
  ];

  for (const { stage, value } of stages) {
    if (value !== undefined) {
      const offset = value - deployedAt;
      if (offset < 0 || BigInt(offset) > UINT32_MAX) {
        // Check if offset fits in uint32 using bigint
        throw new Error(`Timelock offset for stage ${TimelockStage[stage]} (${offset}) exceeds uint32 max value.`);
      }
      packedValue |= BigInt(offset) << (BigInt(stage) * STAGE_BITS);
    }
  }

  return packedValue;
}

/**
 * Unpacks a packed Timelocks bigint (uint256) into individual timestamps.
 * This function is primarily for debugging and verification.
 *
 * @param packedTimelocks The packed Timelocks bigint (uint256).
 * @returns An object containing the unpacked timestamps.
 */
export function unpackTimelocks(packedTimelocks: bigint): {
  deployedAt: number;
  srcWithdrawal?: number;
  srcPublicWithdrawal?: number;
  srcCancellation?: number;
  srcPublicCancellation?: number;
  dstWithdrawal?: number;
  dstPublicWithdrawal?: number;
  dstCancellation?: number;
} {
  const deployedAt = Number((packedTimelocks >> DEPLOYED_AT_OFFSET) & UINT32_MAX);
  const unpacked: { [key: string]: number | undefined } = { deployedAt };

  const stages = [
    TimelockStage.SrcWithdrawal,
    TimelockStage.SrcPublicWithdrawal,
    TimelockStage.SrcCancellation,
    TimelockStage.SrcPublicCancellation,
    TimelockStage.DstWithdrawal,
    TimelockStage.DstPublicWithdrawal,
    TimelockStage.DstCancellation,
  ];

  for (const stage of stages) {
    const offset = Number((packedTimelocks >> (BigInt(stage) * STAGE_BITS)) & UINT32_MAX);
    if (offset !== 0) {
      // Only include if a value was packed
      unpacked[TimelockStage[stage]] = deployedAt + offset;
    }
  }

  return unpacked as any; // Cast to any for simpler return type
}
