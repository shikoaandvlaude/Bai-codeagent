# Bai-codeagent — Claude Code SRC 漏洞挖掘指南

本项目是一个基于 Claude Code 的 **全自动 SRC 漏洞挖掘 + 开源代码审计** 工具集。
分为两个模块：白盒代码审计（原有功能）和黑盒 SRC 挖掘（claude-hunt/）。

---

## 快速开始

```bash
# 1. 安装扫描工具
chmod +x claude-hunt/install_tools.sh && bash claude-hunt/install_tools.sh

# 2. 安装 Claude Code skills 和 commands
chmod +x claude-hunt/install.sh && bash claude-hunt/install.sh

# 3. 启动 Claude Code
claude

# 4. 核心四命令
/recon target.com          # 信息搜集（子域名、端口、URL、JS分析）
/hunt target.com           # 漏洞挖掘（XSS、SQLi、IDOR、SSRF等）
/validate                  # 验证漏洞（7问门控）
/report                    # 生成报告（补天/漏洞盒子/HackerOne格式）

# 5. 全自动模式
/autopilot target.com --normal   # AI 自动跑完全流程
```

---

## 架构选择：两条路径

本项目有两个核心 AI 引擎，选择取决于你的预算和使用场景：

- **DeepSeek API** = AI 决策大脑（便宜，用于 RedOps Agent 和 Auto-Hunt Agent）
- **Claude Code** = 执行双手（需要 Pro/Max 订阅，全自动化程度最高）
- **视觉 API**（通义千问 qwen-vl）= 截图识别（因为 DeepSeek 不能处理图片）

```
你有 Claude Pro/Max 订阅吗？
│
├── 有 → 用 claude-hunt（/autopilot 全自动）
│         └── 最高效率，AI 自动跑全流程
│
└── 没有 → 你有 DeepSeek API Key 吗？
            │
            ├── 有 → 选择执行方式：
            │         ├── 想要 Web 界面对话 → 用 RedOps Agent（python redops/main.py）
            │         └── 想要全自动挂机跑 → 用 Auto-Hunt Agent（python auto_hunt.py）
            │
            └── 没有 → 去 platform.deepseek.com 注册，充10块钱能用很久
```

**最佳组合：** Claude Code 做高级决策 + Auto-Hunt Agent 跑重复性任务（省 Claude token）。

---

## 项目结构

```
Bai-codeagent/
├── server.js                    # Web 面板服务器
├── public/                      # Web 前端（含 src-hunt.html）
├── src/                         # 白盒代码审计模块
│   ├── agents/                  # 审计代理（CVE审计 + SRC辅助）
│   ├── config/                  # 审计规则 + SRC漏洞模板
│   └── services/                # 报告生成、红线系统、信息搜集
├── claude-hunt/                 # 黑盒 SRC 挖掘模块（Claude Code 驱动）
│   ├── tools/                   # 自动化脚本（recon_engine.sh, hunt.py, vuln_scanner.sh）
│   ├── commands/                # Claude Code slash commands（/recon, /hunt, /report...）
│   ├── agents/                  # AI Agent 定义（autopilot, recon-agent, report-writer...）
│   ├── skills/                  # 漏洞知识库（20种Web2 + 10种Web3漏洞类）
│   ├── rules/                   # 猎手规则（始终生效）
│   ├── memory/                  # 跨会话记忆系统（pattern_db, audit_log）
│   ├── mcp/                     # MCP 集成（Burp Suite, HackerOne）
│   ├── install.sh               # 安装 skills 到 ~/.claude/
│   └── install_tools.sh         # 安装扫描工具（subfinder, nuclei, httpx...）
├── .claude/settings.json        # Claude Code 配置
└── CLAUDE.md                    # 本文件（Claude Code 自动加载）
```

---

## 中国 SRC 红线规则（始终生效）

### 绝对不能做的事

1. **不用自动化扫描器对实名SRC目标扫** — sqlmap/awvs/nessus/dirsearch 批量跑会产生大量异常请求，WAF会记录你的IP+账号，实名制下直接追溯到人。用 Fiddler/Burp 手动逐个测。
2. **不把目标网站打崩** — 并发控制在 5 次以内，不对生产环境做压力测试。一旦导致服务不可用=犯法。
3. **不涉及线上真实用户数据** — 最多用2个自己注册的账号验证，不查看/下载/传播真实用户的任何数据。
4. **不使用在线XSS平台** — 如果有人使用同款平台被执法，平台日志里你也会被查。自己搭或用 alert(1) 截图证明。
5. **没授权不碰** — 只在 SRC 授权范围内测试。不在列表里的资产碰了就是违法。
6. **BC站/黄赌毒不碰** — 博彩/赌博/色情相关网站，哪怕有漏洞也不碰。
7. **情报漏洞不做** — 截图举报类（删差评链、外挂销售、内鬼证据）不属于技术漏洞。
8. **数据库漏洞只读2-3行** — 证明能读就行，读多了=非法获取计算机信息系统数据罪。
9. **公益SRC谨慎** — 部分公益SRC会顺着排行榜/提交记录反向追查。
10. **不改数据/不删东西/不留后门** — 只读不写。修改数据=破坏计算机信息系统罪。
11. **不社工真实员工** — 钓鱼邮件/电话诈骗不在SRC收漏洞范围内。
12. **不测试核心业务高峰期** — 电商大促/支付系统忙时不测，出问题赔不起。
13. **越权只验证存在性** — 看到"能访问"就停，不要继续翻别人数据。
14. **所有操作全程录屏** — 万一被误会，录屏是你的证据。

### 测试规范

- SQL注入：AI手工构造payload验证（不用sqlmap等自动化工具，流量太大会被WAF记录+实名追溯）。只读2-3行证明存在即可。让Claude Code帮你手工构造union/盲注/时间盲注的payload。
- XSS：用 alert(1) 或截图证明即可
- 支付漏洞：选便宜商品，成功后立即取消订单，录全程视频
- 越权：只用自己注册的2个账号互相验证
- 并发：控制在5次以内，成功后立即停止
- SSRF：探测即可，不深入利用内网服务

---

## 中国 SRC 平台

| 平台 | 类型 | 备注 |
|------|------|------|
| 补天 SRC | 公益+企业 | 专属SRC可挖gov类 |
| 漏洞盒子 | 众测 | 金融类需养号 |
| 火线平台 | 众测 | 比较卷 |
| 字节跳动 SRC | 企业 | 赏金高，资产多 |
| 美团 SRC | 企业 | 业务复杂 |
| B站 SRC | 企业 | 业务功能多，适合逻辑漏洞 |
| 阿里巴巴 SRC | 企业 | 电商支付逻辑 |
| 腾讯 SRC | 企业 | 社交+游戏+支付 |

---

## 资产搜集方法（中国特色）

### 企业资产穿透
1. 企查查/天眼查搜索公司名 → 查看股权穿透图
2. 占股超过51%的子公司算作本公司资产
3. 查看知识产权：备案网站、APP、小程序、公众号、软件著作权
4. 七麦数据(qimai.cn)搜索公司旗下APP
5. 小蓝本(sou.xiaolanben.com)搜集公司信息

### FOFA 语法（常用）
```
domain="xxx.com" && (title="管理" || title="后台" || title="平台")
body="<!--统计代码，可删除-->" && header=200
cert="目标域名"
```

### 谷歌语法
```
site:xxx.com inurl:login
intitle:管理 OR intitle:后台 site:xxx.com
site:xxx.com filetype:xls
site:xxx.com "手机号" OR "身份证"
```

---

## 漏洞挖掘重点（SRC高价值目标）

### 功能点 → 漏洞映射

| 功能点 | 优先测试 |
|--------|----------|
| 支付/结算 | 负数/溢出/取消再支付/赠品篡改 |
| 登录/注册 | SQL注入/任意用户注册/验证码绕过 |
| 个人资料 | 水平越权(IDOR)/垂直越权 |
| 订单管理 | IDOR/取消再支付/并发 |
| 优惠券/积分 | 并发领取/不同金额并发 |
| 提现/转账 | 并发提现/金额篡改 |
| 短信/验证码 | 响应泄露/爆破/修改返回包/轰炸 |
| 文件上传 | 类型绕过/路径穿越/webshell |
| 图片/URL | SSRF(内网探测/云元数据) |
| API接口 | 越权/Key泄露/未授权 |

### int最大值溢出公式
```
单价 × 数量 > 2147483647（int32最大值）时溢出
2147483647 / 单价 = 最大安全数量
最大安全数量 + 1 = 溢出数量
溢出后实付 = (数量 × 单价) - 2147483648
```

### 并发测试方法（Fiddler）
1. 方法一：Shift+U 同时发送多次相同请求
2. 方法二：开启拦截模式 → 客户端多次操作 → 一次性放行（适合有随机参数的情况）

---

## 常见默认口令

| 系统 | 用户名 | 密码 |
|------|--------|------|
| k8s控制台 | admin | P@88w0rd |
| zabbix | admin | zabbix |
| grafana | admin | admin |
| nacos | nacos | nacos |
| tomcat | tomcat | tomcat |
| weblogic | weblogic | weblogic |
| rabbitmq | guest | guest |
| druid | admin | 123456 |
| 若依 | admin | admin123 |

---

## 报告格式（中国SRC标准）

```markdown
# 漏洞标题

**平台**: 补天SRC / 漏洞盒子
**目标**: xxx.com
**类型**: 业务逻辑 / 越权 / 支付
**严重程度**: 严重 / 高危 / 中危 / 低危

## 一、漏洞概述
通过修改XXX功能的XXX参数，可以实现XXX效果。

## 二、复现步骤
1. 打开目标网站 xxx.com
2. 进入XX功能页面
3. 使用Fiddler抓包，修改包中price参数为-1
4. 放行数据包，即可成功以负数金额下单

### 数据包
POST /api/order/create HTTP/1.1
Host: xxx.com
Content-Type: application/json

{"productId":"xxx","qty":-1,"price":0.01}

## 三、危害说明
该漏洞可导致攻击者以极低价格购买商品，造成平台经济损失。

## 四、修复建议
建议在服务端对金额和数量参数进行严格校验，包括类型、范围、符号检查。
```

---

## CNVD 双提交（一洞两吃）

同一个开源CMS的洞可以同时拿 CVE + CNVD：
1. 白盒审计发现0day → 写英文报告 → 交NVD拿CVE
2. 同一个洞改成中文报告 → 交CNVD拿编号
3. 两个体系互不冲突，工作量只多翻译半小时

---

## Claude Code 工作流

### 单目标手动流程
```
/recon target.com          → 信息搜集
/hunt target.com           → 漏洞测试
/validate                  → 验证漏洞
/report                    → 生成报告
```

### 全自动流程
```
/autopilot target.com --normal   → AI自动跑全流程，验证后暂停等你确认
/autopilot target.com --yolo     → 最少干预（仍需报告审批）
```

### 继续上次
```
/pickup target.com         → 继续上次未完成的目标
/remember                  → 保存当前发现到记忆系统
```

### 辅助命令
```
/surface target.com        → 排序攻击面（优先测高价值目标）
/intel target.com          → 查询相关CVE和已披露报告
/chain                     → 发现一个洞后，自动查找关联漏洞链
/scope target.com          → 检查目标是否在授权范围内
/arsenal                   → 查看已安装的工具
```

---

## 关键规则（始终生效）

1. **先读scope** — 一个越界请求就可能被ban
2. **只挖真实可利用的洞** — "理论上可能"不算洞
3. **7问门控** — 写报告前必须过7个问题
4. **5分钟规则** — 没进展就换目标
5. **深度优于广度** — 一个目标吃透 > 十个目标浅试
6. **兄弟接口规则** — 一个接口有洞，旁边的接口大概率也有
7. **跟着钱走** — 支付/钱包/退款 = 开发者最多shortcuts的地方
8. **20分钟轮换** — 每20分钟问自己"有进展吗？"没有就换
9. **验证后再写报告** — /validate 通过后才花时间写

---

## 安装依赖

```bash
# 系统工具（Linux/Kali）
sudo apt install golang python3 nodejs jq nmap

# 安全工具（自动安装）
bash claude-hunt/install_tools.sh

# Claude Code skills
bash claude-hunt/install.sh
```

### 需要的工具清单
- subfinder（子域名枚举）
- httpx（HTTP探测）
- nuclei（漏洞扫描模板）
- ffuf（目录爆破）
- nmap（端口扫描）
- gau（历史URL）
- dalfox（XSS检测）
- katana（爬虫）

---

## Web面板（可选）

```bash
npm start
# 访问 http://localhost:3000
# SRC挖掘面板: http://localhost:3000/src-hunt.html
```

Web面板提供：目标管理、信息搜集计划生成、漏洞模板推荐、报告生成、红线提醒。
适合不用 Claude Code 时的辅助工作。

---

## 完整工具清单（claude-hunt/tools/）

### HackerOne 专用工具

| 文件 | 功能 | 用法 |
|------|------|------|
| `h1_idor_scanner.py` | HackerOne GraphQL IDOR 跨用户越权扫描 | `python3 h1_idor_scanner.py --token-a TOKEN_A --token-b TOKEN_B --report-id ID` |
| `h1_race.py` | HackerOne 竞态条件测试（赏金双花/2FA限速/负数赏金） | `python3 h1_race.py --token-a TOKEN --test bounty --report-id ID` |
| `h1_oauth_tester.py` | HackerOne OAuth/认证流测试（state CSRF/redirect_uri/host header） | `python3 h1_oauth_tester.py --token TOKEN` |
| `h1_mutation_idor.py` | HackerOne GraphQL Mutation 越权（以他人身份执行特权操作） | `python3 h1_mutation_idor.py --token-a TOKEN_A --token-b TOKEN_B` |
| `hai_probe.py` | HackerOne Hai AI Copilot API 指纹探测 | `python3 hai_probe.py --token YOUR_TOKEN --api-name YOUR_API_NAME` |
| `hai_browser_recon.js` | DevTools 控制台脚本，拦截 Hai 的 GraphQL API | 在 hackerone.com 报告页 → DevTools → Console → 粘贴执行 |

### AI/LLM 攻击工具

| 文件 | 功能 | 用法 |
|------|------|------|
| `sneaky_bits.py` | 隐形 Prompt 注入编码（U+2062/U+2064 隐藏指令） | `python3 sneaky_bits.py encode "IGNORE PREVIOUS INSTRUCTIONS"` |
| `hai_payload_builder.py` | VAPT Payload 库 + LLM 注入生成（NoSQL/SSTI/Cmd/MFA/SAML） | `python3 hai_payload_builder.py --type nosql` 或 `--attack system_prompt` |

### 业务逻辑漏洞工具

| 文件 | 功能 | 用法 |
|------|------|------|
| `race_tester.py` | 并发竞态测试（领券/提现/签到） | `python3 race_tester.py --url URL --method POST --headers '{}' --body '{}' --threads 20` |
| `idor_diff.py` | IDOR 越权自动对比（水平+垂直+无认证） | `python3 idor_diff.py --url "URL/{ID}" --ids "123,456" --auth-a "Cookie: A" --auth-b "Cookie: B"` |
| `jwt_attack.py` | JWT 攻击（alg:none/弱密钥爆破/payload篡改/过期绕过） | `python3 jwt_attack.py --token "eyJ..." --all --verify-url URL` |
| `zero_day_fuzzer.py` | 零日发现 Fuzzer（CORS/CRLF/Host注入/403绕过/缓存投毒） | `python3 zero_day_fuzzer.py https://target.com --deep` |

### 特定平台测试

| 文件 | 功能 | 用法 |
|------|------|------|
| `zendesk_idor_test.py` | Zendesk 平台越权测试（跨组织数据访问） | `export ZENDESK_SUBDOMAIN=xxx && python3 zendesk_idor_test.py` |

### 信息搜集与分析

| 文件 | 功能 | 用法 |
|------|------|------|
| `js_extractor.py` | JS 敏感信息提取（API端点/密钥/Token/AWS Key） | `python3 js_extractor.py --crawl "https://target.com"` |
| `screenshot_ocr.py` | 截图分析+验证码识别（Qwen-VL/GPT-4o/Tesseract） | `python3 screenshot_ocr.py --captcha captcha.png` |
| `intel_engine.py` | 情报引擎（CVE/历史漏洞查询） | 被 hunt.py 内部调用 |
| `token_scanner.py` | Token/密钥泄露扫描 | 被 hunt.py 内部调用 |
| `target_selector.py` | 目标优先级选择 | 被 /surface 命令调用 |
| `mindmap.py` | 攻击面思维导图生成 | 被 /recon 命令调用 |

### 浏览器/GUI 自动化

| 文件 | 功能 | 用法 |
|------|------|------|
| `browser_auto.py` | Playwright 无头浏览器（登录/表单/Cookie提取/请求拦截） | `python3 browser_auto.py --url URL --fill "#user=admin" --click "button" --screenshot out.png` |
| `ui_controller.py` | 桌面 GUI 自动化（pyautogui 鼠标键盘/滑块验证码） | `python3 ui_controller.py --click 500 300` 或 `--drag 200 300 500 300` |

### 认证与会话管理

| 文件 | 功能 | 用法 |
|------|------|------|
| `auth_session.py` | 认证会话管理（Cookie/Token 持久化） | 被 hunt.py `--cookie` 参数调用 |
| `credential_store.py` | 凭证安全存储 | 内部模块 |
| `scope_checker.py` | Scope 授权范围检查（每个请求前验证） | 被 /scope 命令和 autopilot 调用 |

### 记忆与学习

| 文件 | 功能 | 用法 |
|------|------|------|
| `learn.py` | 漏洞模式学习（成功技术记录） | 被 /remember 命令调用 |
| `memory_gc.py` | 记忆文件清理（10MB上限轮换） | 被 /memory-gc 命令调用 |

### 核心引擎

| 文件 | 功能 | 用法 |
|------|------|------|
| `hunt.py` | 主狩猎编排器（完整流程串联） | `python3 hunt.py --target domain.com` 或 `--agent` 模式 |
| `recon_adapter.py` | 侦察工具适配器（统一输出格式） | 内部模块 |
| `validate.py` | 漏洞验证器（7问门控） | 被 /validate 命令调用 |
| `dashboard.py` | 终端仪表盘（进度/发现统计） | 内部模块 |

---

## Shell 脚本工具（claude-hunt/tools/）

| 文件 | 功能 | Claude Code 命令 |
|------|------|-----------------|
| `recon_engine.sh` | 核心侦察引擎（subfinder→httpx→katana→gau） | `/recon` |
| `vuln_scanner.sh` | 漏洞扫描（nuclei+dalfox+crlfuzz） | `/hunt` |
| `bypass_403.sh` | 403 绕过技术（方法切换/Header/路径变异） | `/bypass-403` |
| `param_discovery.sh` | 参数发现（paramspider+arjun+gf） | `/param-discover` |
| `secrets_hunter.sh` | 密钥泄露扫描（trufflehog+gitleaks） | `/secrets-hunt` |
| `takeover_scanner.sh` | 子域名接管检测（subjack+subzy） | `/takeover` |
| `cloud_recon.sh` | 云基础设施侦察（S3/Azure/GCP Bucket） | `/cloud-recon` |
| `cve_scan.sh` | CVE 模板扫描（nuclei CVE标签） | `/scan-cves` |
| `scope_aggregator.sh` | 多来源 Scope 聚合 | `/scope-aggregate` |
| `cicd_scanner.sh` | CI/CD 管道扫描（GitHub Actions/GitLab CI 配置泄露） | 内部使用 |
| `external_arsenal.sh` | 外部工具状态检查 | `/arsenal` |
| `h1_run.sh` | HackerOne 工具执行封装 | 内部使用 |
| `_auth_helper.sh` | 认证辅助（Cookie/Token 传递） | 内部使用 |

---

## 国产 Nuclei 模板（claude-hunt/tools/nuclei-templates-cn/）

```bash
nuclei -l targets.txt -t claude-hunt/tools/nuclei-templates-cn/ -severity critical,high
```

| 模板 | 检测目标 |
|------|---------|
| `thinkphp-rce-5023.yaml` | ThinkPHP 5.0.23 RCE |
| `thinkphp-5-info-leak.yaml` | ThinkPHP 5.x 信息泄露 |
| `shiro-default-key.yaml` | Apache Shiro 默认密钥反序列化 |
| `nacos-unauth.yaml` | Nacos 未授权访问 |
| `springboot-actuator.yaml` | SpringBoot Actuator 端点暴露 |
| `swagger-api-leak.yaml` | Swagger UI 接口文档泄露 |
| `druid-unauth.yaml` | Druid 监控面板未授权 |
| `redis-unauth.yaml` | Redis 未授权访问 |
| `weaver-oa-rce.yaml` | 泛微 OA 远程代码执行 |
| `yongyou-nc-rce.yaml` | 用友 NC 远程代码执行 |
| `ruoyi-default-creds.yaml` | 若依系统默认口令 |

---

## Auto-Hunt Agent（claude-hunt/auto_agent/）

独立的 AI 自动化挖掘引擎，用 DeepSeek API 驱动，不依赖 Claude Code。

```bash
cd claude-hunt/auto_agent
pip install -r requirements.txt
cp config.yaml.example config.yaml  # 填入 API Key
python auto_hunt.py --target example.com --mode auto
```

| 模块 | 功能 |
|------|------|
| `auto_hunt.py` | 主入口（选模式→选目标→跑全流程） |
| `agent_engine.py` | AI 引擎（DeepSeek调用+命令执行+决策） |
| `waf_adapter.py` | WAF 指纹自适应（Cloudflare/阿里云/宝塔/腾讯云） |
| `session_monitor.py` | Session 状态监控（被踢→停/429→降速） |
| `asset_discovery.py` | 资产关联发现（FOFA证书/AI推测/alterx变异） |
| `intel_checker.py` | 提交前情报查重 |
| `redline_checker.py` | 红线审查（403/404比例/禁止路径） |
| `trace_analyzer.py` | 痕迹分析（AI找可挖线索） |
| `hunt_logger.py` | 桌面日志（doing_日期.md） |
| `checkpoint_manager.py` | 断点续跑（崩溃恢复） |
| `false_positive_filter.py` | 误报自动过滤 |
| `scope_updater.py` | Scope 自动更新管理 |
| `hexstrike_bridge.py` | HexStrike AI Server 桥接（150+工具优化层） |
| `shell_utils.py` | 安全 Shell 命令构建（防注入） |

### Phases 阶段模块

| 阶段 | 工具链 |
|------|--------|
| `phases/recon.py` | subfinder → dnsx → httpx → gau → waybackurls |
| `phases/params.py` | paramspider → gf(xss/ssrf) → arjun |
| `phases/hunt.py` | nuclei → dalfox → CORS → trufflehog → 竞态 → IDOR |
| `phases/validate.py` | AI 7问门控验证 |
| `phases/verify.py` | 四证齐全（代码路径/运行时/证据/反证） |
| `phases/report.py` | 中国 SRC 格式报告生成 |

---

## RedOps Agent（redops/）

基于 LLM 的 Web 对话式渗透测试 Agent。

```bash
cd redops
pip install -r requirements.txt
python main.py
# 浏览器访问 http://localhost:8000
```

| 模块 | 功能 |
|------|------|
| `app/core/llm_agent.py` | LLM 决策核心（DeepSeek/OpenAI/Qwen） |
| `app/core/executor.py` | 命令执行器 |
| `app/core/skill_registry.py` | 渗透技能注册系统 |
| `app/core/memory_system.py` | 跨会话记忆 |
| `app/integrations/fofa.py` | FOFA 搜索引擎集成 |
| `app/integrations/telegram_bot.py` | Telegram 通知 |
| `app/integrations/qq_bot.py` | QQ Bot 通知 |
| `desktop_pet.py` | 桌面宠物界面 |

---

## MCP Server 集成（claude-hunt/mcp/）

| 目录 | 功能 | 配置 |
|------|------|------|
| `hackerone-mcp/` | HackerOne 公开 API（搜索已披露报告/项目统计/政策） | MCP JSON-RPC |
| `fiddler-mcp/` | Fiddler SAZ 抓包分析（提取端点/搜索参数/敏感信息） | 需设 `FIDDLER_EXPORT_DIR` |
| `burp-mcp-client/` | Burp Suite MCP 桥接 | 需 Burp API Key |
| `caido-mcp-client/` | Caido 代理集成 | README only |
| `redops-mcp/` | RedOps Agent MCP 桥接 | 需 RedOps 运行中 |
