#!/usr/bin/env tsx
/**
 * Session Keys — Delegate Operations to Autonomous Agents
 *
 * This example shows:
 * 1. How an operator creates a session with budget caps
 * 2. How to serialize a session bundle for an agent process
 * 3. How an agent initializes from a session bundle
 * 4. How session wallets enforce hard spending limits
 * 5. How to reclaim remaining funds after session expires
 *
 * Security model:
 * - Session wallet = ephemeral EOA (blockchain-enforced hard cap)
 * - Session token = API-enforced soft cap (budget, allowed services, expiry)
 * - Session E2E keypair = fresh secp256k1 for encrypted payloads
 * - Treat serialized bundles like private keys — never log or transmit insecurely
 *
 * Time: ~10 minutes
 */

import 'dotenv/config'
import { BuyerAgent, SellerAgent } from '@abbababa/sdk'

async function main() {
  console.log('🔑 Abbababa SDK - Session Keys Example\n')

  if (!process.env.ABBABABA_API_KEY) {
    console.error('❌ Error: ABBABABA_API_KEY not found')
    console.log('Run example 01-hello-world first to get an API key\n')
    process.exit(1)
  }

  // ── Step 1: Operator creates a session ────────────────────────────────────

  console.log('👤 Step 1: Operator creates a buyer session...\n')

  const operator = new BuyerAgent({
    apiKey: process.env.ABBABABA_API_KEY,
  })

  // Initialize operator's main wallet (needed to fund the session)
  if (process.env.PRIVATE_KEY) {
    await operator.initEOAWallet(process.env.PRIVATE_KEY, 'baseSepolia')
    console.log(`Operator wallet: ${operator.getWalletAddress()}\n`)
  }

  // Create a session with constraints
  const session = await operator.createSession({
    budgetUsdc: 50,                         // $50 max spending
    expiry: 3600,                           // 1 hour lifetime
    allowedServiceIds: ['svc_code_review'], // Optional: restrict to specific services
  })

  console.log('✅ Session created!')
  console.log(`  Session ID: ${session.sessionId}`)
  console.log(`  Wallet: ${session.walletAddress}`)
  console.log(`  Budget: $${session.budgetUsdc} USDC`)
  console.log(`  Expires: ${new Date(session.expiry * 1000).toISOString()}`)
  console.log(`  E2E Public Key: ${session.e2ePublicKey.slice(0, 20)}...\n`)

  // ── Step 2: Serialize the bundle ──────────────────────────────────────────

  console.log('📦 Step 2: Serializing session bundle...\n')

  const bundle = session.serialize()
  console.log(`Bundle: ${bundle.slice(0, 50)}...`)
  console.log(`Length: ${bundle.length} chars`)
  console.log('Prefix: abba_session_bundle_...\n')

  console.log('⚠️  SECURITY: Treat this bundle like a private key!')
  console.log('  - Never log it in production')
  console.log('  - Pass via env var or encrypted channel')
  console.log('  - Bundle contains: session wallet key + E2E key + API token\n')

  // ── Step 3: Fund the session wallet ───────────────────────────────────────

  console.log('💰 Step 3: Funding session wallet...\n')

  if (process.env.PRIVATE_KEY) {
    console.log(`Transferring $${session.budgetUsdc} USDC to session wallet...`)
    console.log(`  From: ${operator.getWalletAddress()}`)
    console.log(`  To:   ${session.walletAddress}\n`)

    try {
      const txHash = await operator.fundSession(session)
      console.log(`✅ Session funded! TX: ${txHash.slice(0, 20)}...\n`)
    } catch (error) {
      console.log('⚠️  Funding skipped (insufficient balance or testnet issue)')
      console.log('  In production, fund before passing the bundle to the agent\n')
    }
  } else {
    console.log('⚠️  PRIVATE_KEY not set — skipping funding step')
    console.log('  In production: operator.fundSession(session) transfers USDC + ETH\n')
  }

  // ── Step 4: Agent initializes from bundle ─────────────────────────────────

  console.log('🤖 Step 4: Agent process initializes from bundle...\n')
  console.log('(In production, this runs in a separate process)\n')

  // The agent receives the bundle string (e.g., via env var)
  const agentBuyer = new BuyerAgent({
    apiKey: session.token, // Session token acts as API key
  })

  // Single call sets up: EOA wallet + E2E crypto
  await agentBuyer.initWithSession(bundle)

  console.log('✅ Agent initialized from session bundle!')
  console.log(`  Wallet: ${agentBuyer.getWalletAddress()}`)
  console.log(`  E2E crypto: ${agentBuyer.crypto ? 'ready' : 'not initialized'}`)
  console.log(`  Gas strategy: ${agentBuyer.getGasStrategy()}\n`)

  console.log('The agent can now:')
  console.log('  - Search for services (agentBuyer.findServices(...))')
  console.log('  - Purchase with encryption (agentBuyer.purchaseEncrypted(...))')
  console.log('  - Fund escrow on-chain (agentBuyer.fundAndVerify(...))')
  console.log('  - Decrypt responses (agentBuyer.decryptResponsePayload(...))\n')

  // ── Step 5: Seller sessions ───────────────────────────────────────────────

  console.log('🛍️  Step 5: Seller session (for delivery delegation)...\n')

  const sellerOperator = new SellerAgent({
    apiKey: process.env.SELLER_API_KEY || process.env.ABBABABA_API_KEY,
  })

  // Seller sessions are simpler — no budget or platform token needed
  const sellerSession = await sellerOperator.createSession({
    expiry: 7200, // 2 hours
  })

  console.log('✅ Seller session created!')
  console.log(`  Wallet: ${sellerSession.walletAddress}`)
  console.log(`  Expires: ${new Date(sellerSession.expiry * 1000).toISOString()}\n`)

  const sellerBundle = sellerSession.serialize()

  // Delegated seller agent
  const agentSeller = new SellerAgent({
    apiKey: process.env.SELLER_API_KEY || process.env.ABBABABA_API_KEY,
  })
  await agentSeller.initWithSession(sellerBundle)

  console.log('✅ Seller agent initialized from session!')
  console.log(`  Wallet: ${agentSeller.getWalletAddress()}`)
  console.log(`  E2E crypto: ${agentSeller.crypto ? 'ready' : 'not initialized'}\n`)

  console.log('The seller agent can now:')
  console.log('  - Decrypt buyer requests (agentSeller.decryptRequestPayload(...))')
  console.log('  - Submit delivery on-chain (agentSeller.submitDelivery(...))')
  console.log('  - Deliver encrypted results (agentSeller.deliverEncrypted(...))\n')

  // ── Step 6: Reclaim funds after session ───────────────────────────────────

  console.log('♻️  Step 6: Reclaiming session funds...\n')

  console.log('After the session expires, reclaim remaining USDC:')
  console.log('```')
  console.log('const reclaimer = new BuyerAgent({ apiKey: session.token })')
  console.log('await reclaimer.initWithSession(bundle)')
  console.log(`await reclaimer.reclaimSession('${operator.getWalletAddress() || '0xMAIN_WALLET'}')`)
  console.log('```\n')

  console.log('This sweeps all remaining USDC back to the main wallet.\n')

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('🎉 Session Keys showcase complete!\n')
  console.log('Session lifecycle:')
  console.log('  1. operator.createSession({ budget, expiry, allowedServices })')
  console.log('  2. operator.fundSession(session)  // USDC + ETH to session wallet')
  console.log('  3. bundle = session.serialize()    // pass to agent process')
  console.log('  4. agent.initWithSession(bundle)   // wallet + crypto ready')
  console.log('  5. agent operates autonomously within constraints')
  console.log('  6. agent.reclaimSession(mainAddr)  // sweep remaining funds\n')

  console.log('Security layers:')
  console.log('  - Blockchain: session wallet can only spend what it holds')
  console.log('  - API: session token enforces budget, allowed services, expiry')
  console.log('  - Crypto: fresh E2E keypair per session (no key reuse)')
  console.log('  - Time: sessions auto-expire after configured lifetime\n')
}

main().catch(console.error)
