# Bai-codeagent

## 环境要求

- Node.js 18+ (Web面板)
- Python 3.8+ (渗透工具 + MCP Server)
- Go 1.20+ (安全工具)
- Claude Code (自动化，需 Claude Pro/Max)

## 启动

```bash
npm install
npm start
```

---

## 2025.05 更新：Shannon 框架能力整合

在保留原有全部功能的基础上，整合了 [Shannon](https://github.com/baianquanzu/shannon) 框架的核心能力，新增 **5 大模块**：

### 新增模块一览

| 模块 | 文件 | 能力 |
|------|------|------|
| **中文报告引擎** | `claude-hunt/auto_agent/shannon_report.py` | Shannon 风格结构化中文安全评估报告 |
| **白盒代码审计** | `claude-hunt/auto_agent/code_auditor.py` | 5 类并行代码审计（静态扫描 + LLM 辅助） |
| **利用验证引擎** | `claude-hunt/auto_agent/exploit_engine.py` | 4 级深度利用链（确认→指纹→枚举→提取） |
| **Pipeline 编排** | `claude-hunt/auto_agent/pipeline_orchestrator.py` | Temporal 风格工作流（并行、断点恢复、重试） |
| **浏览器会话管理** | `claude-hunt/auto_agent/browser_session_manager.py` | Playwright 多 session 隔离 + API 自动发现 |

### 中文报告引擎 (`shannon_report.py`)

- **三分类漏洞整理**：已验证可利用 / 环境阻断暂未打通 / 误报
- **优先修复排序**：按严重程度自动排序，带修复建议
- **覆盖度统计**：测试类型、请求数、耗时完整记录
- **双格式输出**：Markdown + HTML 报告
- **兼容适配**：直接接受 `auto_hunt.py` 的 findings 格式

```python
from shannon_report import generate_shannon_report

report = generate_shannon_report(
    target="example.com",
    findings=findings,  # auto_hunt 的 findings dict
    output_dir="./reports",
)
```

### 白盒代码审计 (`code_auditor.py`)

- **5 类并行分析**：Injection / XSS / Auth / Authz / SSRF
- **数据流追踪**：Source → Sanitizer → Sink 完整路径
- **双模式**：无 LLM 时用正则启发式，有 LLM 时用 DeepSeek/OpenAI 深度审计
- **结构化输出**：exploitation_queue（供 exploit_engine 使用）+ findings（供 auto_hunt 使用）

```python
from code_auditor import run_code_audit

results = await run_code_audit(
    repo_path="/path/to/source",
    llm_config={"api_key": "sk-...", "model": "deepseek-chat"},
)
# results["findings"] 可直接注入 auto_hunt 的 vulnerabilities
```

### 利用验证引擎 (`exploit_engine.py`)

与现有 `real_validator.py` 互补（后者做轻量验证，此模块做完整利用链）：

- **SQLi 完整链**：确认 → 数据库指纹 → 枚举表 → 提取数据
- **XSS / SSRF / CMDi**：多 payload 尝试 + WAF 自适应绕过
- **4 级利用深度**：Level 1 确认 → Level 4 关键影响证明
- **证据链记录**：每步的 payload、响应、判断逻辑完整可复现

### Pipeline 编排 (`pipeline_orchestrator.py`)

纯 Python 实现的 Temporal 风格工作流引擎（不依赖 Docker）：

- **5 路并行 Pipeline**：每类漏洞独立 vuln→exploit 流水线
- **断点恢复**：崩溃后自动从上次位置继续
- **指数退避重试**：失败自动重试，不因单个错误终止
- **实时进度**：`get_progress()` 随时查询当前状态
- **事件系统**：回调通知各阶段开始/完成/失败

### 浏览器会话管理 (`browser_session_manager.py`)

- **多 Session 隔离**：每个 Agent 独立 BrowserContext（Cookie/Storage 隔离）
- **自动登录**：支持自然语言步骤描述 + 通用表单自动检测
- **API 自动发现**：拦截 XHR/Fetch 请求，自动收集 API 端点和参数
- **Token 提取**：自动抓取 Authorization 头中的 Bearer Token
- **认证保活**：定期检查 Session 状态，过期自动重新登录

### 一键启动脚本 (`setup.sh`)

```bash
chmod +x setup.sh

./setup.sh              # 一键安装所有依赖（Go工具+Python+浏览器）
./setup.sh --check      # 检查工具安装状态
./setup.sh --run        # 启动 Web面板 + RedOps
./setup.sh --hunt target.com       # 全自动挖掘
./setup.sh --hunt target.com semi  # 半自动（每步确认）
```

### 与现有功能的关系

- ✅ **纯增量** — 原有代码一行未动
- ✅ **格式兼容** — 新模块输出直接接入现有 `findings` 格式
- ✅ **可选使用** — 每个新模块独立，不影响原有 `auto_hunt.py` 流程
- ✅ **灵活组合** — 黑盒挖掘用原有模块，有源码时加入代码审计，报告用 Shannon 引擎


---

## 2025.05 更新（第二轮）：5 大安全 AI 框架能力整合

在前一轮 Shannon 整合的基础上，进一步整合了 **PentAGI / HexStrike AI / CAI / RedAmon / Raptor** 五大框架的核心能力，新增 **11 个模块**。原有代码无任何修改。

### 新增模块总览

| 优先级 | 模块 | 文件 | 来源 | 能力 |
|--------|------|------|------|------|
| P0 | **Guardrails** | `guardrails.py` | CAI | 防 prompt 注入 + 危险命令拦截 + 蜜罐检测 |
| P0 | **Phase-Aware 工具限制** | `phase_tool_manager.py` | RedAmon | 按攻击阶段限制工具调用 |
| P1 | **Agent 监督** | `agent_supervisor.py` | PentAGI | 死循环检测 + 进展监控 + 资源预算 |
| P1 | **多模型交叉验证** | `multi_model_validator.py` | Raptor | N 模型独立分析 + Agreement Matrix + Judge 裁决 |
| P1 | **上下文管理** | `context_manager.py` | PentAGI | Chain Summarization + 持久记忆 + Token 预算 |
| P2 | **MCP Server** | `mcp_tool_server.py` | HexStrike | 15 个工具暴露为 MCP 协议 |
| P2 | **自动修复 → PR** | `auto_remediation.py` | RedAmon | 漏洞定位 → LLM 生成补丁 → Git → GitHub PR |
| P2 | **Fireteam 并行** | `fireteam.py` | RedAmon | 多 Agent 并行执行不同任务 |
| P3 | **攻击链模型** | `attack_chain.py` | HexStrike | 路径概率计算 + ROI 排序 + 贝叶斯更新 |
| P3 | **Knowledge RAG** | `knowledge_rag.py` | RedAmon | GTFOBins/LOLBAS/OWASP/WAF绕过/默认凭据 |
| P3 | **LLM Scorecard** | `llm_scorecard.py` | Raptor | Wilson 置信区间 + Fast-Tier 短路 + 模型排名 |

所有文件位于 `claude-hunt/auto_agent/` 目录下。

---

### P0: Guardrails (`guardrails.py`)

```python
from guardrails import SafetyGate

gate = SafetyGate()
result = gate.check_command("rm -rf /")       # → blocked=True
result = gate.check_input(user_message)        # → 检测 prompt injection
clean = gate.sanitize_output(ai_response)      # → 过滤 API key/token
```

- **InputGuardrail**: 检测角色覆盖、系统提示泄露、DAN/jailbreak、编码绕过
- **CommandBlocker**: 三级分类（CRITICAL 绝对禁止 / DANGEROUS 需确认 / CAUTION 警告）
- **OutputGuardrail**: 自动过滤 API Key、JWT、私钥、密码等敏感信息
- **TripwireDetector**: 检测蜜罐签名和异常高漏洞密度

### P0: Phase-Aware 工具限制 (`phase_tool_manager.py`)

```python
from phase_tool_manager import PhaseToolManager, AttackPhase

manager = PhaseToolManager()
manager.set_phase(AttackPhase.RECON)
manager.is_allowed("nmap")    # → True
manager.is_allowed("sqlmap")  # → False（exploit 阶段才允许）

# 自动升级阶段
manager.auto_advance(findings)
```

- 5 个 Kill Chain 阶段：RECON → WEAPONIZE → EXPLOIT → POST_EXPLOIT → REPORT
- 每阶段独立工具白名单，防止在错误阶段调用危险工具
- 自动阶段升级（基于 findings 或超时）

### P1: Agent 监督 (`agent_supervisor.py`)

```python
from agent_supervisor import AgentSupervisor

supervisor = AgentSupervisor(max_requests=500, max_duration=3600)
verdict = supervisor.observe({"tool": "nmap", "args": "...", "output": "..."})
if verdict.should_stop:
    print(f"停止: {verdict.reason}")
```

- **LoopDetector**: 连续相同动作 / 周期性循环（ABCABC...）
- **ProgressMonitor**: 无新发现超时检测
- **ResourceGuard**: 请求数/时间/连续错误预算
- **PatternDetector**: 识别 WAF 持续拦截等低效模式

### P1: 多模型交叉验证 (`multi_model_validator.py`)

```python
from multi_model_validator import run_multi_model_validation

filtered, results = await run_multi_model_validation(
    findings=vulnerabilities,
    models=[
        {"provider": "deepseek", "model": "deepseek-chat", "api_key": "sk-..."},
        {"provider": "openai", "model": "gpt-4o-mini", "api_key": "sk-..."},
    ],
)
# filtered: 过滤掉多模型共识的误报
```

- N 个模型独立分析同一漏洞（互不可见）
- Agreement Matrix 一致性计算
- 分歧时启动 Judge 模型裁决
- 自动过滤误报，提升真阳性置信度

### P1: 上下文管理 (`context_manager.py`)

```python
from context_manager import ContextManager

ctx = ContextManager(max_tokens=8000)
ctx.add_message("user", "扫描 target.com")
ctx.add_tool_output("nmap", "-sV target.com", nmap_output)
ctx.remember("ports", "22,80,443 开放", category="finding")

messages = ctx.get_context()  # 始终在 token 预算内
```

- **ChainSummarizer**: 旧消息自动压缩，保留关键发现
- **MemoryIndex**: 持久记忆，关键发现跨窗口可检索
- **SlidingWindow**: 超预算自动触发压缩

### P2: MCP Server (`mcp_tool_server.py`)

```bash
# 让 Claude Desktop / Cursor 直接调用你的安全工具
python mcp_tool_server.py                    # stdio 模式
python mcp_tool_server.py --transport sse    # HTTP SSE 模式
```

15 个注册工具：subdomain_enum / port_scan / web_fingerprint / url_discovery / vuln_scan / xss_scan / sqli_test / dir_bruteforce / active_fuzz / idor_test / race_condition / code_audit / generate_report / waf_detect / recommend_tools

### P2: 自动修复 → PR (`auto_remediation.py`)

```python
from auto_remediation import auto_fix_and_pr

results = await auto_fix_and_pr(
    findings=code_audit_findings,
    repo_path="/path/to/repo",
    llm_config={"api_key": "sk-..."},
    github_config={"token": "ghp_...", "owner": "you", "repo": "target"},
)
# 自动生成修复补丁 + 创建 GitHub PR
```

### P2: Fireteam 并行 (`fireteam.py`)

```python
from fireteam import Fireteam

team = Fireteam(max_concurrent=4)
team.add_from_template("xss_scan", targets=xss_urls)
team.add_from_template("sqli_fuzz", targets=sqli_params)
team.add_from_template("nuclei_scan", targets=alive_hosts)

results = await team.deploy()  # 4 路并行，效率翻倍
```

### P3: 攻击链模型 (`attack_chain.py`)

```python
from attack_chain import recommend_attack_chains

chains = recommend_attack_chains("target.com", {"type": "web", "has_login": True})
# → [{"name": "Web SQLi 数据提取链", "probability": "10.2%", "roi_score": "0.034"}, ...]
```

### P3: Knowledge RAG (`knowledge_rag.py`)

```python
from knowledge_rag import get_knowledge_base

kb = get_knowledge_base()
kb.query("sudo python privilege escalation")     # → GTFOBins 提权方法
kb.get_default_credentials("tomcat")             # → [("tomcat","tomcat"), ...]
kb.get_waf_bypass("cloudflare", context="SQLi")  # → 绕过技巧列表
kb.tradecraft_lookup("如何绕过 JWT 验证")          # → 相关知识上下文
```

### P3: LLM Scorecard (`llm_scorecard.py`)

```python
from llm_scorecard import get_scorecard, should_trust_model

scorecard = get_scorecard()
scorecard.record("deepseek-chat", "vuln_detection", correct=True)

# Fast-Tier: 高置信模型直接采信，跳过多模型验证
if should_trust_model("deepseek-chat", "vuln_detection"):
    pass  # 直接用，不浪费钱做交叉验证
```

---

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Bai Auto-Hunt Agent                        │
├─────────────────────────────────────────────────────────────┤
│  安全层: Guardrails + Phase-Aware + Agent Supervisor         │
├─────────────────────────────────────────────────────────────┤
│  决策层: Multi-Model Validator + LLM Scorecard + Context Mgr │
├─────────────────────────────────────────────────────────────┤
│  执行层: Fireteam + Attack Chain + Knowledge RAG             │
├─────────────────────────────────────────────────────────────┤
│  工具层: MCP Server + 原有工具链 (nuclei/httpx/dalfox/...)   │
├─────────────────────────────────────────────────────────────┤
│  输出层: Shannon Report + Auto Remediation → PR              │
└─────────────────────────────────────────────────────────────┘
```

### 设计原则

- ✅ **纯增量** — 原有 `auto_hunt.py` / `active_fuzzer.py` / `real_validator.py` 等一行未动
- ✅ **零外部依赖** — 所有新模块仅用 Python 标准库 + httpx（已安装）
- ✅ **格式兼容** — 所有模块输出直接接入现有 `findings` 字典格式
- ✅ **可选使用** — 每个模块独立，按需 import，不影响原有流程
- ✅ **来源标注** — 每个模块注释标明移植自哪个框架



---

## 2025.05 更新（第三轮）：增强扫描模块 v2.0

基于对 **Redamon / Woodpecker / Pentera / NodeZero / XBOW** 等最新红队/自动化渗透框架的调研，新增 **7 个专业模块** + 1 个统一集成入口。

### 新增模块总览

| 模块 | 文件 | 能力 |
|------|------|------|
| **AI 攻击面映射** | `ai_attack_surface.py` | 资产图构建 + 风险评估 + 攻击向量生成 + 变更监控 + 可视化 |
| **子域名接管检测** | `subdomain_takeover.py` | 17+ 云服务指纹 + CNAME 悬挂检测 + HTTP 验证 + PoC 步骤 |
| **云安全扫描** | `cloud_scanner.py` | AWS S3/Azure Blob/GCP Storage 枚举 + K8s API + Docker Registry + SSRF→IMDS |
| **API 安全测试** | `api_security_scanner.py` | GraphQL 内省/IDOR/DoS + REST 认证绕过 + BOLA + Mass Assignment + WebSocket |
| **凭证泄露检测** | `credential_hunter.py` | 30+ 密钥正则 + 敏感文件探测 + JS 提取 + 自动验证 + GitHub Dork |
| **高级 WAF 绕过** | `waf_evasion_advanced.py` | 12 品牌 WAF 指纹 + 自适应绕过 + HTTP 走私 + 中国 WAF 专用 |
| **专业报告生成** | `report_generator.py` | Markdown/HTML/JSON + HackerOne/Bugcrowd/补天格式 + CVSS + CWE |
| **统一集成入口** | `enhanced_scanner.py` | 一键调度所有模块 + CLI 工具 + 摘要输出 |

### 快速使用

```bash
# 全量扫描
python enhanced_scanner.py --target example.com --all

# 选择模块
python enhanced_scanner.py --target example.com --cloud --takeover --creds

# API 安全 + 报告
python enhanced_scanner.py --target example.com --api --report html

# WAF 分析
python enhanced_scanner.py --target example.com --waf
```

### 作为库导入

```python
from enhanced_scanner import EnhancedScanner
import asyncio

config = {...}  # 从 config.yaml 加载
scanner = EnhancedScanner(config)
results = asyncio.run(scanner.full_scan("example.com", modules=["cloud", "api", "credentials"]))
```

### 各模块详细说明

#### AI 攻击面映射 (`ai_attack_surface.py`)

```python
from ai_attack_surface import AttackSurfaceMapper

mapper = AttackSurfaceMapper()
surface = asyncio.run(mapper.map_target("example.com", recon_dir="./recon"))
mapper.visualize(surface, format="mermaid")  # 支持 ascii/mermaid/json
targets = mapper.get_priority_targets(surface, top_n=10)
```

- 多源数据聚合（子域名、端口、服务、技术栈）
- 18 种技术栈 → 已知漏洞关联
- 子域名敏感模式识别（dev/staging/admin/jenkins...）
- 历史对比（新增/消失资产高亮）
- Mermaid 流程图可视化

#### 子域名接管检测 (`subdomain_takeover.py`)

```python
from subdomain_takeover import SubdomainTakeoverScanner

scanner = SubdomainTakeoverScanner()
results = asyncio.run(scanner.scan("example.com", subdomains_file="subs.txt"))
print(scanner.generate_report())
```

支持检测的服务：AWS S3/CloudFront/EB、Azure Blob/App Service/Traffic Manager、GitHub Pages、Heroku、Netlify、Vercel、Fastly、GCP Storage、Firebase、Shopify、Zendesk、Pantheon 等。

#### 云安全扫描 (`cloud_scanner.py`)

```python
from cloud_scanner import CloudSecurityScanner

scanner = CloudSecurityScanner()
findings = asyncio.run(scanner.scan_target("example.com"))
# SSRF payload 生成
payloads = scanner.generate_ssrf_payloads(cloud_provider="aws")
```

- S3/Azure/GCP Bucket 枚举 + 读写权限验证
- Kubernetes API 暴露检测（6443/10250/2379 端口）
- Docker Registry 未授权访问
- SSRF→IMDS Payload 生成（含绕过变体）

#### API 安全测试 (`api_security_scanner.py`)

```python
from api_security_scanner import APISecurityScanner

scanner = APISecurityScanner({"auth_token": "Bearer xxx"})
vulns = asyncio.run(scanner.scan_api("https://api.example.com", endpoints=["/users/1", "/admin"]))
```

- GraphQL: 内省泄露、别名 IDOR、批量查询 DoS
- REST: 认证绕过（8 种 Header + HTTP 方法）、BOLA/IDOR
- Mass Assignment: 特权字段注入测试
- Rate Limit: 登录端点暴力破解可行性
- WebSocket: CSWSH 跨站劫持

#### 凭证泄露检测 (`credential_hunter.py`)

```python
from credential_hunter import CredentialHunter

hunter = CredentialHunter()
secrets = asyncio.run(hunter.hunt("example.com", recon_dir="./recon"))
asyncio.run(hunter.validate_findings())  # 验证 GitHub/AWS/GCP 密钥
dorks = hunter.get_github_dorks("example.com")  # 获取 GitHub Dork 列表
```

支持 30+ 密钥模式：AWS/GCP/Azure/GitHub/Stripe/Twilio/Slack/JWT/Private Key/MongoDB/PostgreSQL/SendGrid 等。

#### 高级 WAF 绕过 (`waf_evasion_advanced.py`)

```python
from waf_evasion_advanced import WAFEvasionEngine

engine = WAFEvasionEngine()
waf_info = asyncio.run(engine.fingerprint_waf("https://target.com"))
# → WAF: cloudflare (confidence: 85%)

result = asyncio.run(engine.adaptive_bypass(
    "https://target.com/search", "' OR '1'='1", waf_info, param="q"
))
# → success=True, technique="unicode_normalize"

# HTTP 请求走私测试
smuggling = asyncio.run(engine.test_request_smuggling("https://target.com"))
```

- 12 种 WAF 指纹识别（Cloudflare/AWS WAF/Akamai/Imperva/阿里云/腾讯云/宝塔/安全狗/ModSecurity...）
- 12 种高级绕过变异器
- 自适应学习：记录成功绕过历史，优先使用有效策略
- HTTP 请求走私（CL-TE/TE-CL/TE-TE）

#### 报告生成 (`report_generator.py`)

```python
from report_generator import ReportGenerator

gen = ReportGenerator({"output_dir": "./reports"})
findings = gen.from_raw_findings(raw_data)  # 从原始数据转换
report = gen.generate(findings, target="example.com", format="hackerone")
summary = gen.generate_executive_summary(findings, "example.com")
```

支持格式：Markdown / HTML（带样式）/ JSON / HackerOne / Bugcrowd / 补天(漏洞盒子)

### 架构图（更新）

```
┌─────────────────────────────────────────────────────────────────┐
│                    Bai Auto-Hunt Agent v2.0                       │
├─────────────────────────────────────────────────────────────────┤
│  入口层: enhanced_scanner.py (CLI + Library)                     │
├─────────────────────────────────────────────────────────────────┤
│  安全层: Guardrails + Phase-Aware + Agent Supervisor             │
├─────────────────────────────────────────────────────────────────┤
│  决策层: AI Attack Surface + Multi-Model + LLM Scorecard         │
├─────────────────────────────────────────────────────────────────┤
│  扫描层: Cloud Scanner + API Security + Credential Hunter        │
│          Subdomain Takeover + WAF Evasion Advanced               │
├─────────────────────────────────────────────────────────────────┤
│  执行层: Fireteam + Attack Chain + Exploit Engine                │
├─────────────────────────────────────────────────────────────────┤
│  工具层: MCP Server + nuclei/httpx/sqlmap/dalfox/...             │
├─────────────────────────────────────────────────────────────────┤
│  输出层: Report Generator (MD/HTML/JSON/SRC平台) + Auto Fix      │
└─────────────────────────────────────────────────────────────────┘
```

### 设计原则

- ✅ **纯增量** — 原有代码零修改
- ✅ **异步高性能** — 全部基于 asyncio 并发
- ✅ **模块独立** — 每个模块可单独使用
- ✅ **统一入口** — `enhanced_scanner.py` 一键调度
- ✅ **格式兼容** — 输出可直接接入现有 findings 流程
- ✅ **中国 WAF 适配** — 阿里云/腾讯云/宝塔/安全狗 专用绕过
- ✅ **SRC 平台适配** — HackerOne/Bugcrowd/补天/漏洞盒子 报告格式
