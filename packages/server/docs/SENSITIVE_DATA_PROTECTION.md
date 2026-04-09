# Sensitive Data Protection

This document describes how MTA My Way protects sensitive data from exposure, addressing **OWASP A02:2021 - Cryptographic Failures**.

## Overview

The application follows defense-in-depth principles for sensitive data protection:

1. **Data Classification**: Identifying what data is sensitive
2. **Data at Rest**: Encrypting stored data
3. **Data in Transit**: Encrypting network traffic
4. **Data in Use**: Minimizing exposure in memory and logs
5. **Key Management**: Secure storage and rotation of cryptographic keys

---

## Data Classification

### Sensitive Data Types

| Data Type | Classification | Protection Required |
|-----------|----------------|---------------------|
| API Keys | Confidential | Hashed at rest, never logged |
| Passwords | Confidential | Argon2id hashed, never stored in plaintext |
| Session Tokens | Confidential | UUID v4, not logged, HttpOnly cookies |
| CSRF Tokens | Confidential | Cryptographically random, HttpOnly cookies |
| User PII | Confidential | Minimized collection, sanitized from logs |
| Internal Routes | Internal | Not exposed in error messages |
| Database Credentials | Secret | Environment variables, never in code |
| API Secrets | Secret | Environment variables, rotated regularly |

### Data Retention

- **Session Data**: 24 hours (configurable)
- **Audit Logs**: 10,000 entries rolling buffer
- **Security Events**: 10,000 entries rolling buffer
- **Cache Data**: Configurable TTL per data type
- **Trip History**: User-controlled, no automatic deletion

---

## Data at Rest Protection

### Password Storage

Passwords are stored using **Argon2id** (memory-hard KDF):

```typescript
// Argon2id parameters (OWASP 2024 recommendations)
const ARGON2ID_PARAMS = {
  iterations: 3,           // Time cost
  memoryCost: 65536,       // 64 MB
  parallelism: 4,          # Threads
  hashLength: 32,          // 256-bit output
  saltLength: 16,          // 128-bit salt
};
```

**Fallback**: PBKDF2-SHA256 with 600,000 iterations (for environments without Argon2id).

### API Key Storage

API keys are hashed using PBKDF2-SHA256:

```typescript
const API_KEY_PARAMS = {
  iterations: 600_000,     // OWASP 2024 recommendation
  saltLength: 32,          // 256-bit salt
  hashLength: 32,          // 256-bit output
};
```

### Session Token Storage

Session tokens use **UUID v4** (cryptographically random):

```typescript
const sessionId = crypto.randomUUID(); // 122 bits of entropy
```

### CSRF Token Storage

CSRF tokens use **256-bit cryptographically secure random values**:

```typescript
const array = new Uint8Array(32);
crypto.getRandomValues(array);
const token = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
```

### Database Encryption

**Current Implementation**: In-memory storage (no persistent database).

**Production Recommendation**:
- Use database-level encryption (e.g., PostgreSQL transparent data encryption)
- Encrypt sensitive fields with application-level encryption
- Use envelope encryption with key management service (KMS)

### File Storage

**Current Implementation**: No file storage for user data.

**Production Recommendation**:
- Encrypt files at rest using AES-256-GCM
- Use unique keys per file with envelope encryption
- Securely delete files after retention period

---

## Data in Transit Protection

### TLS/HTTPS Configuration

**Required Headers**:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

**Protocol Requirements**:
- **Minimum**: TLS 1.2
- **Recommended**: TLS 1.3
- **Disabled**: SSLv2, SSLv3, TLS 1.0, TLS 1.1

### Certificate Pinning

**Current Implementation**: Not implemented (client-side).

**Production Recommendation**:
- Implement certificate pinning for mobile apps
- Use Public Key Pinning (HPKP) for web applications

### Internal Communication

**Current Implementation**: All services run on the same server.

**Production Recommendation**:
- Use mTLS for inter-service communication
- Encrypt all internal network traffic
- Network segmentation for sensitive services

---

## Data in Use Protection

### Memory Protection

**Best Practices**:
1. Minimize time sensitive data is in memory
2. Zero-out buffers after use (when possible)
3. Avoid storing secrets in process memory longer than necessary

### Log Sanitization

**PII Removal**:

```typescript
function sanitizePathForLogging(path: string): string {
  let sanitized = path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')  // UUIDs
    .replace(/\b\d{10,}\b/g, ':id')                                                              // Long numbers
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, ':email');                 // Email addresses
  return sanitized;
}
```

**Never Log**:
- API keys (secret portion)
- Passwords (even hashed)
- Session tokens
- CSRF tokens
- Database credentials
- API secrets

### Error Messages

**Principle**: Generic error messages for users, detailed messages for logs.

```typescript
// ❌ Bad: Exposes internal information
return c.json({ error: 'Database connection failed to db.prod.internal:5432' }, 500);

// ✅ Good: Generic error message
return c.json({ error: 'An error occurred' }, 500);
```

---

## Key Management

### Key Storage

**Current Implementation**: Environment variables (recommended for development).

**Production Recommendation**:
- Use a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)
- Rotate keys regularly (90 days for API keys)
- Implement key versioning
- Separate key management from application servers

### Key Rotation

**API Keys**:
- Manual rotation via admin interface
- Grace period for key transition
- Audit trail for rotation events

**Session Secrets**:
- Automatic rotation on server restart
- Session invalidation on rotation

### Key Generation

**All keys use cryptographically secure random generation**:

```typescript
const array = new Uint8Array(32);
crypto.getRandomValues(array); // Uses OS CSPRNG
```

---

## Privacy Protection

### PII Minimization

**Collected Data**:
- Push subscription endpoints (required for notifications)
- User agent strings (for device tracking)
- IP addresses (for security logging)

**Not Collected**:
- Names, addresses, phone numbers
- Email addresses (unless explicitly provided)
- Location data beyond subway context
- Payment information

### PII in Logs

**Sanitization Applied**:
- UUIDs replaced with `:id`
- Email addresses replaced with `:email`
- Long numbers replaced with `:id`
- IP addresses truncated or anonymized

### Data Export/Deletion

**Current Implementation**: No user data export/deletion API.

**Production Recommendation**:
- GDPR/CCPA compliance endpoints
- Data export (JSON format)
- Account deletion with data cleanup
- Right to be forgotten implementation

---

## Specific Protections by Data Type

### API Keys

**Protection Measures**:
- Hashed with PBKDF2-SHA256 (600,000 iterations)
- 256-bit salt per key
- Never logged or exposed in error messages
- Secure transmission (TLS required)
- Scope-based permissions (read/write/admin)
- Account lockout after 5 failed attempts
- Configurable expiration

**Storage**:
```typescript
interface ApiKey {
  keyId: string;           // Public identifier
  keyHash: string;         // PBKDF2-SHA256 hash
  keySalt: string;         // 256-bit salt
  scope: 'read' | 'write' | 'admin';
  expiresAt: number;       // Unix timestamp
  failedAttempts: number;  // For lockout
}
```

### Passwords

**Protection Measures**:
- Argon2id hashing (primary)
- PBKDF2-SHA256 fallback (600,000 iterations)
- 128-bit salt per password
- Password history (5 previous passwords)
- Breached password detection
- 90-day expiration (configurable)
- Minimum 12 characters (NIST guidelines)
- No composition requirements (follows NIST SP 800-63B)

**Storage**:
```typescript
interface PasswordHash {
  algorithm: 'argon2id' | 'pbkdf2';
  hash: string;
  salt: string;
  iterations: number;
  memoryCost?: number;      // Argon2id only
  parallelism?: number;     // Argon2id only
  createdAt: number;
}
```

### Session Tokens

**Protection Measures**:
- UUID v4 (122 bits entropy)
- 24-hour expiration
- IP binding (optional, configurable)
- Device tracking
- Session regeneration after authentication
- Maximum 5 concurrent sessions per key
- 30-minute idle timeout
- Secure transmission (TLS required)

**Storage**:
```typescript
interface AuthSession {
  sessionId: string;
  keyId: string;
  createdAt: number;
  expiresAt: number;
  clientIp: string;
  userAgent?: string;
  ipBinding: boolean;
  deviceId?: string;
  csrfToken: string;
}
```

### Push Notification Data

**Protection Measures**:
- Endpoints stored securely
- No PII collected with subscriptions
- User can delete subscriptions anytime
- No tracking of notification delivery

**Storage**:
```typescript
interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  favorites?: FavoriteLine[];
  quietHours?: QuietHours;
}
```

---

## Compliance Considerations

### GDPR (EU General Data Protection Regulation)

**Relevant Requirements**:
- Data minimization (Article 5)
- Right to erasure (Article 17)
- Data portability (Article 20)
- Privacy by design (Article 25)

**Implementation Status**:
- ✅ Data minimization: Only collect necessary data
- ⚠️ Right to erasure: Need to implement deletion API
- ⚠️ Data portability: Need to implement export API
- ✅ Privacy by design: Security-first architecture

### CCPA (California Consumer Privacy Act)

**Relevant Requirements**:
- Right to know
- Right to delete
- Right to opt-out
- Right to non-discrimination

**Implementation Status**:
- ⚠️ Right to know: Need to implement data access API
- ⚠️ Right to delete: Need to implement deletion API
- N/A Right to opt-out: No data selling
- ✅ Non-discrimination: No discriminatory practices

---

## Security Monitoring

### Anomaly Detection

**Monitored Behaviors**:
- Unusual access patterns
- Multiple failed authentication attempts
- Requests from suspicious IP addresses
- Data exfiltration attempts
- Session token reuse

### Alerting

**Critical Alerts** (immediate notification):
- Account lockouts
- Brute force attacks detected
- Data exfiltration attempts
- Critical vulnerabilities found

**Warning Alerts** (daily digest):
- High failed authentication rate
- Unusual access patterns
- Expired certificates
- Outdated dependencies

---

## Best Practices Summary

### DO ✅

1. **Encrypt sensitive data at rest** using strong KDFs (Argon2id, PBKDF2)
2. **Use TLS for all network traffic**
3. **Sanitize logs** to remove PII and secrets
4. **Use generic error messages** for users
5. **Implement key rotation** for all secrets
6. **Follow principle of least privilege** for data access
7. **Minimize data collection** to what's necessary
8. **Use CSPRNG** for all random value generation
9. **Implement rate limiting** to prevent enumeration
10. **Log security events** for incident response

### DON'T ❌

1. **Store passwords in plaintext**
2. **Log sensitive data** (API keys, tokens, PII)
3. **Expose internal details** in error messages
4. **Use weak encryption** (MD5, SHA1, DES, RC4)
5. **Hard-code secrets** in source code
6. **Disable TLS verification** in production
7. **Roll your own crypto** - use proven libraries
8. **Ignore certificate warnings**
9. **Store secrets in config files**
10. **Use deterministic random** generators for security

---

## Testing

### Security Test Coverage

```bash
# Run all security tests
npm test

# Specific security middleware tests
npm test -- middleware/authentication.test.ts
npm test -- middleware/password-management.test.ts
npm test -- middleware/csrf-protection.test.ts
npm test -- middleware/security-logging.test.ts
```

### Penetration Testing

**Recommended Tools**:
- OWASP ZAP
- Burp Suite
- Nmap
- Nikto
- SQLmap

### Security Audit

```bash
# Run dependency audit
npm audit

# Check for outdated packages
npm outdated

# Generate security report
npm run security:report
```

---

## References

- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [GDPR Text](https://gdpr-info.eu/)
- [CCPA Text](https://oag.ca.gov/privacy/ccpa)

---

**Last Updated:** 2026-04-09

**Maintained By:** Security Team

**Document Version:** 1.0.0
