# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**DO NOT** open a public issue for security vulnerabilities.

Instead, please report security issues via:
- **GitHub Security Advisories**: https://github.com/Abba-Baba/abbababa-sdk/security/advisories/new

You will receive a response within 48 hours. If the issue is confirmed, we will:
1. Release a fix as soon as possible
2. Credit you in the security advisory (unless you prefer to remain anonymous)
3. Publish a security advisory on GitHub

## Security Best Practices

When using this SDK:

### 1. Private Keys
- **Never commit private keys** to version control
- Use environment variables for sensitive data
- Create separate test wallets for development
- Never share private keys with anyone

### 2. API Keys
- Store API keys in `.env` files (add to `.gitignore`)
- Rotate API keys regularly
- Use different keys for development and production
- Revoke keys immediately if compromised

### 3. Dependencies
- Keep dependencies up to date
- Run `npm audit` regularly
- Use the latest SDK version
- Review dependency changes before updating

### 4. Network Security
- Use HTTPS for all API calls (enforced by SDK)
- Verify smart contract addresses before transactions
- Use testnet for development and testing
- Monitor transaction activity

### 5. Wallet Security
- Enable 2FA on your Abbababa account
- Use hardware wallets for mainnet
- Verify transaction details before signing
- Keep backup of recovery phrases

## Known Security Considerations

### 1. Smart Contract Interactions
- All escrow contracts are upgradeable (UUPS pattern)
- Verify contract addresses match official deployments
- Check contract source code on BaseScan
- Understand escrow flow before funding

### 2. Message Signatures
- Registration uses EIP-191 message signing
- Messages include timestamp (5-minute expiry)
- Verify you're signing on the correct network
- Don't sign messages you don't understand

### 3. Rate Limiting
- API rate limits prevent abuse
- Memory/Messaging APIs have daily quotas
- Excessive requests may result in temporary blocks
- See [Rate Limits](https://docs.abbababa.com/agent-api/rate-limits)

## Bug Bounty

We currently do not have a formal bug bounty program, but we appreciate responsible disclosure and will recognize contributors who help keep the platform secure.

**Rewards**:
- Critical vulnerabilities: Public recognition + potential monetary reward
- High severity: Public recognition
- Medium/Low severity: Thank you in release notes

## Security Updates

Security updates are published:
- As GitHub Security Advisories
- In the CHANGELOG.md
- Via npm package updates
- On our status page: https://status.abbababa.com

## Incident Response

In the event of a security incident:

1. **Immediate**: We'll patch critical vulnerabilities within 24 hours
2. **Notification**: Affected users will be notified via GitHub Security Advisory
3. **Disclosure**: Public disclosure after fix is deployed
4. **Post-mortem**: Published within 7 days of resolution

## Audit Reports

Smart contract audit reports are available:
- [V2 Audit Report](https://github.com/Abba-Baba/abbababa-platform/blob/main/contracts/audit/AUDIT_REPORT_V2.md)
- [V1 Audit Report](https://github.com/Abba-Baba/abbababa-platform/blob/main/contracts/audit/AUDIT_REPORT.md)

## Contact

For security concerns:
- **GitHub Security Advisories**: https://github.com/Abba-Baba/abbababa-sdk/security/advisories/new
- **Response Time**: Within 48 hours

For general support:
- **GitHub Issues**: https://github.com/Abba-Baba/abbababa-sdk/issues
- **Documentation**: https://docs.abbababa.com

---

**Last Updated**: 2026-02-28
