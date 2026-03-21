import 'dotenv/config';

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  // Sui RPC
  suiRpcUrl: requireEnv('SUI_RPC_URL', 'https://fullnode.testnet.sui.io:443'),
  packageId: requireEnv('PACKAGE_ID', '0x0'),
  adminCapId: process.env['ADMIN_CAP_ID'] ?? '',

  // EVE EYES
  eveEyesBaseUrl: requireEnv('EVE_EYES_BASE_URL', 'https://eve-eyes.d0v.xyz'),
  eveEyesApiKey: process.env['EVE_EYES_API_KEY'] ?? '',
  eveWorldPackageId: requireEnv(
    'EVE_WORLD_PACKAGE_ID',
    '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75',
  ),

  // API Server
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  jwtSecret: requireEnv('JWT_SECRET', 'dev-secret-change-me'),

  // Aggregation
  kAnonymityThreshold: parseInt(process.env['K_ANONYMITY_THRESHOLD'] ?? '3', 10),
  freeTierDelayMs: parseInt(process.env['FREE_TIER_DELAY_MS'] ?? '1800000', 10),
  aggregationIntervalMs: parseInt(process.env['AGGREGATION_INTERVAL_MS'] ?? '300000', 10),
  eveEyesPollIntervalMs: parseInt(process.env['EVE_EYES_POLL_INTERVAL_MS'] ?? '300000', 10),

  // Rate limits
  freeRateLimit: 10,   // req/min
  premiumRateLimit: 100, // req/min
} as const;
