const AUDIT_SKILLS = [
  {
    id: "access-control",
    name: "访问控制",
    description: "关注对象级授权、公共角色、插件路由和后台访问边界。",
    reviewPrompt: "重点检查对象级访问控制、公共角色权限、管理接口与插件路由是否存在过宽暴露。"
  },
  {
    id: "bootstrap-config",
    name: "初始化与配置",
    description: "关注初始化管理员、开发开关、默认凭据和危险默认值。",
    reviewPrompt: "重点检查初始化管理员、开发开关、默认凭据、演示密钥和 fail-open 配置。"
  },
  {
    id: "upload-storage",
    name: "上传与存储",
    description: "关注上传链路、路径约束、公开目录和文件托管边界。",
    reviewPrompt: "重点检查上传处理、文件落盘、公开访问目录、文件类型和路径规范化控制。"
  },
  {
    id: "query-safety",
    name: "查询与注入",
    description: "关注原始查询、模板拼接、动态筛选和持久层输入约束。",
    reviewPrompt: "重点检查原始查询、动态筛选、模板插值和持久层输入拼接风险。"
  },
  {
    id: "secret-exposure",
    name: "敏感信息",
    description: "关注公开前端变量、配置文件中的密钥和占位凭据。",
    reviewPrompt: "重点检查公开变量、配置文件、环境变量和初始化脚本里的敏感信息暴露。"
  },
  {
    id: "auth-bypass",
    name: "认证绕过",
    description: "关注开发者模式跳过认证、条件短路、中间件缺失和默认放行逻辑。",
    reviewPrompt: "重点检查认证中间件是否可被 developerMode、debug 模式或条件短路绕过，是否存在默认放行逻辑。"
  },
  {
    id: "jwt-issues",
    name: "JWT 安全",
    description: "关注 JWT 硬编码密钥、算法降级、缺少过期校验和 none 算法攻击。",
    reviewPrompt: "重点检查 JWT secret 是否硬编码或可预测、算法是否可被客户端控制、是否校验 exp/iss/aud。"
  },
  {
    id: "crypto-misuse",
    name: "加密误用",
    description: "关注废弃加密算法、弱哈希、ECB 模式、硬编码 IV/Salt 和 TLS 禁用。",
    reviewPrompt: "重点检查是否使用 MD5/SHA1 做密码哈希、createCipher 废弃 API、ECB 模式、硬编码 IV 或 TLS 验证禁用。"
  },
  {
    id: "deserialization",
    name: "反序列化",
    description: "关注不安全的反序列化入口：eval、unserialize、pickle.loads、vm.runInContext 等。",
    reviewPrompt: "重点检查是否存在 eval(用户输入)、unserialize、pickle.loads、yaml.load(unsafe)、vm2/vm.runInContext 等反序列化风险。"
  },
  {
    id: "path-traversal",
    name: "路径遍历",
    description: "关注文件读写操作中路径拼接是否允许 ../ 逃逸，缺少规范化检查。",
    reviewPrompt: "重点检查 path.join/os.path.join 是否直接拼接用户输入、是否缺少 realpath 或前缀校验。"
  },
  {
    id: "ssrf",
    name: "SSRF",
    description: "关注服务端请求伪造：用户可控 URL 被直接用于 fetch/request/axios 调用。",
    reviewPrompt: "重点检查是否存在用户可控 URL 直接被 fetch/axios/requests/http.get 调用，是否缺少域名白名单或内网地址过滤。"
  },
  {
    id: "xss",
    name: "跨站脚本（XSS）",
    description: "关注用户输入直接拼接到 HTML 响应、模板引擎未转义输出。",
    reviewPrompt: "重点检查用户输入是否直接拼接到 HTML 响应、res.send/res.write 中是否包含未转义内容、模板引擎是否关闭了自动转义。"
  },
  {
    id: "dependency-risk",
    name: "依赖风险",
    description: "关注 package.json/requirements.txt 中已知危险、已废弃或 EOL 的依赖包。",
    reviewPrompt: "重点检查项目依赖中是否包含已知存在严重漏洞的包、已停止维护的包或使用了废弃 API 的包。"
  }
];

export function getAuditSkillCatalog() {
  return AUDIT_SKILLS.map((skill) => ({ ...skill }));
}

export function resolveAuditSkills(selectedIds = []) {
  if (!Array.isArray(selectedIds) || !selectedIds.length) {
    return getAuditSkillCatalog();
  }

  const selected = new Set(selectedIds);
  const resolved = AUDIT_SKILLS.filter((skill) => selected.has(skill.id));
  return resolved.length ? resolved.map((skill) => ({ ...skill })) : getAuditSkillCatalog();
}
