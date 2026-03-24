# Testnet Deployment Guide

## 1. Move Contract (DONE)

See `testnet-artifacts.json` for all deployed object IDs.

## 2. Services — Railway

### Prerequisites
- Railway CLI: `npm i -g @railway/cli && railway login`
- Or use Railway dashboard

### Steps

```bash
# From project root
cd services

# Create Railway project
railway init

# Add persistent volume (mount at /data)
railway volume add --mount /data

# Set env vars (use Railway dashboard or CLI)
railway variables set \
  SUI_RPC_URL=https://fullnode.testnet.sui.io:443 \
  PACKAGE_ID=0x32817b67b1f016457cd4133f389e02795e8038d18b135949c6c3187c50de6a2e \
  BOUNTY_ESCROW_PACKAGE_ID=0x5357556af095edf9ff7f8481d384e10266758f746b0f2aafde0805a9415f521c \
  ADMIN_CAP_ID=0x687c5098dfc974e1f7bc0b1da1b343a86f9e832e1fd9db2040552167c532e807 \
  EVE_EYES_BASE_URL=https://eve-eyes.d0v.xyz \
  EVE_WORLD_PACKAGE_ID=0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75 \
  DB_PATH=/data/explorer-hub.db \
  PORT=3001 \
  NODE_ENV=production

# Deploy
railway up
```

Railway will auto-detect the Dockerfile and build.

### After deploy
- Note the Railway public URL (e.g., `https://xxx.up.railway.app`)
- This URL goes into the frontend as `NEXT_PUBLIC_API_BASE_URL`

## 3. Frontend — Vercel

### Steps

1. Push repo to GitHub (if not already)
2. Import project in Vercel dashboard
   - Root Directory: `next-monorepo/app`
   - Framework: Next.js (auto-detected)
3. Set environment variables:

```
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_PACKAGE_ID=0x32817b67b1f016457cd4133f389e02795e8038d18b135949c6c3187c50de6a2e
NEXT_PUBLIC_BOUNTY_ESCROW_PACKAGE_ID=0x5357556af095edf9ff7f8481d384e10266758f746b0f2aafde0805a9415f521c
NEXT_PUBLIC_API_BASE_URL=https://YOUR_RAILWAY_URL.up.railway.app
NEXT_PUBLIC_SUBSCRIPTION_CONFIG_ID=0x3aaab9b17c92dadcf6f72af6716274d77af47b8dc92cadeaf20ddd7b723a279e
NEXT_PUBLIC_PRICING_TABLE_ID=0x10a4fde331aa9d69468fa39b8809437a7968eb08be48324b200883f22f230789
NEXT_PUBLIC_PLUGIN_REGISTRY_ID=0xcb802a7d8cee7cea96527b45d73e8a669882291b53b0b51e169e16159b38a3d2
NEXT_PUBLIC_MARKET_CONFIG_ID=0x25de4d8d38374d8db46e79bb26780b90890595e1884081307d4403956d83d080
```

4. Deploy

## 4. Post-deploy Verification

- [ ] Services health: `curl https://YOUR_RAILWAY_URL/api/health`
- [ ] Indexer running: check Railway logs for `[main] EventIndexer started`
- [ ] Frontend loads: visit Vercel URL
- [ ] Wallet connect: connect Sui wallet on testnet
- [ ] Submit intel: test basic flow end-to-end
