# OWASP Top 10 (2021) Security Protections

This document describes how MTA My Way addresses each of the OWASP Top 10 (2021) security risks.

## A01:2021 - Broken Access Control

**Risk:** Users can act outside of their intended permissions, leading to unauthorized access or data exposure.

### Protections Implemented

| Protection | Implementation | Location |
|------------|----------------|----------|
| CSRF Protection | Token-based CSRF with double-submit cookie pattern | `middleware/csrf-protection.ts` |
| Authorization Middleware | Role-based access control with resource policies | `middleware/authorization.ts` |
| Same-Origin Protection | Origin/Referer validation for sensitive operations | `middleware/authorization.ts` |
| Host Header Protection | Validates Host header to prevent poisoning | `middleware/host-header-protection.ts` |
| Path Traversal Prevention | Blocks `../` and encoded variants | `middleware/path-traversal.ts` |
| Parameter Pollution Protection | Detects and blocks duplicate parameters | `middleware/parameter-pollution.ts` |
| Mass Assignment Protection | Field allow-listing to prevent privilege escalation | `middleware/mass-assignment.ts` |
| Open Redirect Protection | Validates redirect URLs against allow-lists | `middleware/open-redirect.ts` |

### Configuration

CSRF protection is applied to all state-changing operations:

```typescript
app.use("/api/*", csrfProtection({
  excludePaths: [
    "/api/health",
    "/api/metrics",
    "/api/stations",
    // ... other read-only endpoints
  ],
}));
```

### Testing

Run CSRF protection tests:
```bash
npm test -- middleware/csrf-protection.test.ts
npm test -- middleware/mass-assignment.test.ts
npm test -- middleware/open-redirect.test.ts
```

---

## A02:2021 - Cryptographic Failures

**Risk:** Sensitive data is not properly protected, leading to exposure of credentials, PII, or other sensitive information.

### Protections Implemented

| Protection | Implementation | Location |
|------------|----------------|----------|
| Password Hashing | Argon2id (primary) with OWASP 2024 parameters | `middleware/password-management.ts` |
| Password Fallback | PBKDF2-SHA256 with 600,000 iterations | `middleware/password-management.ts` |
| API Key Hashing | PBKDF2-SHA256 with 600,000 iterations | `middleware/authentication.ts` |
| Secure Random | Web Crypto API (crypto.getRandomValues) | `middleware/authentication.ts` |
| Session Tokens | UUID v4 with cryptographically secure generation | `middleware/authentication.ts` |
| CSRF Tokens | 256-bit cryptographically secure random tokens | `middleware/csrf-protection.ts` |

### Password Policy

Default password policy follows NIST SP 800-63B and OWASP guidelines:

- Minimum length: 12 characters
- No character composition requirements (NIST guidelines)
- Password history: 5 previous passwords
- Expiration: 90 days (configurable)
- Breach detection: Checks against known breached passwords

### API Key Security

API keys are hashed using PBKDF2-SHA256 with:
- Salt: 32 bytes (256 bits)
- Iterations: 600,000 (OWASP 2024 recommendation)
- Key length: 256 bits

### Data in Transit

- All API endpoints require HTTPS in production
- HSTS header with 1-year max-age, includeSubDomains, preload
- TLS 1.2+ enforced

### Testing

```bash
npm test -- middleware/password-management.test.ts
npm test -- middleware/authentication.test.ts
```

---

## A03:2021 - Injection

**Risk:** Injection attacks (SQL, NoSQL, OS command, XSS) allow attackers to execute malicious code.

### Protections Implemented

| Protection | Implementation | Location |
|------------|----------------|----------|
| Input Sanitization | Strips HTML, prevents SQL/command injection | `middleware/input-sanitization.ts` |
| Parameterized Queries | No raw SQL - uses prepared statements | `docs/SQL_INJECTION_PROTECTION.md` |
| XSS Prevention | Content-Security-Policy with strict sources | `middleware/security-headers.ts` |
| Command Injection Prevention | Validates and sanitizes shell inputs | `middleware/sanitization.ts` |
| Path Traversal Prevention | Validates file paths, blocks traversal | `middleware/path-traversal.ts` |
| Header Validation | Validates and sanitizes HTTP headers | `middleware/header-validation.ts` |

### Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self';
font-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

### SQL Injection Protection

The application uses a parameterized query approach that prevents SQL injection. See [`SQL_INJECTION_PROTECTION.md`](./SQL_INJECTION_PROTECTION.md) for details.

### Testing

```bash
npm test -- middleware/input-sanitization.test.ts
npm test -- middleware/path-traversal.test.ts
npm test -- middleware/header-validation.test.ts
```

---

## A04:2021 - Insecure Design

**Risk:** Architecture and design flaws that cannot be fixed by implementation alone.

### Protections Implemented

| Protection | Implementation | Location |
|------------|----------------|----------|
| Threat Modeling | Security requirements defined for all features | This document |
| Defense in Depth | Multiple security layers (CSP, CSRF, sanitization) | Multiple middleware |
| Least Privilege | Minimal required permissions for all operations | `middleware/authorization.ts` |
| Secure Session Management | Session regeneration after auth, IP binding | `middleware/authentication.ts` |
| Rate Limiting | Token bucket with configurable tiers | `middleware/rate-limiter.ts` |
| Request Size Limits | Prevents DoS via large payloads | `middleware/request-limits.ts` |
| Audit Logging | Complete audit trail for privileged operations | `middleware/authentication.ts` |

### Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Security Layers                        │
├─────────────────────────────────────────────────────────────┤
│ 1. Network Layer: HSTS, TLS enforcement, host validation   │
│ 2. Application Layer: CSP, CSRF, rate limiting, input sanit.│
│ 3. Authentication Layer: API keys, sessions, MFA           │
│ 4. Authorization Layer: Resource policies, RBAC            │
│ 5. Audit Layer: Security logging, audit trails             │
└─────────────────────────────────────────────────────────────┘
```

### Testing

Security architecture is validated through integration tests:
```bash
npm test -- src/integration/
```

---

## A05:2021 - Security Misconfiguration

**Risk:** Improperly configured security settings, default accounts, or verbose error messages.

### Protections Implemented

| Protection | Implementation | Location |
|------------|----------------|----------|
| Security Headers | CSP, X-Frame-Options, X-Content-Type-Options, etc. | `middleware/security-headers.ts` |
| Error Handling | Generic error messages, no stack traces in responses | `app.ts` |
| CORS Configuration | Configurable allow-list for origins | `middleware/cors.ts` |
| Dependency Security | Automated vulnerability scanning on startup | `middleware/dependency-security.ts` |
| Environment Validation | Validates required security env vars on startup | `middleware/dependency-security.ts` |
| Permissions Policy | Restricts browser features (geolocation, camera, etc.) | `middleware/security-headers.ts` |

### Security Headers

All responses include:
- `Content-Security-Policy`: Restricts resource sources
- `X-Content-Type-Options: nosniff`: Prevents MIME sniffing
- `X-Frame-Options: DENY`: Prevents clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin`: Controls referrer info
- `Strict-Transport-Security`: HSTS for HTTPS enforcement
- `Permissions-Policy`: Restricts browser features
- `Cross-Origin-Opener-Policy: same-origin`: Prevents window.opener access
- `Cross-Origin-Resource-Policy: same-origin`: Restricts cross-origin access

### Environment Variables

Required security configuration:
- `NODE_ENV`: Set to `production` in production
- `ALLOWED_HOSTS`: Comma-separated list of allowed hosts (production)
- `VAPID_PRIVATE_KEY`: For push notifications (if enabled)

### Dependency Scanning

Automated security audit runs on startup:
```typescript
securityCheckOnStartup(packageJsonPath, {
  includeDev: true,
  severityThreshold: 'moderate',
});
```

### Testing

```bash
npm test -- middleware/security-headers.test.ts
npm test -- middleware/dependency-security.test.ts
```

---

## A06:2021 - Vulnerable and Outdated Components

**Risk:** Using libraries, frameworks, or other software modules with known vulnerabilities.

### Protections Implemented

| Protection | Implementation | Location |
|------------|----------------|----------|
| Dependency Auditing | Automated vulnerability scanning | `middleware/dependency-security.ts` |
| Version Pinning | Exact versions in package-lock.json | `package-lock.json` |
| Security Reports | Generates detailed vulnerability reports | `middleware/dependency-security.ts` |
| Update Notifications | Logs outdated dependencies | `middleware/dependency-security.ts` |
| npm audit Integration | Can be integrated with npm audit | `package.json` |

### Running Security Audits

```bash
# Run npm audit
npm audit

# Generate security report
npm run security:report

# Check for outdated packages
npm outdated
```

### Known Vulnerability Database

The application maintains a local database of known vulnerabilities (see `dependency-security.ts`). In production, integrate with:
- GitHub Advisory Database
- Snyk
- OWASP Dependency-Check
- npm audit

### Testing

```bash
npm test -- middleware/dependency-security.test.ts
```

---

## A07:2021 - Identification and Authentication Failures

**Risk:** Attacks that compromise identity, session management, or authentication mechanisms.

### Protections Implemented

| Protection | Implementation | Location |
|------------|----------------|----------|
| API Key Authentication | Secure API key hashing and verification | `middleware/authentication.ts` |
| Session Management | Secure session tokens with IP binding | `middleware/authentication.ts` |
| Account Lockout | Progressive lockout after failed attempts | `middleware/authentication.ts` |
| Session Fixation Prevention | Session regeneration after auth | `middleware/authentication.ts` |
| Concurrent Session Limits | Maximum 5 active sessions per key | `middleware/authentication.ts` |
| Idle Timeout | 30-minute idle session timeout | `middleware/authentication.ts` |
| MFA Support | TOTP-based multi-factor authentication | `middleware/authentication.ts` |
| Refresh Tokens | Secure token rotation for session renewal | `middleware/authentication.ts` |
| Password Policy | Strong password requirements with breach detection | `middleware/password-management.ts` |
| OAuth 2.0 | PKCE flow for third-party authentication | `middleware/authentication.ts` |

### Authentication Flow

```
┌─────────────┐
│ 1. Request  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ 2. Extract Credentials          │
│    - Bearer token               │
│    - X-API-Key header           │
│    - Session token              │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 3. Validate & Sanitize          │
│    - Check IP blocking           │
│    - Rate limit auth failures    │
│    - Validate format             │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 4. Authenticate                │
│    - Verify credentials          │
│    - Check account lockout       │
│    - Check expiration            │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 5. Authorize                    │
│    - Check scope/permissions     │
│    - Validate resource access    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 6. Audit Log                    │
│    - Log access attempt          │
│    - Track suspicious activity   │
└─────────────────────────────────┘
```

### Account Lockout Policy

- **Failed Attempts**: 5
- **Lockout Duration**: 15 minutes
- **IP-based Rate Limiting**: 10 failures per minute

### Testing

```bash
npm test -- middleware/authentication.test.ts
npm test -- middleware/password-management.test.ts
```

---

## A08:2021 - Software and Data Integrity Failures

**Risk:** Code or infrastructure without integrity verification, leading to potential compromise.

### Protections Implemented

| Protection | Implementation | Location |
|------------|----------------|----------|
| Subresource Integrity | SRI hash generation and validation | `middleware/subresource-integrity.ts` |
| CSP Hashes/Nonces | Strict CSP with nonce support | `middleware/security-headers.ts` |
| Secure Update Process | npm ci for deterministic builds | `package.json` |
| Dependency Verification | Package integrity checking | `middleware/dependency-security.ts` |
| Code Signing | Can be extended for signed releases | - |
| Immutable Caching | Hash-based asset caching | `app.ts` |

### Subresource Integrity (SRI)

Generate SRI hashes for external resources:

```typescript
import { generateSriHash, generateSriAttributes } from './middleware/subresource-integrity.js';

// Generate SRI hash
const sri = generateSriHash('sha384', 'script-content');

// Generate SRI attributes for HTML
const attrs = generateSriAttributes(sri);
// { integrity: 'sha384-...', crossorigin: 'anonymous' }
```

### Immutable Assets

Hashed assets get long cache headers:
```
Cache-Control: public, max-age=31536000, immutable
```

### Testing

```bash
npm test -- middleware/subresource-integrity.test.ts
```

---

## A09:2021 - Security Logging and Monitoring Failures

**Risk:** Insufficient logging and monitoring prevents detection of security incidents.

### Protections Implemented

| Protection | Implementation | Location |
|------------|----------------|----------|
| Security Event Logging | Centralized security event logger | `middleware/security-logging.ts` |
| Audit Logging | Complete audit trail for privileged operations | `middleware/authentication.ts` |
| Metrics Collection | Prometheus metrics for all endpoints | `middleware/metrics.ts` |
| Distributed Tracing | Request tracing with span IDs | `observability/tracing.ts` |
| Error Tracking | Structured error logging | `observability/logger.ts` |
| Suspicious Activity Detection | IP-based suspicious activity tracking | `middleware/authentication.ts` |

### Security Event Types

Logged events include:
- Authentication failures (`auth_failure`)
- Authorization failures (`authz_failure`)
- Rate limit exceeded (`rate_limit_exceeded`)
- Input validation failures (`input_validation_failed`)
- Path traversal blocked (`path_traversal_blocked`)
- HPP blocked (`hpp_blocked`)
- Suspicious requests (`suspicious_request`)
- Blocked attacks (`blocked_attack`)
- Data exfiltration attempts (`data_exfiltration_attempt`)
- Unusual activity (`unusual_activity`)

### Security Event Format

```json
{
  "event": "auth_failure",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "severity": "high",
  "ip": "1.2.3.4",
  "userAgent": "Mozilla/5.0...",
  "method": "POST",
  "path": "/api/commute/analyze",
  "statusCode": 401,
  "details": {
    "reason": "invalid_api_key"
  }
}
```

### Metrics

Collected metrics include:
- HTTP request count, latency, status codes
- Cache hit/miss rates
- Feed circuit breaker states
- Error counts
- Authentication success/failure rates

### Testing

```bash
npm test -- middleware/security-logging.test.ts
npm test -- observability/metrics.test.ts
```

---

## A10:2021 - Server-Side Request Forgery (SSRF)

**Risk:** Attacker causes the server to make requests to unintended locations.

### Protections Implemented

| Protection | Implementation | Location |
|------------|----------------|----------|
| URL Validation | Validates URLs against allow-lists | `middleware/ssrf-protection.ts` |
| Private Network Blocking | Blocks requests to 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 | `middleware/ssrf-protection.ts` |
| Localhost Blocking | Blocks localhost, 127.0.0.1, ::1 | `middleware/ssrf-protection.ts` |
| Protocol Restrictions | Only allows http:// and https:// | `middleware/ssrf-protection.ts` |
| Port Blocking | Blocks common infrastructure ports | `middleware/ssrf-protection.ts` |
| DNS Rebinding Protection | Validates DNS responses | `middleware/ssrf-protection.ts` |

### SSRF Protection Configuration

```typescript
ssrfProtection({
  allowedHostnames: ['gtfsrt.prod.obanyc.com', 'mta.info'],
  blockPrivateNetworks: true,
  blockLocalhost: true,
  blockLinkLocal: true,
  maxUrlLength: 2000,
  allowUserProvidedUrls: false,
})
```

### Blocked Ports

Common infrastructure ports are blocked:
- SSH (22), Telnet (23), SMTP (25), DNS (53)
- NetBIOS (139), SMB (445), MySQL (3306)
- RDP (3389), PostgreSQL (5432), Redis (6379)
- MongoDB (27017), Memcached (11211)

### Testing

```bash
npm test -- middleware/ssrf-protection.test.ts
```

---

## Additional Security Measures

### Denial of Service (DoS) Protection

| Protection | Implementation | Location |
|------------|----------------|----------|
| Rate Limiting | Token bucket (60 req/min default) | `middleware/rate-limiter.ts` |
| Request Size Limits | 1MB max for JSON, 10MB for forms | `middleware/request-limits.ts` |
| Compression Threshold | Only compress responses >500 bytes | `app.ts` |
| Circuit Breaker | Feed polling with circuit breaker | `cache.ts` |

### Privacy Protection

| Protection | Implementation | Location |
|------------|----------------|----------|
| PII Sanitization | Removes PII from logs | `middleware/security-logging.ts` |
| Referrer Policy | Controls referrer information | `middleware/security-headers.ts` |
| Permissions Policy | Blocks browser fingerprinting | `middleware/security-headers.ts` |
| No Cookie Storage | No tracking cookies | `app.ts` |

### API Security

| Protection | Implementation | Location |
|------------|----------------|----------|
| Request Validation | Schema validation for all inputs | `middleware/validation.ts` |
| Content Type Validation | Enforces correct content types | `middleware/content-type.ts` |
| CORS | Configurable cross-origin policy | `middleware/cors.ts` |
| OPTIONS Handling | Proper preflight response | `app.ts` |

---

## Security Testing

### Unit Tests

Run all security-related tests:
```bash
npm test
```

### Integration Tests

Run integration tests:
```bash
npm test -- src/integration/
```

### Security Audit

Run security audit:
```bash
npm audit
npm outdated
```

---

## Security Checklist

Before deploying to production:

- [ ] All tests passing
- [ ] `npm audit` shows no vulnerabilities
- [ ] Security headers configured correctly
- [ ] CSP policy is strict
- [ ] HSTS enabled
- [ ] Rate limiting configured
- [ ] Input validation enabled
- [ ] CSRF protection enabled
- [ ] Security logging enabled
- [ ] Audit logging enabled
- [ ] Error messages are generic
- [ ] Debug mode disabled
- [ ] Environment variables set correctly
- [ ] TLS/HTTPS enabled
- [ ] Database is encrypted at rest
- [ ] Backup encryption enabled
- [ ] Monitoring/alerting configured

---

## References

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP Cheat Sheets](https://cheatsheetseries.owasp.org/)
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [CSP Level 3](https://w3c.github.io/webappsec-csp/)
- [Security Headers](https://securityheaders.com/)

---

## Contributing

When adding new features or modifying security-critical code:

1. Review the OWASP Top 10 implications
2. Add appropriate tests
3. Update this documentation
4. Run security audit
5. Submit for code review

---

**Last Updated:** 2026-04-09

**Maintained By:** Security Team

**Document Version:** 1.0.0
