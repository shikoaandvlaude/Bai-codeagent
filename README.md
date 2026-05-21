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
