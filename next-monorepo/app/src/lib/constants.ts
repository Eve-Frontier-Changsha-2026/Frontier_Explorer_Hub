export const SUI_NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";
export const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ?? "0x0";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export const SHARED_OBJECTS = {
  subscriptionConfig: process.env.NEXT_PUBLIC_SUBSCRIPTION_CONFIG_ID ?? "0x0",
  pricingTable: process.env.NEXT_PUBLIC_PRICING_TABLE_ID ?? "0x0",
  pluginRegistry: process.env.NEXT_PUBLIC_PLUGIN_REGISTRY_ID ?? "0x0",
  marketConfig: process.env.NEXT_PUBLIC_MARKET_CONFIG_ID ?? "0x0",
} as const;

export const INTEL_TYPES = {
  RESOURCE: 0,
  THREAT: 1,
  WRECKAGE: 2,
  POPULATION: 3
} as const;

export const INTEL_TYPE_LABELS: Record<number, string> = {
  0: "Resource",
  1: "Threat",
  2: "Wreckage",
  3: "Population"
};

export const TIERS = {
  FREE: 0,
  PREMIUM: 1
} as const;

export const TIER_LIMITS = {
  [TIERS.FREE]: { maxZoom: 1, rateLimit: 10, delayMs: 30 * 60 * 1000 },
  [TIERS.PREMIUM]: { maxZoom: 2, rateLimit: 100, delayMs: 0 }
} as const;

export const MIN_SUBMIT_DEPOSIT_MIST = 10_000_000;

export const BOUNTY_ESCROW_PACKAGE_ID = process.env.NEXT_PUBLIC_BOUNTY_ESCROW_PACKAGE_ID ?? "0x0";
export const SUI_TYPE = "0x2::sui::SUI";
export const CLOCK_ID = "0x6";
export const REVIEW_PERIOD_MS = 259_200_000; // 72 hours

export const BOUNTY_STATUS = {
  OPEN: 0,
  CLAIMED: 1,
  PROOF_SUBMITTED: 2,
  PROOF_REJECTED: 3,
  DISPUTED: 4,
  COMPLETED: 5,
} as const;

export const BOUNTY_STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Claimed",
  2: "Proof Submitted",
  3: "Rejected",
  4: "Disputed",
  5: "Completed",
};
