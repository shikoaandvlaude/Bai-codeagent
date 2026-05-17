import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveAuditSkills } from "../config/auditSkills.js";
import { scanDependencies } from "../services/dependencyAudit.js";

// Configurable findings limit (was hardcoded to 8)
const MAX_FINDINGS_PER_PROJECT = 25;

// File patterns to skip (reduce false positives in test files)
const SKIP_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /test[s]?\//i,
  /\.min\.js$/,
  /node_modules\//,
  /vendor\//,
  /dist\//,
  /build\//,
  /\.d\.ts$/
];

export class AuditAnalystAgent {
  constructor({ llmReviewer }) {
    this.llmReviewer = llmReviewer;
  }

  async run({ projects, selectedSkillIds, llmConfig, onProgress }) {
    const reviewProfile = resolveAuditSkills(selectedSkillIds);
    const results = [];

    for (const [index, project] of projects.entries()) {
      onProgress?.({
        stage: "heuristic",
        projectId: project.id,
        projectName: project.name,
        projectIndex: index + 1,
        totalProjects: projects.length,
        label: `正在分析规则层：${project.name}`
      });

      const heuristicFindings = await buildHeuristicFindings(project, reviewProfile);
      const llmReview = this.llmReviewer
        ? await this.llmReviewer.reviewProject({
            project,
            selectedSkills: reviewProfile,
            heuristicFindings,
            llmConfig,
            onProgress: (detail) =>
              onProgress?.({
                stage: "llm-review",
                projectId: project.id,
                projectName: project.name,
                projectIndex: index + 1,
                totalProjects: projects.length,
                ...detail
              })
          })
        : {
            status: "skipped",
            called: false,
            skipReason: "reviewer-unavailable",
            summary: "未配置 LLM 复核器。",
            findings: [],
            warnings: []
          };

      const mergedFindings = prioritizeFindings([
        ...heuristicFindings,
        ...(Array.isArray(llmReview.findings) ? llmReview.findings : [])
      ]);

      results.push({
        projectId: project.id,
        projectName: project.name,
        repoUrl: project.repoUrl,
        localPath: project.localPath || "",
        reviewProfile,
        heuristicFindings,
        llmReview,
        findings: mergedFindings
      });

      onProgress?.({
        stage: "project-complete",
        projectId: project.id,
        projectName: project.name,
        projectIndex: index + 1,
        totalProjects: projects.length,
        heuristicCount: heuristicFindings.length,
        llmCount: llmReview?.findings?.length || 0,
        label: `已完成：${project.name}`
      });
    }

    return {
      reviewedAt: new Date().toISOString(),
      policy: "defensive-only",
      skillsUsed: reviewProfile.map((skill) => ({ id: skill.id, name: skill.name })),
      findingsCount: results.reduce((sum, item) => sum + item.findings.length, 0),
      heuristicFindingsCount: results.reduce((sum, item) => sum + item.heuristicFindings.length, 0),
      llmFindingsCount: results.reduce((sum, item) => sum + (item.llmReview?.findings?.length || 0), 0),
      llmCallCount: results.reduce((sum, item) => sum + (item.llmReview?.called ? 1 : 0), 0),
      llmSkippedCount: results.reduce((sum, item) => sum + (item.llmReview?.called ? 0 : 1), 0),
      projects: results
    };
  }
}



async function buildHeuristicFindings(project, reviewProfile) {
  const sourceRoot = path.join(process.cwd(), "workspace", "downloads", project.id);
  const files = await collectFiles(sourceRoot);
  const findings = [];
  const enabledSkills = new Set(reviewProfile.map((skill) => skill.id));

  // --- Dependency scanning (new) ---
  if (enabledSkills.has("dependency-risk")) {
    const depFindings = await scanDependencies(sourceRoot);
    findings.push(...depFindings);
  }

  for (const file of files) {
    const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");

    // Skip test files, minified files, node_modules etc.
    if (SKIP_PATTERNS.some((pattern) => pattern.test(relative))) continue;

    let content;
    try {
      const stat = await fs.stat(file);
      if (stat.size > 512 * 1024) continue; // skip files > 512KB
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }

    const loweredPath = relative.toLowerCase();

    // ===== ACCESS CONTROL RULES =====
    if (enabledSkills.has("access-control")) {
      if (
        hasObjectAccessIndicator(content) &&
        !hasAuthGuardIndicator(content) &&
        /(controller|route|resolver|service|api|handler|view)/.test(loweredPath)
      ) {
        findings.push(createFinding({
          skillId: "access-control",
          title: "对象级访问控制边界值得重点复核",
          severity: "medium",
          confidence: 0.76,
          location: relative,
          impact: "如果控制器或服务层直接信任客户端提交的对象标识，可能导致跨用户或跨租户读取、修改内容。",
          evidence: `在 ${relative} 中发现了客户端可控对象标识的处理痕迹，但同文件附近没有明显的 ownership / policy / guard 校验线索。`,
          remediation: "在对象查询后、返回或修改前统一执行 role、tenant 与 ownership 校验，并让服务层承担二次鉴权职责。",
          safeValidation: "本地复核控制器到服务层的调用链，确认对象查找后的每条读写路径都执行了访问控制。"
        }));
      }

      if (
        matches(content, /\b(public|anonymous|guest)\b/i, /\b(permission|permissions|role|roles|allow|grant|create|update|delete|read|find)\b/i) &&
        /(permission|policy|role|acl|rbac|config)/.test(loweredPath)
      ) {
        findings.push(createFinding({
          skillId: "access-control",
          title: "公共角色权限配置可能过宽",
          severity: "high",
          confidence: 0.79,
          location: relative,
          impact: "如果匿名或公共角色被默认授予内容管理能力，后台或 API 可能暴露出超出预期的读写面。",
          evidence: `在 ${relative} 中发现了 public / anonymous / guest 角色与权限授予语义同时出现。`,
          remediation: "将公共角色改为 deny-by-default，只为必要的读取接口单独放行，并把管理动作留给显式认证后的角色。",
          safeValidation: "本地检查角色初始化与权限合并逻辑，确认匿名角色不会默认获得管理或写入能力。"
        }));
      }

      if (
        matches(content, /\b(auth\s*:\s*false|skipAuth|bypassAuth|allowUnauthenticated|publicRoute)\b/i, /\b(route|router|endpoint|admin|panel|plugin)\b/i) ||
        (/(route|router|admin|plugin)/.test(loweredPath) && /\bauth\s*:\s*false\b/i.test(content))
      ) {
        findings.push(createFinding({
          skillId: "access-control",
          title: "部分管理或插件路由显式关闭认证",
          severity: "high",
          confidence: 0.8,
          location: relative,
          impact: "如果这些路由位于后台、插件或管理入口附近，显式关闭认证可能直接扩大高价值接口的暴露面。",
          evidence: `在 ${relative} 中发现了 auth:false 或类似绕过认证的配置语义。`,
          remediation: "对后台、插件与管理路由采用显式白名单，默认启用鉴权与权限中间件，再按需对公开只读接口单独豁免。",
          safeValidation: "本地检查路由注册代码，确认仅少量公开只读接口会关闭认证，管理与插件路由默认受保护。"
        }));
      }
    }

    // ===== BOOTSTRAP CONFIG RULES =====
    if (enabledSkills.has("bootstrap-config")) {
      if (
        matches(content, /\b(bootstrapAdmin|seedAdmin|createFirstAdmin|registerInitialAdmin|setupAdmin|initialAdmin)\b/i, /\b(process\.env|config|if\s*\(!|allowBootstrap|enableBootstrap)\b/i)
      ) {
        findings.push(createFinding({
          skillId: "bootstrap-config",
          title: "初始化管理员入口需要确认关闭条件",
          severity: "high",
          confidence: 0.82,
          location: relative,
          impact: "如果首次管理员创建逻辑缺少严格的单次条件或部署态关闭机制，生产环境可能暴露出高权限初始化入口。",
          evidence: `在 ${relative} 中发现了管理员初始化逻辑，并与环境配置或缺省条件绑定。`,
          remediation: "将首次管理员创建流程改为一次性、显式确认、默认关闭，并确保初始化完成后彻底失效。",
          safeValidation: "本地审查启动与迁移流程，确认生产缺省态下不存在可重复触发的管理员初始化路径。"
        }));
      }
    }


    // ===== UPLOAD & STORAGE RULES =====
    if (enabledSkills.has("upload-storage")) {
      if (
        matches(content,
          /\b(upload|multer|formidable|busboy|content-type|multipart|move_uploaded_file|\$_FILES|FileField|InMemoryUploadedFile)\b/i,
          /\b(path\.join|fs\.writeFile|writeFileSync|createWriteStream|public\/|static\/|open\(|os\.path\.join|shutil)\b/)
      ) {
        findings.push(createFinding({
          skillId: "upload-storage",
          title: "上传与公开文件边界值得重点审查",
          severity: "medium",
          confidence: 0.71,
          location: relative,
          impact: "如果上传内容的类型、文件名或公开访问目录没有被严格隔离，可能引发任意文件覆盖、危险内容托管或后台资源泄露。",
          evidence: `在 ${relative} 中同时出现了上传处理与文件落盘或公开目录语义。`,
          remediation: "对文件类型、扩展名、目标路径和公开目录做统一收口，公开资源目录与后台可执行路径应彻底隔离。",
          safeValidation: "本地复核上传链路，确认文件名、目标路径、MIME 与公开访问目录都经过规范化控制。"
        }));
      }
    }

    // ===== SECRET EXPOSURE RULES =====
    if (enabledSkills.has("secret-exposure")) {
      if (
        matches(content, /\b(password|secret|token|api[_-]?key)\b/i, /\b(default|example|changeme|admin123|test|demo|sample)\b/i) &&
        !/(example|sample|demo|template|readme)/i.test(loweredPath)
      ) {
        findings.push(createFinding({
          skillId: "secret-exposure",
          title: "疑似存在默认凭据或占位密钥风险",
          severity: "high",
          confidence: 0.74,
          location: relative,
          impact: "如果这些默认值会进入初始化流程、后台登录或第三方集成配置，真实部署时可能留下可猜测的高风险入口。",
          evidence: `在 ${relative} 中发现了凭据命名与默认值样式同时出现。`,
          remediation: "移除可运行的默认凭据；缺失密钥时应 fail closed，而不是退回演示或占位值。",
          safeValidation: "本地检查配置装载与初始化逻辑，确认占位值不会被当作真实凭据接受。"
        }));
      }

      if (matches(content, /\b(NEXT_PUBLIC_|PUBLIC_|VITE_)\b/, /\b(secret|token|api[_-]?key|admin|password)\b/i)) {
        findings.push(createFinding({
          skillId: "secret-exposure",
          title: "公开前端变量中疑似携带敏感配置",
          severity: "medium",
          confidence: 0.68,
          location: relative,
          impact: "如果敏感令牌或后台配置通过公开构建变量注入前端，可能导致管理能力或集成密钥暴露。",
          evidence: `在 ${relative} 中发现了公开前端环境变量前缀与敏感配置命名同时出现。`,
          remediation: "把敏感配置留在服务端，前端仅使用临时票据、代理接口或最小化公开标识。",
          safeValidation: "本地检查构建配置与运行时注入逻辑，确认公开变量中不包含后台密钥或管理接口凭据。"
        }));
      }
    }

    // ===== QUERY SAFETY RULES (multi-language) =====
    if (enabledSkills.has("query-safety")) {
      const sqlInjectionPatterns = [
        // Node.js
        /\b(raw\(|sequelize\.query\(|knex\.raw\(|prisma\.[a-z]+Raw\(|SELECT\b|UPDATE\b|DELETE\b)\b/i,
        // Python
        /\b(cursor\.execute\(|\.raw\(|RawSQL\(|text\()\b/i,
        // PHP
        /\b(mysql_query\(|mysqli_query\(|pg_query\(|\$wpdb->query\(|DB::raw\()\b/i,
        // Go
        /\b(db\.Query\(|db\.Exec\(|tx\.Query\(|sqlx\.Get\()\b/i
      ];
      const userInputPatterns = [
        // Node.js
        /(`[^`]*\$\{|\+\s*(req|params|query|body)|\b(req|params|query|body)\b)/i,
        // Python
        /\b(request\.(args|form|json|data|GET|POST)|f["'][^"']*\{)\b/i,
        // PHP
        /\b(\$_GET|\$_POST|\$_REQUEST|\$_COOKIE)\b/,
        // Go
        /\b(r\.URL\.Query\(\)|r\.FormValue\(|c\.Query\(|c\.Param\()\b/
      ];

      if (
        sqlInjectionPatterns.some((p) => p.test(content)) &&
        userInputPatterns.some((p) => p.test(content))
      ) {
        findings.push(createFinding({
          skillId: "query-safety",
          title: "动态查询构造路径需要重点确认",
          severity: "medium",
          confidence: 0.64,
          location: relative,
          impact: "如果这类动态查询直接拼接外部输入，内容检索、管理后台筛选或插件接口可能出现持久层注入风险。",
          evidence: `在 ${relative} 中发现了原始查询语义，并伴随模板插值或外部输入拼接痕迹。`,
          remediation: "优先改用参数化查询或 ORM 安全接口，并对动态排序、筛选字段做白名单约束。",
          safeValidation: "本地确认原始查询是否始终采用参数绑定，动态字段和值是否都经过白名单控制。"
        }));
      }
    }


    // ===== AUTH BYPASS RULES (new) =====
    if (enabledSkills.has("auth-bypass")) {
      // developerMode || true pattern
      if (/\b(developerMode|devMode|debugMode|testMode|bypassAuth)\s*(\|\||&&|\?\?)\s*(true|1|!0)\b/i.test(content)) {
        findings.push(createFinding({
          skillId: "auth-bypass",
          title: "开发者模式条件短路可能绕过认证",
          severity: "critical",
          confidence: 0.9,
          location: relative,
          impact: "developerMode || true 这类模式会导致认证逻辑被永久绕过，攻击者无需任何凭据即可获得完全访问权。",
          evidence: `在 ${relative} 中发现了 developerMode/devMode/debugMode 与 || true 或类似短路模式。`,
          remediation: "移除开发模式短路逻辑；如必须保留调试入口，改为环境变量控制且默认关闭。",
          safeValidation: "确认生产构建中不存在可被外部触发的开发模式跳过逻辑。"
        }));
      }

      // Middleware skip patterns (multi-language)
      if (
        matches(content,
          /\b(isAuthenticated|requireAuth|authenticate|checkAuth|verifyToken|loginRequired|login_required)\b/i,
          /\b(skip|bypass|disable|exclude|whitelist|ignore|next\(\))\b/i) &&
        /(middleware|auth|guard|decorator|interceptor)/.test(loweredPath)
      ) {
        findings.push(createFinding({
          skillId: "auth-bypass",
          title: "认证中间件存在可配置的跳过逻辑",
          severity: "high",
          confidence: 0.77,
          location: relative,
          impact: "如果认证跳过条件可以被攻击者控制（如通过请求头、Cookie 或路径匹配），则认证保护形同虚设。",
          evidence: `在 ${relative} 中发现认证函数与 skip/bypass/whitelist 等跳过语义同时出现。`,
          remediation: "跳过列表应为硬编码白名单，不接受外部输入；路径匹配应使用精确匹配而非前缀匹配。",
          safeValidation: "确认跳过逻辑的条件来源是否完全由服务端控制。"
        }));
      }

      // PHP: authentication bypass via type juggling
      if (/\b(md5|sha1)\s*\(\s*\$/.test(content) && /==\s*['"]0e/.test(content)) {
        findings.push(createFinding({
          skillId: "auth-bypass",
          title: "PHP 松散比较可能导致认证绕过（Magic Hash）",
          severity: "critical",
          confidence: 0.88,
          location: relative,
          impact: "使用 == 比较 MD5/SHA1 哈希值时，0e 开头的哈希会被 PHP 当作科学计数法 0 处理，导致不同密码通过验证。",
          evidence: `在 ${relative} 中发现了 md5/sha1 哈希与松散比较 (==) 和 0e 模式。`,
          remediation: "使用 === 严格比较或 hash_equals() 进行哈希对比。",
          safeValidation: "确认所有密码/token 比较都使用了严格比较或 timing-safe 函数。"
        }));
      }
    }

    // ===== JWT ISSUES RULES (new) =====
    if (enabledSkills.has("jwt-issues")) {
      // Hardcoded JWT secret
      if (
        /\b(jwt|jsonwebtoken|jose)\b/i.test(content) &&
        /\b(secret|key|SECRET|KEY)\s*[:=]\s*['"][^'"]{1,30}['"]/i.test(content)
      ) {
        findings.push(createFinding({
          skillId: "jwt-issues",
          title: "JWT 密钥疑似硬编码",
          severity: "critical",
          confidence: 0.85,
          location: relative,
          impact: "硬编码的 JWT 密钥意味着任何获取源码的人都能伪造有效 token，完全绕过身份认证。",
          evidence: `在 ${relative} 中发现了 JWT 相关代码与硬编码字符串密钥赋值。`,
          remediation: "将 JWT 密钥移到环境变量或密钥管理服务，缺失时 fail closed 拒绝启动。",
          safeValidation: "确认 JWT 签名密钥来源为环境变量或外部密钥管理，不存在可预测的回退值。"
        }));
      }

      // jwtSecret || 'fallback' pattern
      if (/\b(jwtSecret|JWT_SECRET|secretKey|tokenSecret)\b\s*\|\|\s*['"]/.test(content)) {
        findings.push(createFinding({
          skillId: "jwt-issues",
          title: "JWT 密钥存在可预测的 fallback 默认值",
          severity: "critical",
          confidence: 0.92,
          location: relative,
          impact: "如果环境变量未配置，系统会回退到源码中的默认密钥，攻击者可直接伪造 JWT 获得任意身份。",
          evidence: `在 ${relative} 中发现了 jwtSecret || 'xxx' 这类带默认值的密钥获取模式。`,
          remediation: "移除 || 回退逻辑，密钥缺失时应抛出错误拒绝启动。",
          safeValidation: "确认密钥获取链路中不存在任何字面量回退值。"
        }));
      }

      // Algorithm not enforced
      if (/\b(algorithm|algorithms)\b/i.test(content) && /\b(none|HS256|header\.alg)\b/i.test(content) && /verify/i.test(content)) {
        findings.push(createFinding({
          skillId: "jwt-issues",
          title: "JWT 验证可能允许算法降级或 none 算法",
          severity: "high",
          confidence: 0.72,
          location: relative,
          impact: "如果服务端接受客户端指定的算法（特别是 none），攻击者可以构造无签名的 token 通过验证。",
          evidence: `在 ${relative} 中发现了 JWT 验证代码与算法相关逻辑同时出现。`,
          remediation: "在 verify 选项中硬编码允许的算法列表，禁止 none 算法，不信任 token header 中的 alg 字段。",
          safeValidation: "确认 JWT verify 调用中显式指定了 algorithms 白名单。"
        }));
      }
    }


    // ===== CRYPTO MISUSE RULES (new) =====
    if (enabledSkills.has("crypto-misuse")) {
      // Deprecated createCipher (Node.js)
      if (/\bcreate(?:Cipher|Decipher)\s*\(/.test(content) && !/\bcreate(?:Cipher|Decipher)iv\s*\(/.test(content)) {
        findings.push(createFinding({
          skillId: "crypto-misuse",
          title: "使用已废弃的 createCipher API（无 IV）",
          severity: "high",
          confidence: 0.91,
          location: relative,
          impact: "createCipher 不使用初始化向量(IV)，相同密钥和明文会产生相同密文，无法抵抗密文分析攻击。",
          evidence: `在 ${relative} 中发现了 createCipher/createDecipher 调用（不含 iv 后缀）。`,
          remediation: "迁移到 createCipheriv/createDecipheriv，并为每次加密生成随机 IV。",
          safeValidation: "确认所有对称加密调用都使用了 iv 版本的 API。"
        }));
      }

      // MD5/SHA1 for passwords
      if (
        matches(content,
          /\b(md5|sha1|SHA1|MD5)\b/,
          /\b(password|passwd|pwd|credential|secret)\b/i)
      ) {
        findings.push(createFinding({
          skillId: "crypto-misuse",
          title: "使用弱哈希算法处理密码/凭据",
          severity: "high",
          confidence: 0.82,
          location: relative,
          impact: "MD5/SHA1 运算速度极快且存在碰撞，不适合密码哈希，彩虹表攻击可快速还原明文。",
          evidence: `在 ${relative} 中发现了 MD5/SHA1 与密码/凭据相关语义同时出现。`,
          remediation: "密码哈希应使用 bcrypt、scrypt 或 Argon2，并加入足够的 cost factor。",
          safeValidation: "确认所有密码存储和验证路径使用了现代密码哈希算法。"
        }));
      }

      // TLS verification disabled
      if (
        /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?/.test(content) ||
        /rejectUnauthorized\s*:\s*false/.test(content) ||
        /verify\s*=\s*False/.test(content) ||  // Python requests
        /InsecureSkipVerify\s*:\s*true/.test(content)  // Go
      ) {
        findings.push(createFinding({
          skillId: "crypto-misuse",
          title: "TLS 证书验证被全局禁用",
          severity: "high",
          confidence: 0.88,
          location: relative,
          impact: "禁用 TLS 验证使得所有 HTTPS 连接容易受到中间人攻击，攻击者可截获和篡改加密通信。",
          evidence: `在 ${relative} 中发现了禁用 TLS 证书验证的代码。`,
          remediation: "移除全局 TLS 禁用；如必须对接自签名证书，仅为特定连接配置自定义 CA。",
          safeValidation: "确认生产环境不存在全局禁用 TLS 验证的代码。"
        }));
      }

      // ECB mode
      if (/\b(ECB|aes-\d+-ecb|AES\/ECB)\b/i.test(content)) {
        findings.push(createFinding({
          skillId: "crypto-misuse",
          title: "使用 ECB 模式加密（不安全）",
          severity: "medium",
          confidence: 0.86,
          location: relative,
          impact: "ECB 模式不能隐藏数据模式，相同的明文块会产生相同的密文块，可通过模式分析还原信息。",
          evidence: `在 ${relative} 中发现了 ECB 加密模式的使用。`,
          remediation: "改用 CBC（需随机 IV）或 GCM（提供认证加密）模式。",
          safeValidation: "确认对称加密使用了 CBC/GCM/CTR 等安全模式。"
        }));
      }
    }

    // ===== DESERIALIZATION RULES (new) =====
    if (enabledSkills.has("deserialization")) {
      const deserializationPatterns = [
        // Node.js
        { regex: /\beval\s*\(\s*(req|params|query|body|input|data|user)/i, lang: "Node.js eval" },
        { regex: /\bnew\s+Function\s*\(\s*(req|params|query|body|input|data)/i, lang: "Node.js Function constructor" },
        { regex: /\b(vm|vm2)\.run(InContext|InNewContext|InThisContext)?\s*\(/i, lang: "Node.js VM" },
        // Python
        { regex: /\b(pickle\.loads?|cPickle\.loads?|shelve\.open)\s*\(/i, lang: "Python pickle" },
        { regex: /\byaml\.load\s*\([^)]*(?!Loader\s*=\s*yaml\.SafeLoader)/i, lang: "Python yaml.load" },
        { regex: /\b(__import__|exec|eval)\s*\(\s*(request|input|data)/i, lang: "Python eval/exec" },
        // PHP
        { regex: /\bunserialize\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/i, lang: "PHP unserialize" },
        { regex: /\bassert\s*\(\s*\$_(GET|POST|REQUEST)/i, lang: "PHP assert" },
        // Java
        { regex: /\b(ObjectInputStream|readObject|XMLDecoder)\b/i, lang: "Java deserialization" }
      ];

      for (const { regex, lang } of deserializationPatterns) {
        if (regex.test(content)) {
          findings.push(createFinding({
            skillId: "deserialization",
            title: `不安全的反序列化/代码执行入口 (${lang})`,
            severity: "critical",
            confidence: 0.84,
            location: relative,
            impact: "攻击者通过构造恶意序列化数据或代码字符串，可能实现远程代码执行（RCE）。",
            evidence: `在 ${relative} 中发现了 ${lang} 相关的不安全反序列化模式。`,
            remediation: "避免对用户输入使用 eval/unserialize/pickle.loads；如需动态执行，使用安全沙箱或白名单机制。",
            safeValidation: "确认所有反序列化/动态执行入口的输入来源不可被外部控制。"
          }));
          break; // one finding per file for this category
        }
      }
    }


    // ===== PATH TRAVERSAL RULES (new) =====
    if (enabledSkills.has("path-traversal")) {
      const pathTraversalPatterns = [
        // Node.js
        { regex: /\bpath\.(join|resolve)\s*\([^)]*\b(req|params|query|body)\b/i, lang: "Node.js" },
        { regex: /\b(readFile|readFileSync|createReadStream)\s*\([^)]*\b(req|params|query|body)\b/i, lang: "Node.js fs" },
        // Python
        { regex: /\bos\.path\.join\s*\([^)]*\b(request|input)\b/i, lang: "Python" },
        { regex: /\bopen\s*\([^)]*\b(request\.(args|form|GET|POST))/i, lang: "Python" },
        // PHP
        { regex: /\b(file_get_contents|fopen|include|require|readfile)\s*\([^)]*\$_(GET|POST|REQUEST)/i, lang: "PHP" },
        // Go
        { regex: /\bfilepath\.(Join|Clean)\s*\([^)]*\b(r\.|c\.|ctx\.)/i, lang: "Go" }
      ];

      for (const { regex, lang } of pathTraversalPatterns) {
        if (regex.test(content)) {
          // Check if there's a sanitization
          const hasSanitization = /\b(realpath|normalize|sanitize|basename|path\.basename|filepath\.Base)\b/i.test(content);
          if (!hasSanitization) {
            findings.push(createFinding({
              skillId: "path-traversal",
              title: `文件路径拼接缺少规范化检查 (${lang})`,
              severity: "high",
              confidence: 0.78,
              location: relative,
              impact: "攻击者可通过 ../ 序列逃出预期目录，读取或覆盖服务器上的任意文件。",
              evidence: `在 ${relative} 中发现了将用户输入直接拼接到文件路径的模式，且未发现 realpath/basename 等规范化检查。`,
              remediation: "对路径做 path.resolve() 后检查是否仍在允许的目录前缀内；或使用 path.basename() 只取文件名。",
              safeValidation: "确认所有文件操作路径经过规范化且包含前缀校验。"
            }));
            break;
          }
        }
      }
    }

    // ===== SSRF RULES (new) =====
    if (enabledSkills.has("ssrf")) {
      const ssrfSourcePatterns = [
        // Node.js
        /\b(fetch|axios|request|got|superagent|http\.get|https\.get|urllib)\s*\(\s*[^'")\s]*\b(req|params|query|body|url|target|host)\b/i,
        /\b(fetch|axios|request|got)\s*\(\s*`[^`]*\$\{/i,
        // Python
        /\b(requests\.(get|post|put)|urllib\.(request\.)?urlopen|httpx\.(get|post))\s*\(\s*[^'")\s]*\b(request|input|url)\b/i,
        // PHP
        /\b(file_get_contents|curl_exec|fopen)\s*\([^)]*\$_(GET|POST|REQUEST)/i,
        // Go
        /\bhttp\.(Get|Post|NewRequest)\s*\([^)]*\b(r\.|c\.|ctx\.)/i
      ];

      if (ssrfSourcePatterns.some((p) => p.test(content))) {
        const hasProtection = /\b(whitelist|allowlist|isAllowed|validateUrl|isInternal|private|127\.0\.0\.1|localhost|10\.|172\.|192\.168)\b/i.test(content);
        if (!hasProtection) {
          findings.push(createFinding({
            skillId: "ssrf",
            title: "用户可控 URL 直接用于服务端请求（SSRF）",
            severity: "high",
            confidence: 0.75,
            location: relative,
            impact: "攻击者可利用服务端发起请求探测内网服务、读取云元数据（169.254.169.254）或攻击内部 API。",
            evidence: `在 ${relative} 中发现了用户可控参数直接传入 HTTP 请求函数，且未发现域名/IP 白名单检查。`,
            remediation: "实施 URL 白名单校验，禁止 private IP 和元数据地址，使用 DNS 解析后二次校验目标 IP。",
            safeValidation: "确认所有接受外部 URL 的接口都实施了协议、域名和 IP 地址校验。"
          }));
        }
      }
    }

    // ===== XSS RULES (new) =====
    if (enabledSkills.has("xss")) {
      const xssPatterns = [
        // Node.js: direct HTML response with user input
        /\b(res\.(send|write|end))\s*\([^)]*\b(req|params|query|body)\b/i,
        /\b(res\.(send|write))\s*\(\s*`[^`]*\$\{[^}]*(req|params|query|body)/i,
        /\b(res\.(send|write))\s*\(\s*['"]<[^'"]*\+\s*(req|params|query|body)/i,
        // PHP: direct echo/print with user input
        /\b(echo|print|print_r)\s+.*\$_(GET|POST|REQUEST|COOKIE)/i,
        // Python: format string in response
        /\b(render_template_string|Markup)\s*\([^)]*\b(request|input)\b/i,
        // Template engines with unescaped output
        /\{\{\{[^}]*\}\}\}/, // Handlebars unescaped
        /\{!![^}]*!!\}/, // Blade unescaped
        /\|\s*safe\b/, // Django/Jinja2 |safe filter
      ];

      if (xssPatterns.some((p) => p.test(content))) {
        const hasEscaping = /\b(escapeHtml|sanitize|DOMPurify|xss|encode|htmlspecialchars|bleach|markupsafe)\b/i.test(content);
        if (!hasEscaping) {
          findings.push(createFinding({
            skillId: "xss",
            title: "用户输入直接拼接到 HTML 响应（XSS）",
            severity: "high",
            confidence: 0.73,
            location: relative,
            impact: "攻击者可注入恶意脚本窃取用户 Cookie/Session，进行钓鱼或执行任意操作。",
            evidence: `在 ${relative} 中发现了用户输入直接嵌入 HTML 响应的模式，且未发现转义/净化处理。`,
            remediation: "所有动态内容输出前使用上下文相关的转义（HTML/JS/URL），或使用自动转义的模板引擎。",
            safeValidation: "确认所有将用户输入输出到 HTML 的路径都经过了适当的转义处理。"
          }));
        }
      }

      // new RegExp(userInput) - ReDoS
      if (/new\s+RegExp\s*\(\s*(req|params|query|body|input|user|search|keyword|pattern)/i.test(content)) {
        findings.push(createFinding({
          skillId: "xss",
          title: "用户输入直接构造正则表达式（ReDoS）",
          severity: "medium",
          confidence: 0.8,
          location: relative,
          impact: "攻击者可构造恶意正则导致指数级回溯，使服务器 CPU 耗尽产生拒绝服务。",
          evidence: `在 ${relative} 中发现了 new RegExp(userInput) 模式。`,
          remediation: "对用户输入做正则元字符转义（escapeRegex），或使用固定的搜索算法替代正则匹配。",
          safeValidation: "确认所有动态构造正则的输入都经过了元字符转义。"
        }));
      }
    }
  }

  return prioritizeFindings(findings).slice(0, MAX_FINDINGS_PER_PROJECT);
}



function createFinding(finding) {
  return {
    source: "rule",
    ...finding
  };
}

function prioritizeFindings(findings) {
  const deduped = [];
  const seen = new Set();
  for (const finding of findings) {
    const key = `${finding.title}::${finding.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(finding);
  }

  return deduped
    .filter((finding) => finding.confidence >= 0.6)
    .sort((a, b) => severityScore(b.severity) - severityScore(a.severity) || b.confidence - a.confidence);
}

function hasObjectAccessIndicator(content) {
  return (
    /(req|request)\.(params|query)\.[a-zA-Z0-9_]+/.test(content) ||
    /\b(ctx|event)\.(params|query)\.[a-zA-Z0-9_]+/.test(content) ||
    // PHP
    /\$_(GET|POST|REQUEST)\s*\[\s*['"][a-zA-Z0-9_]+['"]\s*\]/.test(content) ||
    // Python Flask/Django
    /\b(request\.(args|form|json)\.get|request\.(GET|POST)\[)/.test(content) ||
    // Go
    /\b(c\.Param|c\.Query|r\.URL\.Query\(\)\.Get)\s*\(/.test(content)
  );
}

function hasAuthGuardIndicator(content) {
  return /\b(can|authorize|authorization|permission|permissions|policy|guard|rbac|ownership|tenant|@login_required|@permission_required|@requires_auth)\b/i.test(content);
}

function severityScore(value) {
  return value === "critical" ? 4 : value === "high" ? 3 : value === "medium" ? 2 : 1;
}

async function collectFiles(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const output = [];
    for (const entry of entries) {
      // Skip common non-source directories
      if (entry.isDirectory() && /^(node_modules|\.git|vendor|__pycache__|\.next|\.nuxt|coverage|\.tox|\.venv|venv|env)$/.test(entry.name)) {
        continue;
      }
      const target = path.join(root, entry.name);
      if (entry.isDirectory()) output.push(...(await collectFiles(target)));
      else {
        // Only process source-like files
        const ext = path.extname(entry.name).toLowerCase();
        if (/^\.(js|ts|jsx|tsx|mjs|cjs|py|php|go|rb|java|cs|rs|vue|svelte|yaml|yml|json|toml|ini|cfg|env|conf)$/.test(ext) || entry.name === '.env' || entry.name === 'Dockerfile') {
          output.push(target);
        }
      }
    }
    return output;
  } catch {
    return [];
  }
}

function matches(content, requiredA, requiredB) {
  return requiredA.test(content) && requiredB.test(content);
}
