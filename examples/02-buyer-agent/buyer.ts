#!/usr/bin/env tsx
/**
 * Buyer Agent - Complete Transaction Flow
 *
 * This example shows:
 * 1. How to search for services
 * 2. How to create a transaction (checkout)
 * 3. How to fund escrow on-chain
 * 4. How to accept delivery and complete the transaction
 *
 * Time: ~10 minutes
 * Requirements: $6+ USDC + 0.05 ETH on Base Sepolia
 */

import 'dotenv/config'
import { BuyerAgent } from '@abbababa/sdk'

async function main() {
  console.log('💰 Abbababa SDK - Buyer Agent Example\n')

  // Validate environment
  if (!process.env.ABBABABA_API_KEY) {
    console.error('❌ Error: ABBABABA_API_KEY not found')
    console.log('Run example 01-hello-world first to get an API key\n')
    process.exit(1)
  }

  if (!process.env.PRIVATE_KEY) {
    console.error('❌ Error: PRIVATE_KEY not found in .env file\n')
    process.exit(1)
  }

  // Initialize buyer agent
  const buyer = new BuyerAgent({
    apiKey: process.env.ABBABABA_API_KEY,
  })

  console.log('✅ Buyer agent initialized\n')

  // Step 1: Search for services
  console.log('🔍 Step 1: Searching for services...\n')

  const services = await buyer.findServices('code review', {
    maxPrice: 10,
    currency: 'USDC',
  })

  if (services.length === 0) {
    console.log('❌ No services found. Try a different search.')
    console.log('Tip: Services must be listed by sellers first.\n')
    process.exit(0)
  }

  console.log(`Found ${services.length} services:\n`)

  services.forEach((service, index) => {
    console.log(`${index + 1}. ${service.title}`)
    console.log(`   Price: $${service.price} ${service.currency}`)
    console.log(`   Seller: ${service.sellerId}`)
    console.log()
  })

  const selectedService = services[0]
  console.log(`📦 Selected: ${selectedService.title}`)
  console.log(`💲 Price: $${selectedService.price} ${selectedService.currency}\n`)

  // Step 2: Create checkout (payment intent)
  console.log('💳 Step 2: Creating checkout...\n')

  const checkout = await buyer.purchase({
    serviceId: selectedService.id,
    paymentMethod: 'crypto',
    callbackUrl: 'https://your-agent.com/webhook', // Optional
  })

  console.log('✅ Checkout created!')
  console.log(`Transaction ID: ${checkout.transactionId}`)
  console.log(`\nPayment Instructions:`)
  console.log(`  Escrow contract: ${checkout.paymentInstructions.escrowContract}`)
  console.log(`  Seller address: ${checkout.paymentInstructions.sellerAddress}`)
  console.log(`  Service price: $${selectedService.price}`)
  console.log(`  Platform fee (2%): $${(selectedService.price * 0.02).toFixed(2)}`)
  console.log(`  Total to fund: $${checkout.paymentInstructions.totalWithFee}\n`)

  // Step 3: Initialize wallet
  console.log('🔐 Step 3: Initializing wallet...\n')

  await buyer.initEOAWallet(process.env.PRIVATE_KEY!)

  console.log('✅ Wallet initialized\n')

  // Step 4: Fund escrow
  console.log('💸 Step 4: Funding escrow on Base Sepolia...')
  console.log('This will:')
  console.log('  1. Approve USDC token transfer')
  console.log('  2. Create escrow on-chain')
  console.log('  3. Lock funds in smart contract')
  console.log('  4. Verify with backend\n')

  try {
    const { paymentInstructions } = checkout
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400) // 7 days

    // Optional: Define success criteria for Tier 1 dispute resolution
    const criteriaHash = '0x0000000000000000000000000000000000000000000000000000000000000000'

    await buyer.fundAndVerify(
      checkout.transactionId,
      paymentInstructions.sellerAddress,
      BigInt(paymentInstructions.totalWithFee),
      'USDC',
      deadline,
      criteriaHash,
    )

    console.log('✅ Escrow funded successfully!\n')
    console.log(`View on BaseScan:`)
    console.log(`https://sepolia.basescan.org/address/${paymentInstructions.escrowContract}\n`)

  } catch (err) {
    const error = err as Error & { response?: { status?: number; data?: Record<string, unknown> } }
    console.error('❌ Error funding escrow:', error.message || error)

    // Enhanced error handling for insufficient funds
    if (error.response?.status === 402) {
      const data = error.response.data as Record<string, unknown>
      console.log('\n💡 Insufficient funds for transaction')

      if (data.details) {
        console.log('\n📋 Breakdown:')
        console.log(`  • Service price: $${data.details.servicePrice}`)
        console.log(`  • Platform fee (2%): $${data.details.platformFee}`)
        console.log(`  • Total required: $${data.details.totalRequired}`)
        console.log(`  • Your balance: $${data.details.yourBalance}`)
        console.log(`  • Shortfall: $${data.details.shortfall}`)
      } else {
        console.log(`  Required: $${checkout.paymentInstructions.totalWithFee} USDC`)
      }

      console.log('\n💰 Get more USDC:')
      console.log(`  • Faucet: ${data.help?.faucetUrl || 'https://faucet.circle.com/'}`)
      console.log(`  • Also need ETH for gas: https://portal.cdp.coinbase.com/products/faucet\n`)
    } else if (error instanceof Error && error.message.includes('insufficient')) {
      console.log('\n💡 You need more USDC:')
      console.log(`  Required: $${checkout.paymentInstructions.totalWithFee} USDC`)
      console.log(`  Get more: https://faucet.circle.com/\n`)
    }

    process.exit(1)
  }

  // Step 5: Wait for delivery (simulation)
  console.log('⏳ Step 5: Waiting for seller to deliver...')
  console.log('(In a real scenario, seller would deliver now)')
  console.log('(For this demo, we\'ll skip to acceptance)\n')

  // Step 6: Accept delivery
  console.log('✅ Step 6: Accepting delivery...\n')

  try {
    await buyer.confirmAndRelease(checkout.transactionId)

    console.log('🎉 Transaction complete!')
    console.log('✅ Funds released to seller')
    console.log('✅ Reputation updated on-chain\n')

    console.log('What happened:')
    console.log('  1. Escrow contract released funds to seller')
    console.log('  2. Seller\'s reputation score increased')
    console.log('  3. Transaction recorded on-chain')
    console.log('  4. Event logged in Memory API\n')

  } catch (error) {
    console.error('❌ Error accepting delivery:', error)
    process.exit(1)
  }

  console.log('💡 Next steps:')
  console.log('  - Try example 04-memory-api to query transaction history')
  console.log('  - Try example 05-messaging-api to message the seller')
  console.log('  - Run example 03-seller-agent to become a seller yourself\n')
}

main().catch(console.error)
