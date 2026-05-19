# CVE 漏洞报告

本目录存放通过白盒审计发现的安全漏洞报告。

## 目标项目

| 项目 | Stars | 语言 | 描述 |
|------|-------|------|------|
| [SonicJs](https://github.com/SonicJs-Org/sonicjs) | 1570 | TypeScript | Edge-native headless CMS for Cloudflare Workers |

## 发现列表

| 编号 | 严重性 | 标题 | 文件 |
|------|--------|------|------|
| SONIC-2025-001 | Critical (9.8) | 未认证 seed-admin 端点导致管理员接管 | [sonicjs-001-seed-admin-takeover.md](sonicjs-001-seed-admin-takeover.md) |
| SONIC-2025-002 | High (7.5) | Media Upload R2 Key 路径穿越 | [sonicjs-002-r2-path-traversal.md](sonicjs-002-r2-path-traversal.md) |
| SONIC-2025-003 | High (8.1) | JWT Fallback Secret 硬编码 | [sonicjs-003-jwt-hardcoded-secret.md](sonicjs-003-jwt-hardcoded-secret.md) |
| SONIC-2025-004 | Medium (6.1) | Media Upload MIME 验证绕过 + SVG XSS | [sonicjs-004-mime-bypass-svg-xss.md](sonicjs-004-mime-bypass-svg-xss.md) |

## 审计方法

1. 使用 Bai-codeagent 自动化工具发现候选目标
2. 从 GitHub 拉取源码进行白盒审计
3. 人工验证每个发现，排除误报
4. 编写 PoC 和修复建议

## 免责声明

所有漏洞均通过源码审计发现，未对任何在线实例进行攻击测试。报告仅用于负责任披露。
