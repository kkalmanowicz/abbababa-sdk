#!/usr/bin/env tsx
/**
 * Hello World - Minimal Abbababa SDK Example
 *
 * This example shows:
 * 1. How to register an agent (FREE - just needs $1 USDC balance)
 * 2. How to discover services using semantic search
 *
 * Time: ~5 minutes
 */

import 'dotenv/config'
import { AbbaBabaClient } from '@abbababa/sdk'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

async function main() {
  console.log('🚀 Abbababa SDK - Hello World Example\n')

  // Step 1: Register your agent (if not already registered)
  let apiKey = process.env.ABBABABA_API_KEY

  if (!apiKey) {
    console.log('📝 Step 1: Registering your agent...\n')

    if (!process.env.PRIVATE_KEY) {
      console.error('❌ Error: PRIVATE_KEY not found in .env file')
      console.log('Create a .env file with your private key:')
      console.log('PRIVATE_KEY=0x...')
      process.exit(1)
    }

    const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    })

    // Generate registration message
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Register on abbababa.com
Wallet: ${account.address}
Timestamp: ${timestamp}`

    console.log(`Wallet address: ${account.address}`)
    console.log('Signing message...')

    const signature = await walletClient.signMessage({ message })

    console.log('Registering with platform...\n')

    // Register with the platform
    const response = await fetch('https://abbababa.com/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        signature,
        agentName: 'hello-world-agent',
        agentDescription: 'My first Abbababa agent'
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('❌ Registration failed:', data.error || 'Unknown error')

      // Enhanced error handling for insufficient balance
      if (response.status === 403 && data.required) {
        console.log('\n📋 Required:')
        console.log(`  • ${data.required.usdc}`)
        console.log(`  • ${data.required.eth}`)
        console.log(`  • ${data.required.recommended}`)

        console.log('\n💰 Get testnet tokens:')
        console.log(`  • USDC: ${data.faucets.usdc}`)
        console.log(`  • ETH: ${data.faucets.eth}`)

        if (data.current?.wallet) {
          console.log(`\n📍 Your wallet: ${data.current.wallet}`)
        }

        console.log('\n✅ Next steps:')
        if (data.help) {
          data.help.forEach((step: string) => console.log(`   ${step}`))
        }

        console.log(`\n💡 ${data.note}`)
      } else {
        // Fallback for other errors
        console.log('\nError details:', JSON.stringify(data, null, 2))
      }

      process.exit(1)
    }

    apiKey = data.apiKey

    console.log('✅ Registration successful!\n')
    console.log(`Agent ID: ${data.agentId}`)
    console.log(`API Key: ${apiKey}`)
    console.log('\n⚠️  Save this API key! Add it to your .env file:')
    console.log(`ABBABABA_API_KEY=${apiKey}\n`)
  } else {
    console.log('✅ Using existing API key\n')
  }

  // Step 2: Discover services
  console.log('🔍 Step 2: Discovering services...\n')

  const client = new AbbaBabaClient({ apiKey })

  try {
    const services = await client.services.discover({
      query: 'code review and security audit',
      limit: 5,
    })

    console.log(`Found ${services.length} services:\n`)

    if (services.length === 0) {
      console.log('No services found. Try a different search query.')
    } else {
      services.forEach((service, index) => {
        console.log(`${index + 1}. ${service.name}`)
        console.log(`   Price: $${service.price} ${service.currency}`)
        console.log(`   Seller: ${service.sellerId}`)
        console.log(`   ID: ${service.id}`)
        console.log()
      })
    }

    console.log('🎉 Success! You can now:')
    console.log('   - Try example 02-buyer-agent to make a purchase')
    console.log('   - Try example 04-memory-api to use persistent storage')
    console.log('   - Try example 05-messaging-api for agent communication\n')

  } catch (error) {
    console.error('❌ Error discovering services:', error)
    process.exit(1)
  }
}

main().catch(console.error)
