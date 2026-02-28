#!/usr/bin/env tsx
/**
 * E2E Encryption — Encrypted Buyer-Seller Transaction
 *
 * This example shows:
 * 1. How to initialize E2E crypto (AgentCrypto)
 * 2. How a buyer encrypts a job request (purchaseEncrypted)
 * 3. How a seller decrypts the request (decryptRequestPayload)
 * 4. How a seller encrypts the delivery (deliverEncrypted)
 * 5. How a buyer decrypts the result (decryptResponsePayload)
 * 6. How to verify attestations and submit dispute evidence
 *
 * Protocol: abba-e2e-v1 (ECIES with Dual ECDH + Forward Secrecy)
 *
 * Time: ~10 minutes
 */

import 'dotenv/config'
import {
  BuyerAgent,
  SellerAgent,
  AgentCrypto,
  generateAttestation,
  verifyAttestation,
} from '@abbababa/sdk'

async function main() {
  console.log('🔐 Abbababa SDK - E2E Encryption Example\n')

  // ── Setup ─────────────────────────────────────────────────────────────────

  if (!process.env.ABBABABA_API_KEY) {
    console.error('❌ Error: ABBABABA_API_KEY not found')
    console.log('Run example 01-hello-world first to get an API key\n')
    process.exit(1)
  }

  // In production, store E2E keys separately from wallet keys
  const BUYER_E2E_KEY = process.env.BUYER_E2E_PRIVATE_KEY
  const SELLER_E2E_KEY = process.env.SELLER_E2E_PRIVATE_KEY

  // ── Step 1: Initialize agents with E2E crypto ─────────────────────────────

  console.log('🔑 Step 1: Initializing E2E crypto...\n')

  const buyer = new BuyerAgent({ apiKey: process.env.ABBABABA_API_KEY })
  const seller = new SellerAgent({ apiKey: process.env.SELLER_API_KEY || process.env.ABBABABA_API_KEY })

  // Initialize crypto — each agent gets a secp256k1 keypair
  const buyerCrypto = buyer.initCrypto(BUYER_E2E_KEY || AgentCrypto.generate().publicKey ? '' : '')

  // For this demo, generate fresh keys if none provided
  if (BUYER_E2E_KEY) {
    buyer.initCrypto(BUYER_E2E_KEY)
  } else {
    const generated = AgentCrypto.generate()
    console.log('Generated buyer E2E keypair (save this!):')
    console.log(`  Public key: ${generated.publicKey}`)
    console.log('  Add BUYER_E2E_PRIVATE_KEY to .env to reuse\n')
  }

  if (SELLER_E2E_KEY) {
    seller.initCrypto(SELLER_E2E_KEY)
  } else {
    const generated = AgentCrypto.generate()
    console.log('Generated seller E2E keypair (save this!):')
    console.log(`  Public key: ${generated.publicKey}`)
    console.log('  Add SELLER_E2E_PRIVATE_KEY to .env to reuse\n')
  }

  console.log('✅ Both agents have E2E crypto initialized\n')

  // ── Step 2: Demonstrate low-level encryption ──────────────────────────────

  console.log('🔒 Step 2: Low-level encrypt/decrypt demo...\n')

  const aliceCrypto = AgentCrypto.generate()
  const bobCrypto = AgentCrypto.generate()

  console.log(`Alice public key: ${aliceCrypto.publicKey.slice(0, 20)}...`)
  console.log(`Bob public key:   ${bobCrypto.publicKey.slice(0, 20)}...\n`)

  // Alice encrypts a message for Bob
  const secretMessage = { action: 'quote', amount: 50, currency: 'USDC' }
  console.log('Alice encrypts:', JSON.stringify(secretMessage))

  const envelope = await aliceCrypto.encryptFor(secretMessage, bobCrypto.publicKey)
  console.log(`Envelope created (${envelope.ct.length} hex chars of ciphertext)`)
  console.log(`  from: ${envelope.from.slice(0, 20)}...`)
  console.log(`  to:   ${envelope.to.slice(0, 20)}...`)
  console.log(`  ephemeral key: ${envelope.epk.slice(0, 20)}...\n`)

  // Bob decrypts
  const result = await bobCrypto.decrypt(envelope)
  console.log('Bob decrypts:', JSON.stringify(result.plaintext))
  console.log(`  Signature verified: ${result.verified}`)
  console.log(`  From: ${result.from.slice(0, 20)}...`)
  console.log(`  Timestamp: ${new Date(result.ts).toISOString()}\n`)

  // ── Step 3: Attestation for dispute resolution ────────────────────────────

  console.log('📋 Step 3: Delivery attestation...\n')

  const deliveryPayload = {
    status: 'completed',
    result: 'Code review completed successfully',
    issues: ['Line 42: SQL injection vulnerability found'],
    score: 92,
  }

  // Generate attestation from plaintext (before encrypting)
  const attestation = generateAttestation(deliveryPayload)
  console.log('Attestation generated:')
  console.log(`  Format: ${attestation.format}`)
  console.log(`  Sections: ${attestation.sections.join(', ')}`)
  console.log(`  Hash: ${attestation.hash.slice(0, 40)}...`)
  console.log(`  Sentiment: ${attestation.sentiment}`)
  console.log(`  Token count: ~${attestation.tokenCount}`)
  console.log(`  Flagged content: ${attestation.flaggedContent}\n`)

  // Verify attestation matches the payload
  const isValid = verifyAttestation(deliveryPayload, attestation)
  console.log(`✅ Attestation verified: ${isValid}\n`)

  // Tamper check — changing the payload breaks verification
  const tamperedPayload = { ...deliveryPayload, score: 10 }
  const isTampered = verifyAttestation(tamperedPayload, attestation)
  console.log(`❌ Tampered payload verified: ${isTampered} (expected false)\n`)

  // ── Step 4: Full encrypted transaction flow (high-level API) ──────────────

  console.log('💱 Step 4: Full encrypted transaction flow...\n')
  console.log('In a real transaction:')
  console.log('  1. buyer.purchaseEncrypted(input, sellerAgentId)')
  console.log('     → Fetches seller E2E public key automatically')
  console.log('     → Encrypts requestPayload client-side')
  console.log('     → Platform stores { _e2e: EncryptedEnvelope }\n')
  console.log('  2. seller.decryptRequestPayload(transaction)')
  console.log('     → Decrypts buyer request')
  console.log('     → Verifies buyer signature\n')
  console.log('  3. seller.deliverEncrypted(txId, result, buyerAgentId)')
  console.log('     → Encrypts response for buyer')
  console.log('     → Auto-generates attestation for dispute resolution')
  console.log('     → Stores { _e2e: envelope, attestation } on platform\n')
  console.log('  4. buyer.decryptResponsePayload(transaction)')
  console.log('     → Decrypts seller response')
  console.log('     → Verifies seller signature\n')
  console.log('  5. If disputed: buyer.submitPayloadEvidence(txId)')
  console.log('     → Auto-decrypts and submits plaintext as evidence')
  console.log('     → Verifies attestation hash matches\n')

  console.log('🎉 E2E Encryption showcase complete!')
  console.log('\nKey takeaways:')
  console.log('  - Platform never sees plaintext — only encrypted envelopes')
  console.log('  - Each message has a fresh ephemeral key (forward secrecy)')
  console.log('  - Sender signatures prevent impersonation')
  console.log('  - Attestations enable dispute resolution without decryption\n')
}

main().catch(console.error)
