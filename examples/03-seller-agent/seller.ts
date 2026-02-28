#!/usr/bin/env tsx
/**
 * Seller Agent - List Service and Handle Purchases
 *
 * This example shows:
 * 1. How to list a service
 * 2. How to poll for purchases
 * 3. How to submit delivery proofs
 * 4. How to get paid
 *
 * Time: ~15 minutes
 */

import 'dotenv/config'
import { SellerAgent } from '@abbababa/sdk'
import { keccak256, toBytes } from 'viem'

async function main() {
  console.log('🛍️  Abbababa SDK - Seller Agent Example\n')

  // Validate environment
  if (!process.env.ABBABABA_API_KEY) {
    console.error('❌ Error: ABBABABA_API_KEY not found')
    console.log('Run example 01-hello-world first\n')
    process.exit(1)
  }

  if (!process.env.PRIVATE_KEY) {
    console.error('❌ Error: PRIVATE_KEY not found in .env file\n')
    process.exit(1)
  }

  // Initialize seller agent
  const seller = new SellerAgent({
    apiKey: process.env.ABBABABA_API_KEY,
  })

  console.log('✅ Seller agent initialized\n')

  // Step 1: List a service
  console.log('📝 Step 1: Listing a service...\n')

  try {
    const service = await seller.listService({
      title: 'AI Code Review',
      description: 'Automated code review with security analysis and best practices recommendations',
      category: 'coding',
      price: 5.00,
      priceUnit: 'per_request',
      currency: 'USDC',
      endpointUrl: 'https://my-agent.com/deliver', // Your delivery endpoint
    })

    console.log('✅ Service listed!')
    console.log(`Service ID: ${service.id}`)
    console.log(`Title: ${service.title}`)
    console.log(`Price: $${service.price} ${service.currency}`)
    console.log(`\nYour service will be discoverable via search within ~2 minutes.\n`)

  } catch (error) {
    console.error('❌ Error listing service:', error)
    process.exit(1)
  }

  // Step 2: Initialize wallet for on-chain delivery proofs
  console.log('🔐 Step 2: Initializing wallet for delivery proofs...\n')

  await seller.initEOAWallet(process.env.PRIVATE_KEY!)

  console.log('✅ Wallet initialized\n')

  // Step 3: Poll for purchases (simulation)
  console.log('👀 Step 3: Polling for purchases...')
  console.log('(Press Ctrl+C to stop)\n')

  console.log('Waiting for buyers to purchase your service...')
  console.log('Tip: Run example 02-buyer-agent in another terminal\n')

  let purchaseCount = 0

  try {
    for await (const transaction of seller.pollForPurchases()) {
      purchaseCount++

      console.log(`\n🎉 New purchase received! (#${purchaseCount})`)
      console.log(`Transaction ID: ${transaction.id}`)
      console.log(`Buyer: ${transaction.buyerId}`)
      console.log(`Amount: $${transaction.amount} ${transaction.currency}`)
      console.log(`Request payload:`, transaction.requestPayload || '(none)')

      // Step 4: Do the work (simulation)
      console.log('\n💼 Processing request...')
      await sleep(2000) // Simulate work

      const deliveryData = {
        status: 'completed',
        result: 'Code review completed successfully',
        issues: [
          'Line 42: Potential SQL injection vulnerability',
          'Line 67: Consider using async/await instead of callbacks'
        ],
        score: 85,
        timestamp: new Date().toISOString(),
      }

      console.log('✅ Work completed!')

      // Step 5: Submit delivery proof on-chain
      console.log('\n📤 Submitting delivery proof on-chain...')

      const proofHash = keccak256(toBytes(JSON.stringify(deliveryData)))

      // First deliver via API (stores result off-chain)
      await seller.deliver(transaction.id, deliveryData)
      // Then submit proof hash on-chain (seller signs directly)
      await seller.submitDelivery(transaction.id, proofHash)

      console.log('✅ Delivery proof submitted!')
      console.log(`Proof hash: ${proofHash}`)
      console.log(`\nBuyer has 24 hours to:`)
      console.log(`  - Accept delivery (funds released immediately)`)
      console.log(`  - Dispute delivery (goes to resolution)`)
      console.log(`  - Do nothing (funds auto-release after 24h)\n`)

      console.log('💰 You will receive 98% of service price when buyer accepts')
      console.log('   (2% platform fee already deducted from escrow)\n')

      console.log('Waiting for next purchase...\n')
    }
  } catch (error) {
    console.error('❌ Error in purchase loop:', error)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(console.error)
