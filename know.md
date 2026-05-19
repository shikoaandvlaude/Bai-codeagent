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

## 自带渗透工具一览

### 信息搜集
| 工具 | 说明 | 用法 |
|------|------|------|
| subfinder | 子域名枚举 | `subfinder -d target.com` |
| httpx | HTTP存活探测+指纹 | `httpx -l subs.txt -silent -tech-detect` |
| katana | 爬虫（JS渲染友好） | `katana -u target.com -d 3` |
| gau | 历史URL搜集 | `echo target.com \| gau` |
| naabu | 端口扫描（快） | `naabu -host target.com -top-ports 1000` |
| kiterunner | 隐藏API发现 | `kr scan target.com -w routes.kite` |
| waybackurls | Wayback历史URL | `echo target.com \| waybackurls` |
| gowitness | 批量网页截图 | `gowitness file -f urls.txt` |
| wafw00f | WAF识别 | `wafw00f target.com` |

### 漏洞检测
| 工具 | 说明 | 用法 |
|------|------|------|
| nuclei | 模板化漏洞扫描 | `nuclei -u target.com -severity high,critical` |
| dalfox | XSS自动检测 | `dalfox pipe < urls_with_params.txt` |
| crlfuzz | CRLF注入检测 | `crlfuzz -u target.com` |
| subjack | 子域名接管 | `subjack -w subs.txt -t 20` |

### 业务逻辑漏洞（自写Python工具）
| 工具 | 文件 | 说明 |
|------|------|------|
| **并发竞态测试** | `race_tester.py` | 并发发请求检测提现/领券/签到竞态 |
| **越权自动对比** | `idor_diff.py` | 两账号对比检测IDOR/垂直越权/未授权 |
| **JWT攻击** | `jwt_attack.py` | alg:none/弱密钥爆破/payload篡改 |
| **JS信息提取** | `js_extractor.py` | 从JS提取API端点/密钥/Token |
| **截图识图** | `screenshot_ocr.py` | 验证码识别/页面分析/对比截图 |
| **UI控制** | `ui_controller.py` | 鼠标键盘自动化/滑块验证码/截屏 |
| **浏览器自动化** | `browser_auto.py` | Playwright自动登录/表单/Cookie提取/请求拦截 |

---

## UI 控制 / 鼠标键盘自动化

### ui_controller.py（桌面GUI控制）

依赖：`pip install pyautogui pillow`

```bash
# 全屏截图
python3 claude-hunt/tools/ui_controller.py --screenshot full -o screen.png

# 点击坐标
python3 claude-hunt/tools/ui_controller.py --click 500 300

# 输入文字
python3 claude-hunt/tools/ui_controller.py --type "admin123"

# 拖拽滑块验证码（从x=200拖到x=500）
python3 claude-hunt/tools/ui_controller.py --drag 200 300 500 300 --duration 0.5

# 找到图片并点击
python3 claude-hunt/tools/ui_controller.py --find-and-click login_button.png

# 组合键
python3 claude-hunt/tools/ui_controller.py --hotkey ctrl a

# 获取鼠标位置
python3 claude-hunt/tools/ui_controller.py --position
```

### browser_auto.py（无头浏览器自动化）

依赖：`pip install playwright && playwright install chromium`

```bash
# 访问并截图
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --screenshot page.png

# 自动登录
python3 claude-hunt/tools/browser_auto.py --url "https://target.com/login" \
  --fill "#username=admin" --fill "#password=123456" \
  --click "button[type=submit]" --wait 3 --screenshot logged_in.png

# 提取表单/Cookie/localStorage
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --extract forms
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --extract cookies
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --extract storage

# 拦截所有API请求
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --intercept -o api.json

# 通过代理（配合Fiddler/Burp）
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --proxy http://127.0.0.1:8888
```

---

## 截图识图配置

创建 `~/.config/screenshot_ocr.json`：
```json
{
  "provider": "qwen",
  "api_key": "你的通义千问key",
  "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "model": "qwen-vl-plus"
}
```

---

## 业务逻辑漏洞工具用法

### race_tester.py — 并发竞态

```bash
python3 claude-hunt/tools/race_tester.py \
  --url "https://target.com/api/withdraw" \
  --method POST \
  --headers '{"Cookie":"session=xxx","Content-Type":"application/json"}' \
  --body '{"amount":1}' \
  --threads 5
```

### idor_diff.py — 越权对比

```bash
python3 claude-hunt/tools/idor_diff.py \
  --url "https://target.com/api/user/{ID}/orders" \
  --ids "123,456" \
  --auth-a "Cookie: session=userA" \
  --auth-b "Cookie: session=userB" \
  --own-id 123
```

### jwt_attack.py — JWT攻击

```bash
python3 claude-hunt/tools/jwt_attack.py --token "eyJ..." --all \
  --verify-url "https://target.com/api/me"
```

### js_extractor.py — JS敏感信息

```bash
python3 claude-hunt/tools/js_extractor.py --crawl "https://target.com"
```

---

## 安装所有工具

```bash
# Linux/Kali/WSL
sudo bash claude-hunt/install_tools_linux.sh

# UI + 浏览器自动化
pip install pyautogui pillow playwright
playwright install chromium
```

---

## MCP Server 配置

编辑 `~/.claude/settings.json`：

```json
{
  "mcpServers": {
    "fiddler": {
      "command": "python3",
      "args": ["C:/路径/claude-hunt/mcp/fiddler-mcp/server.py"],
      "env": {"FIDDLER_EXPORT_DIR": "C:/Users/你/Documents/Fiddler2/Captures"}
    },
    "redops": {
      "command": "python3",
      "args": ["C:/路径/claude-hunt/mcp/redops-mcp/server.py"],
      "env": {"REDOPS_URL": "http://localhost:8000"}
    },
    "burp": {
      "command": "npx",
      "args": ["-y", "@anthropic/burp-mcp-server"],
      "env": {"BURP_API_KEY": "你的Key", "BURP_URL": "http://localhost:1337"}
    }
  }
}
```

---

## 国产 Nuclei 模板

```bash
nuclei -l targets.txt -t claude-hunt/tools/nuclei-templates-cn/ -severity critical,high
```

含：ThinkPHP RCE、泛微OA、用友NC、Nacos、若依、Shiro、Redis、Actuator、Druid、Swagger

---

## 注意事项

- 只在获得授权的情况下使用
- 遵守法律法规
- SRC测试不要影响线上业务
- 不对未授权目标发起扫描
- 并发测试控制在5次以内
- 数据库漏洞只读2-3行验证
- 不用在线XSS平台
- 最多用2个自己注册的账号



---

## 工具安全限速参数（对SRC目标必须加）

对SRC授权目标测试时，**所有工具必须加限速参数**，否则会触发WAF/风控/人机验证导致IP被封或账号被追溯。

### 原则：对SRC目标每秒不超过3-5个请求

| 工具 | 默认行为（危险） | SRC安全参数 | 说明 |
|------|-----------------|-------------|------|
| **nuclei** | 并发25线程，全模板 | `nuclei -l targets.txt -severity critical,high -rate-limit 5 -c 3` | 只扫高危+限速5/秒+3线程 |
| **ffuf** | 40线程爆破 | `ffuf -u URL/FUZZ -w dict.txt -t 3 -rate 5 -mc 200,301,302,403` | 3线程+限速5/秒 |
| **dalfox** | 多worker并发 | `dalfox pipe --worker 2 --delay 300 --timeout 10` | 2worker+每请求延迟300ms |
| **katana** | 快速爬取 | `katana -u target.com -d 2 -delay 1 -c 3` | 深度2+延迟1秒+3并发 |
| **httpx** | 50线程探测 | `httpx -l urls.txt -threads 5 -rate-limit 10` | 5线程+限速10/秒 |
| **naabu** | 快速端口扫描 | `naabu -host target.com -rate 100 -c 10` | 对单目标100/秒足够 |
| **gau/waybackurls** | 查第三方数据源 | 无需限速 | 不直接请求目标，安全 |
| **subfinder** | 查第三方数据源 | 无需限速 | 不直接请求目标，安全 |
| **race_tester.py** | 并发5 | `--threads 5` 已硬限制 | 一次测完就停，不反复跑 |
| **idor_diff.py** | 逐个请求 | 默认安全 | 每个ID只发1个请求 |
| **browser_auto.py** | 正常浏览速度 | 默认安全 | 和人操作一样 |

### 会触发人机验证的行为

1. **短时间大量404** — ffuf/dirsearch 目录爆破最容易触发
2. **相同参数大量重复请求** — nuclei 模板扫描
3. **异常User-Agent** — 默认Go/Python UA容易被识别
4. **无Cookie/Session的大量请求** — 看起来像爬虫
5. **非常规请求频率** — 正常人不会1秒点10次
6. **无头浏览器特征** — navigator.webdriver=true 会被检测

### 如何避免触发

- **加随机延迟** — 每个请求之间随机等0.5-2秒
- **带正常Cookie** — 先登录获取session再测试
- **用正常UA** — `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`
- **通过代理** — Fiddler/Burp代理让流量看起来像正常浏览
- **分散时间** — 不要集中在一个时间段全部跑完
- **手工优先** — 对SRC目标，能手工测就手工测

### Claude Code 自动化时的安全策略

当 Claude Code 用 `/hunt` 或 `/autopilot` 时，应该：

1. 先用 `wafw00f` 检测目标是否有WAF
2. 如果有WAF：所有工具加最严格限速（每秒1-2个请求）
3. 如果无WAF：可以稍微快一点（每秒5-10个请求）
4. SQL注入：**不用任何自动化工具**，让AI逐个手工构造payload通过curl发送
5. 并发测试：一次测完立即停止，不反复验证
6. 发现被ban（全是403/429）：立即停止，等待或换IP

### SQL注入的正确做法（AI手工注入）

**不要：**
```bash
sqlmap -u "http://target.com/page?id=1" --dbs  # ❌ 几百个请求瞬间打过去
```

**应该：**
```bash
# 1. 先判断是否有注入（1个请求）
curl "http://target.com/page?id=1' AND 1=1--" -H "Cookie: session=xxx"

# 2. 确认后手工构造payload（1个请求）
curl "http://target.com/page?id=1' UNION SELECT 1,2,3--" -H "Cookie: session=xxx"

# 3. 读取数据库名（1个请求）
curl "http://target.com/page?id=1' UNION SELECT 1,database(),3--" -H "Cookie: session=xxx"

# 4. 证明存在即可，截图写报告
# 总共只发了3-4个请求，WAF根本察觉不到
```

让 Claude Code 帮你构造这些 payload，它比 sqlmap 聪明——能根据报错信息动态调整注入方式，而且每次只发1个请求。



---

## 整合的两个开源项目介绍

### 1. RedOps Agent（redops/）

来源：`baianquanzu/RedOps-Agent`

**是什么：** 基于 LLM 的智能渗透测试 Agent 框架，通过自然语言对话驱动渗透测试。

**核心功能：**
- **LLM驱动决策** — 支持 DeepSeek / OpenAI / Claude / 通义千问，用中文对话下达渗透指令
- **技能注册系统** — 动态加载渗透技能模块，可自定义扩展
- **Nuclei 集成** — 调用 Nuclei 进行模板化漏洞扫描
- **FOFA 资产搜索** — 集成 FOFA API 快速发现目标资产
- **系统命令执行** — 集成 Kali 工具链（nmap/dig/curl等）
- **JS逆向分析** — 自动分析页面 JavaScript 提取敏感信息
- **上下文记忆** — 持久化会话，支持多轮对话和任务连续性
- **Web管理界面** — 浏览器访问 localhost:8000 对话式操作
- **报告自动生成** — HTML 格式渗透测试报告

**启动方式：**
```bash
cd redops
pip install -r requirements.txt
python main.py
# 浏览器访问 http://localhost:8000
```

**配置 LLM（redops/app/core/config.yaml）：**
```yaml
llm:
  provider: "deepseek"      # deepseek/openai/anthropic/qwen
  api_key: "你的key"
  base_url: "https://api.deepseek.com/v1"
  model: "deepseek-chat"
```

**对话示例：**
```
"请对 192.168.1.1 进行端口扫描"
"使用Nuclei扫描 example.com 的漏洞"
"查找 example.com 的子域名"
"对目标进行SQL注入测试"
"用FOFA搜索 domain='target.com' && title='后台'"
```

**适合场景：** 不想用 Claude Code 订阅的时候，用 DeepSeek（便宜）驱动渗透测试。

---

### 2. claude-bug-bounty（claude-hunt/）

来源：`shuvonsec/claude-bug-bounty`（1.8k star）

**是什么：** 专为 Claude Code 设计的全自动 Bug Bounty 猎手框架，覆盖从信息搜集到报告生成的完整流程。

**核心功能：**

**8个AI Agent：**
| Agent | 功能 |
|-------|------|
| recon-agent | 子域名+活主机+URL发现 |
| report-writer | 生成提交级报告（H1/Bugcrowd/补天格式） |
| validator | 7问门控，杀死弱发现 |
| chain-builder | 发现一个洞后自动查找关联漏洞链 |
| autopilot | 全自动挖洞循环（scope→recon→hunt→validate→report） |
| recon-ranker | 排序攻击面，优先测高价值目标 |
| web3-auditor | 智能合约审计（10种漏洞类） |
| token-auditor | Meme币/Token rug pull检测 |

> **注意：** web3-auditor 和 token-auditor 为实验性模块。国内大多数 SRC 平台不接收 Web3 类漏洞，这两个模块更适合 HackerOne/Immunefi 等国际平台的区块链赏金项目。

**22个 Slash Commands：**
- `/recon` `/hunt` `/validate` `/report` — 核心四命令
- `/autopilot` — 全自动模式（--paranoid/--normal/--yolo三种检查点）
- `/pickup` — 继续上次未完成的目标
- `/surface` — 排序攻击面
- `/intel` — CVE情报查询
- `/chain` — 漏洞链发现
- `/scope` — 授权范围检查
- `/remember` — 保存到跨会话记忆
- `/secrets-hunt` — JS/Git泄露扫描
- `/takeover` — 子域名接管
- `/cloud-recon` — 云资产发现
- `/bypass-403` — 绕过403
- `/scan-cves` — Nuclei CVE扫描
- `/arsenal` — 工具状态检查

**20种Web2漏洞类覆盖：**
IDOR、Auth Bypass、XSS、SSRF、业务逻辑、Race Condition、SQL注入、OAuth、文件上传、GraphQL、LLM/AI、API Misconfig、Account Takeover、SSTI、子域名接管、Cloud/Infra、HTTP Smuggling、Cache Poisoning、MFA Bypass、SAML/SSO

**记忆系统：**
- `hunt-memory/patterns.jsonl` — 成功技术跨目标学习
- `hunt-memory/audit.jsonl` — 请求审计日志
- 自动轮换（10MB上限，保留3个备份）
- 每次会话结束自动记录

**MCP集成：**
- Burp Suite MCP — AI直接读取浏览器抓包流量
- HackerOne MCP — 查询已披露报告和赏金项目
- Fiddler MCP（我们自己加的） — 分析Fiddler SAZ抓包
- RedOps MCP（我们自己加的） — 调用RedOps执行命令

**安全保护：**
- Scope Checker — 每个URL发请求前都检查是否在授权范围
- 审计日志 — 每个请求都记录到 audit.jsonl
- 安全方法保护 — PUT/DELETE/PATCH 需要人工确认
- 断路器 — 连续5次403/429自动停止
- 速率限制 — 测试1req/s，信息搜集10req/s

**适合场景：** 有 Claude Pro/Max 订阅，想全自动挖洞的时候用。AI自动跑全流程，你只需要最后确认报告。

---

### 两个项目的定位区别

| | RedOps Agent | claude-hunt |
|---|---|---|
| **驱动模型** | DeepSeek/OpenAI/Qwen（便宜） | Claude Code（需Pro订阅） |
| **交互方式** | Web对话界面 | 终端命令行 |
| **自动化程度** | 对话式，你说一步它做一步 | /autopilot 全自动 |
| **记忆系统** | 会话级记忆 | 跨会话持久化 |
| **安全保护** | 基础 | 完整（scope checker+audit+断路器） |
| **适合谁** | 不想付Claude订阅的 | 想全自动最高效率的 |
| **启动** | `python redops/main.py` | `claude` → `/autopilot` |

**最佳组合：** Claude Code 做决策 + 通过 RedOps MCP 调用 RedOps 执行命令（省Claude token）。



---

## 2025-06-18 新增工具说明

### 新增工具总览（按攻击阶段）

本次更新补全了黑盒 SRC 测试链路中所有缺失环节，从"只能扫"升级到"能验证+能发现隐藏参数+能检测泄露+能推送通知"。

| 优先级 | 工具 | 阶段 | 一句话说明 | 安装方式 |
|--------|------|------|-----------|----------|
| **P0** | interactsh-client | OOB验证 | SSRF/XXE/RCE带外回调验证，没它SSRF只是"疑似" | go install |
| **P0** | paramspider | 参数发现 | 从WebArchive被动挖历史URL中的参数 | pip install |
| **P0** | arjun | 参数发现 | 主动探测隐藏参数（登录后页面也能用） | pip install |
| **P1** | uncover | 资产搜索 | 一条命令查Shodan/Censys/FOFA/ZoomEye | go install |
| **P1** | trufflehog | 密钥泄露 | 扫Git仓库+验证密钥是否仍有效（减少误报） | go install |
| **P1** | gitleaks | 密钥泄露 | 和trufflehog互补，规则库不同 | go install |
| **P1** | alterx | 子域名变异 | 已知dev.xxx.com→自动生成staging/test/uat变种 | go install |
| **P1** | notify | 推送通知 | 高危发现→推送钉钉/企业微信/Telegram | go install |
| **P1** | corscanner | CORS检测 | 批量扫CORS错配，SRC常见中危 | pip install |
| **P1** | openredirex | 开放重定向 | OAuth场景重定向+token窃取=高危链 | pip install |
| **P2** | qsreplace | 管道工具 | URL参数批量替换（配合注入测试） | go install |
| **P2** | gf | 管道工具 | URL模式匹配，自动提取可能有XSS/SQLi的参数 | go install |
| **P2** | uro | URL去重 | 智能去掉相似URL（比anew更聪明） | go install / pip |
| **P3** | pdtm | 工具管理 | ProjectDiscovery全家桶一键更新 | go install |

---

### 各工具详细用法 + SRC注意事项

#### interactsh-client（P0 — OOB回调验证）

**为什么必须装：** 没有它你的SSRF永远只是"理论可能"，有了它就是"已验证带外交互"——直接从中危升高危。

```bash
# 启动（获取一个临时回调域名）
interactsh-client

# 输出类似：[INF] Using interactsh server: oast.pro
# 给你一个域名：abc123.oast.pro

# 测试SSRF时把这个域名塞进去
curl "http://target.com/fetch?url=http://abc123.oast.pro"

# 如果interactsh收到回调 → SSRF确认！截图写报告
```

**SRC注意：**
- 不会触发WAF（目标只是发了一个DNS请求到你的回调域名）
- 每次测试用新的子域名，不要复用
- 可以验证：SSRF、XXE、RCE(DNS外带)、Log4j

---

#### paramspider + arjun（P0 — 参数发现组合拳）

**为什么必须装：** URL里没参数就没法测注入。gau/waybackurls只给你历史URL，但很多参数是隐藏的。

```bash
# paramspider — 被动（从WebArchive挖，不碰目标服务器）
paramspider -d target.com
# 输出：带参数的历史URL列表

# arjun — 主动（向目标发探测请求，需要限速）
arjun -u "http://target.com/api/search" --stable
# 输出：发现隐藏参数 q, page, sort, debug

# 组合用法：paramspider找URL → arjun对每个URL探测隐藏参数 → dalfox/手工测注入
```

**SRC注意：**
- paramspider 完全安全（查第三方数据源，不碰目标）
- arjun 会向目标发请求，但流量很小（每个参数1-2个请求）
- 发现 `debug=true` 或 `admin=1` 这种隐藏参数就是洞

---

#### uncover（P1 — Shodan/FOFA/Censys整合）

**为什么推荐：** 不用开浏览器登录FOFA，一条命令查所有搜索引擎。

```bash
# 查目标暴露资产
uncover -q "domain:target.com" -e shodan,fofa,censys

# FOFA语法直接用
uncover -q 'domain="target.com" && title="后台"' -e fofa

# 配合httpx验证存活
uncover -q "org:目标公司" -e shodan | httpx -silent
```

**配置API Key：** 运行安装脚本后编辑 `~/.config/uncover/provider-config.yaml` 填入你的FOFA/Shodan Key。

**SRC注意：** 查搜索引擎不算攻击行为，完全安全。

---

#### trufflehog + gitleaks（P1 — 密钥泄露扫描）

**为什么推荐：** SRC里"泄露AK/SK/Token"直接P1高危，扫一遍GitHub就可能出好几个洞。

```bash
# trufflehog — 扫目标的GitHub组织（自动验证密钥是否有效！）
trufflehog github --org=目标公司 --only-verified

# gitleaks — 扫本地克隆的仓库
gitleaks detect --source /path/to/repo --report-path leaks.json

# 组合用法：trufflehog扫在线仓库 + gitleaks扫本地（规则互补）
```

**SRC注意：**
- 只扫公开仓库，不扫私有的（除非授权）
- trufflehog的 `--only-verified` 选项只报告仍然有效的密钥（减少误报）
- 发现有效的AWS Key/数据库密码/支付密钥 = 直接高危

---

#### notify（P1 — 推送通知）

**为什么推荐：** nuclei跑了一晚上发现高危，你不用盯着终端看。

```bash
# 配合nuclei使用
nuclei -l targets.txt -severity critical,high | notify -silent

# 配合管道用
subfinder -d target.com | httpx | nuclei -severity high | notify
```

**配置：** 编辑 `~/.config/notify/provider-config.yaml`，填入钉钉/企业微信/Telegram的webhook。

---

#### corscanner + openredirex（P1 — 快速出洞）

**为什么推荐：** CORS错配和开放重定向是SRC最容易批量出洞的类型。

```bash
# CORS错配扫描（批量扫一堆URL）
python3 -m corscanner -i urls.txt -o cors_results.json

# 开放重定向（对有redirect参数的URL自动fuzz）
cat urls_with_redirect.txt | openredirex
```

**SRC注意：**
- CORS错配一般是中危（如果能读到敏感数据就是高危）
- 开放重定向 + OAuth token窃取 = 高危链
- 这两个工具请求量很小，不容易触发WAF

---

#### alterx（P1 — 子域名变异）

```bash
# 已知子域名列表 → 生成变种
cat known_subs.txt | alterx -silent | dnsx -silent | httpx

# 示例：已知 dev.target.com → 自动尝试 dev2/staging/test/uat/pre.target.com
```

---

#### 管道工具组合（P2 — qsreplace + gf + uro）

这三个工具是**管道胶水**，配合前面的工具串联攻击链：

```bash
# 完整链路示例：
# 1. 收集URL
echo target.com | gau | uro > all_urls.txt

# 2. 用gf提取可能有XSS的URL
cat all_urls.txt | gf xss > xss_candidates.txt

# 3. 用qsreplace替换参数值为payload
cat xss_candidates.txt | qsreplace '"><script>alert(1)</script>' > xss_test.txt

# 4. 用dalfox验证
cat xss_test.txt | dalfox pipe --worker 2 --delay 300
```

---

### 安装脚本说明

| 脚本 | 平台 | 用法 |
|------|------|------|
| `claude-hunt/install_tools_windows.ps1` | Windows | 右键PowerShell管理员 → `.\install_tools_windows.ps1` |
| `claude-hunt/install_tools_linux.sh` | Linux/Kali | `sudo bash claude-hunt/install_tools_linux.sh` |
| `claude-hunt/install_tools.sh` | Mac (Homebrew) | `bash claude-hunt/install_tools.sh` |

三个脚本功能一致：
1. 安装 Go + nmap（如果没有）
2. go install 全部 Go 工具（24个）
3. pip install Python 工具（7-13个）
4. 更新 nuclei 模板
5. 生成 notify/uncover 配置模板
6. 验证安装结果（分组显示）
7. 打印 SRC 限速参数提醒

---

### 工具更新方式

```bash
# 方式1：用pdtm一键更新所有ProjectDiscovery工具
pdtm -update-all

# 方式2：单独更新某个工具
go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest

# 方式3：重新跑安装脚本（会跳过已安装的）
bash claude-hunt/install_tools_linux.sh
```



---

## 2025-06-18 Windows兼容性修复

### 问题背景

原工具链是 Linux/macOS 优先设计，Windows 上缺失致命依赖导致完全无法运行。

### 修复的致命缺失

| 组件 | 作用 | Windows安装方式 | Linux安装方式 |
|------|------|----------------|--------------|
| **Go** | 24个Go安全工具的编译运行时 | 脚本自动下载 `go1.24.4.windows-amd64.msi` 静默安装 | 脚本自动下载tar.gz解压到 `/usr/local/go` |
| **Ollama** | 本地LLM引擎，`brain.py` 核心依赖 | 脚本自动下载 `OllamaSetup.exe` 静默安装 | `curl -fsSL https://ollama.com/install.sh \| sh` |
| **jq** | JSON处理工具（管道数据解析） | 脚本自动下载binary到 `%LOCALAPPDATA%\jq\` | apt install jq（已在系统依赖里） |
| **nmap** | 端口扫描+服务识别 | 脚本自动下载 `nmap-7.95-setup.exe` 静默安装 | apt install nmap |

### 新增的Python AI/LLM依赖（brain.py需要）

| 包名 | 作用 | 说明 |
|------|------|------|
| **ollama** | Ollama Python SDK | brain.py 通过这个包调用本地LLM |
| **rich** | 终端美化输出 | 彩色日志、进度条、表格 |
| **langgraph** | LLM Agent图引擎 | 构建多步骤AI Agent工作流 |
| **langchain-ollama** | LangChain + Ollama集成 | 让LangChain调用本地Ollama模型 |
| **Pillow** | 图像处理 | 截图OCR、验证码识别 |
| **selenium** | 浏览器自动化 | Playwright的备选方案 |
| **beautifulsoup4** | HTML解析 | 页面内容提取 |
| **playwright** | 无头浏览器 | 自动登录、表单操作、Cookie提取 |

### 新增Go工具

| 工具 | 作用 | 为什么加 |
|------|------|---------|
| **subzy** | 子域名接管检测 | 比subjack更活跃，指纹库更新 |

### Ollama使用说明

```bash
# 1. 安装完脚本后，拉取模型（约5GB）
ollama pull deepseek-r1:8b

# 2. 启动Ollama服务（Windows会自动后台运行，Linux需要手动）
ollama serve

# 3. 测试是否正常
ollama run deepseek-r1:8b "hello"

# 4. brain.py 会自动连接 localhost:11434 调用模型
```

**可选模型：**
- `deepseek-r1:8b` — 推荐，8B参数，16GB显存够用
- `qwen2.5:7b` — 通义千问，中文更好
- `llama3.1:8b` — Meta出品，英文强

### 安装后验证

Windows跑完脚本后，在PowerShell里检查：
```powershell
go version          # Go 1.24+
ollama --version    # ollama version x.x.x
jq --version        # jq-1.7.1
nmap --version      # Nmap 7.95
subfinder -version  # v2.x.x
nuclei -version     # v3.x.x
```

Linux跑完脚本后：
```bash
go version && ollama --version && jq --version && nmap --version
subfinder -version && nuclei -version && interactsh-client -version
```

### 完整工具覆盖清单（修复后）

安装脚本跑完后，应该达到：

| 类别 | 数量 | 工具 |
|------|------|------|
| Go安全工具 | 28个 | subfinder, amass, httpx, nuclei, katana, ffuf, dalfox, gau, waybackurls, gospider, dnsx, naabu, interactsh-client, uncover, notify, alterx, pdtm, trufflehog, gitleaks, subjack, subzy, crlfuzz, hakrawler, gowitness, anew, gf, qsreplace, kiterunner |
| Python安全工具 | 7个 | paramspider, arjun, wafw00f, corscanner, openredirex, linkfinder, uro |
| Python AI/框架 | 7个 | ollama, rich, langgraph, langchain-ollama, Pillow, selenium, beautifulsoup4 |
| 系统工具 | 4个 | Go, nmap, jq, Ollama |
| 浏览器自动化 | 2个 | playwright + chromium |
| **总计** | **48个** | Windows和Linux通用 |



---

## AI Auto-Hunt Agent（自动化挖掘引擎）

### 简介

`claude-hunt/auto_agent/` 是一个独立的 AI Agent，用 DeepSeek API 驱动全链路 SRC 漏洞挖掘。不依赖 Claude Code 订阅，只需要一个 DeepSeek API Key。

### 核心特性

| 特性 | 说明 |
|------|------|
| **双模式** | 全自动(YOLO) / 半自动(SAFE)，启动时选择 |
| **桌面日志** | 每次运行生成 `doing_日期.md` 在桌面，记录每步操作 |
| **红线审查** | 每步自动检查是否越界（连续403/404比例/禁止路径） |
| **痕迹分析** | 每N步 AI 分析已有数据，找出可挖线索 |
| **7问验证** | 发现漏洞后 AI 自动做门控验证，过滤误报 |
| **自动报告** | 验证通过的漏洞自动生成中国SRC格式报告到桌面 |
| **限速保护** | 所有命令强制限速，不会打崩目标 |

### 文件结构

```
claude-hunt/auto_agent/
├── auto_hunt.py           # 主入口（启动→选模式→输入目标→跑全流程）
├── agent_engine.py        # AI引擎（DeepSeek调用 + 命令执行 + 决策循环）
├── hunt_logger.py         # 日志（桌面 doing_日期.md，markdown格式）
├── redline_checker.py     # 红线审查（403/404/禁止路径/请求上限）
├── trace_analyzer.py      # 痕迹分析（AI 找可挖线索 + 建议下一步）
├── config.yaml.example    # 配置模板（复制为 config.yaml 填Key）
└── phases/
    ├── base.py            # 阶段基类（步骤执行+日志+红线检查）
    ├── recon.py           # 信息搜集（subfinder→dnsx→httpx→gau→waybackurls）
    ├── params.py          # 参数发现（paramspider→gf→arjun）
    ├── hunt.py            # 漏洞检测（nuclei→dalfox→CORS→trufflehog）
    ├── validate.py        # 漏洞验证（AI 7问门控）
    └── report.py          # 报告生成（中国SRC格式→桌面md文件）
```

### 使用方法

```bash
# 1. 安装依赖
pip install openai pyyaml rich

# 2. 配置
cd claude-hunt/auto_agent
cp config.yaml.example config.yaml
# 编辑 config.yaml 填入 DeepSeek API Key

# 3. 运行（交互式）
python auto_hunt.py

# 4. 或直接指定参数
python auto_hunt.py --target example.com --mode auto   # 全自动
python auto_hunt.py --target example.com --mode semi   # 半自动
```

### 两种模式对比

| | 全自动 (auto/YOLO) | 半自动 (semi/SAFE) |
|---|---|---|
| 阶段切换 | 自动进入下一阶段 | 每个阶段前问你要不要跑 |
| 命令执行 | AI自己决定跑什么命令 | 每条命令执行前让你确认 |
| AI额外探测 | 允许AI自主决定额外命令 | 不执行AI额外建议的命令 |
| 发现高危漏洞 | **暂停让你确认**（安全兜底） | 暂停让你确认 |
| 红线触发 | 立即自动停止 | 立即自动停止 |
| 适合场景 | 挂着跑一晚上 | 第一次测新目标，边看边学 |

### 运行流程

```
启动 → 选模式 → 输入目标 → 确认授权
  │
  ├── Phase 1: Recon（信息搜集）
  │     subfinder → dnsx → httpx → gau → waybackurls
  │     └── AI决策是否继续深入
  │
  ├── Phase 2: Params（参数发现）
  │     paramspider → gf(xss/ssrf) → arjun(主动探测)
  │
  ├── Phase 3: Hunt（漏洞检测）
  │     nuclei(高危) → dalfox(XSS) → CORS检测 → trufflehog(密钥)
  │     └── AI决策额外攻击面
  │
  ├── Phase 4: Validate（漏洞验证）
  │     对每个疑似漏洞做 AI 7问门控
  │     └── 发现高危 → 暂停确认
  │
  └── Phase 5: Report（报告生成）
        为每个确认漏洞生成 SRC 提交格式报告 → 保存桌面
```

### 日志输出（doing_日期.md）

每次运行在桌面生成一个 Markdown 日志，内容包括：

- 目标信息、模式、开始时间
- 每条命令的执行记录（命令+输出+AI分析）
- 红线审查结果（通过/警告/停止）
- 痕迹分析（可挖线索+建议）
- 最终汇总（子域名/URL/漏洞数量统计）

### 红线审查规则

| 触发条件 | 行为 |
|----------|------|
| 连续5个 403 响应 | 立即停止（可能被WAF封） |
| 404 比例超过 95% | 立即停止（路径全错或被ban） |
| 碰到禁止路径（/admin/delete等） | 立即停止 |
| 总请求数超过 500 | 立即停止 |
| 响应中出现"人机验证""IP封禁" | 记录警告 |

### 痕迹分析

每5步 AI 自动分析当前所有发现，输出：
- **线索**: 哪些URL/参数/子域名看起来有洞
- **建议**: 下一步最应该做什么
- **置信度**: AI对当前线索的信心程度

### 配置说明（config.yaml）

以下是完整的 `config.yaml` 配置模板，包含所有可配置项：

```yaml
# ============================================================
# Auto-Hunt Agent 完整配置模板
# 复制为 config.yaml，填入你的 Key 和 Cookie 即可使用
# ============================================================

# ---- LLM 配置（必填）----
# DeepSeek 做 AI 决策（便宜好用）
llm:
  provider: "deepseek"                      # deepseek / openai / anthropic / qwen
  api_key: "sk-你的DeepSeek-Key"            # DeepSeek API Key
  base_url: "https://api.deepseek.com/v1"   # API 地址
  model: "deepseek-chat"                    # 模型名称

# ---- 视觉 API（截图识别用，DeepSeek不支持图片所以需要单独配）----
vision:
  provider: "qwen"                          # qwen / openai
  api_key: "你的通义千问key"
  base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  model: "qwen-vl-plus"

# ---- 限速配置 ----
rate_limit:
  requests_per_second: 3                    # 每秒请求数（有WAF降到1）
  max_total_requests: 500                   # 单次运行最大请求总数
  random_delay_min: 0.5                     # 随机延迟最小值（秒）
  random_delay_max: 2.0                     # 随机延迟最大值（秒）

# ---- 红线规则 ----
redline:
  max_403_consecutive: 5                    # 连续N个403立即停止
  max_404_ratio: 0.95                       # 404比例超过此值停止
  max_total_requests: 500                   # 总请求上限
  check_interval: 10                        # 每N步做一次红线审查
  forbidden_paths:                          # 碰到这些路径立即停止
    - "/admin/delete"
    - "/system/drop"
    - "/user/export_all"

# ---- Agent 行为 ----
agent:
  trace_analysis_interval: 5                # 每N步做痕迹分析
  max_steps_per_phase: 50                   # 每阶段最大步数
  auto_mode_pause_on_high: true             # 全自动模式发现高危时暂停

# ---- Session 监控（防止账号被风控后继续发请求）----
session_monitor:
  check_url: ""                             # 登录后能正常访问的URL
  cookie: ""                                # 你的 Cookie
  expected_keyword: ""                      # 正常响应中应包含的关键词
  check_interval: 10                        # 每N步检查一次Session状态

# ---- IDOR 双账号越权检测 ----
idor:
  cookie_a: ""                              # 账号A的Cookie
  cookie_b: ""                              # 账号B的Cookie

# ---- 目标与资产发现 ----
target:
  domain: ""                                # 目标域名
  company_name: ""                          # 公司名（用于AI推测关联资产）

# ---- HexStrike 集成（可选增强后端）----
hexstrike:
  enabled: false                            # true=启用, false=禁用（默认）
  server_url: "http://127.0.0.1:8888"      # HexStrike server 地址
  timeout: 120                              # 单条命令超时（秒）
  fallback_to_local: true                   # server掉线时自动降级为本地执行
```

### 注意事项

1. **必须有授权** — 启动时会强制确认你有 SRC 授权
2. **不用 sqlmap** — AI 手工构造注入 payload，每次只发1个请求
3. **限速强制** — 所有工具命令都带限速参数，不可绕过
4. **日志留痕** — 所有操作全部记录，万一被误会有证据
5. **高危暂停** — 即使全自动模式，发现高危也会暂停等你确认
6. **需要渗透工具** — 确保先跑了 `install_tools_*.sh/ps1` 安装完所有工具



---

## 2025-06-18 新增6大功能模块

### 更新后的完整运行流程

```
启动 → 选模式 → 输入目标 → 确认授权
  │
  ├── Phase 0: 前置侦察（新增）
  │     ├── WAF检测 → 动态调整限速/UA
  │     └── 资产关联发现 → FOFA/证书/AI推测子域名
  │
  ├── Phase 1: Recon（信息搜集）
  │     subfinder → dnsx → httpx → gau → waybackurls
  │     └── 每步Session监控（被踢→停，429→降速）
  │
  ├── Phase 2: Params（参数发现）
  │     paramspider → gf(xss/ssrf) → arjun
  │
  ├── Phase 3: Hunt（漏洞检测）——已扩展
  │     ├── nuclei(高危) → dalfox(XSS) → CORS → trufflehog
  │     ├── 【新】并发竞态: AI识别支付/领券接口 → 并发测试
  │     └── 【新】IDOR越权: 双账号Cookie交叉验证
  │
  ├── Phase 4: Validate（7问门控）
  │
  ├── Phase 5: Verify（四证齐全）
  │
  ├── 【新】提交前情报查重 → 避免重复提交
  │
  └── Phase 6: Report（生成报告）
```

---

### 模块1: WAF 指纹自适应（waf_adapter.py）

**功能：** 检测目标 WAF 类型，自动调整所有后续工具的限速和请求方式。

| WAF类型 | 检测方式 | 自动调整 |
|---------|---------|---------|
| Cloudflare | wafw00f 检测 | 1 req/s + 浏览器模式 + 随机UA |
| 阿里云WAF | wafw00f 检测 | 1 req/s + 带Cookie + 正常UA |
| 宝塔WAF | wafw00f 检测 | 2 req/s + 可尝试大小写绕过 |
| 腾讯云WAF | wafw00f 检测 | 1 req/s + payload需编码 |
| 无WAF | wafw00f 检测 | 5 req/s + 正常模式 |

**自动行为：**
- 检测到 WAF 后，所有工具命令自动加上对应的限速参数
- nuclei/httpx/ffuf/dalfox/katana 的 `-rate-limit` 参数会被动态覆盖
- 随机 UA 池（5个不同浏览器UA轮换）

---

### 模块2: 账号状态监控（session_monitor.py）

**功能：** 每N步检查你的测试账号 Session 是否还活着。

**为什么需要：** SRC 测试最怕的是"账号被风控了自己不知道"，继续发请求等于白费+增加被追溯风险。

**工作方式：**
```
每10步 → 用你的Cookie访问一个已知正常的URL
  ├── 200 + 预期内容 → Session正常，继续
  ├── 302/301 → 被踢到登录页，立即停止
  ├── 403 连续3次 → IP可能被封，立即停止
  ├── 429 → 触发限速，自动降速
  └── 响应含"验证码/人机验证" → 风控触发，立即停止
```

**配置（config.yaml）：**
```yaml
session_monitor:
  check_url: "https://target.com/api/user/profile"  # 登录后能访问的URL
  cookie: "session=xxx; token=yyy"                   # 你的Cookie
  expected_keyword: "username"                       # 正常页面应该有的关键词
  check_interval: 10                                 # 每10步检查
```

---

### 模块3: 资产关联发现（asset_discovery.py）

**功能：** 从一个域名穿透发现所有关联资产（中国SRC特色）。

**发现方式：**
1. **FOFA 证书关联** — `cert="target.com"` 找同证书的其他域名
2. **AI 推测子域名** — 根据公司名推测 oa/crm/erp/hr/test/staging
3. **alterx 变异** — dev.target.com → dev2/staging/pre/uat.target.com
4. **AI 优先级排序** — 分析哪些域名最可能有洞

**配置：**
```yaml
target:
  domain: "target.com"
  company_name: "某某科技有限公司"  # 填公司名，AI会推测关联域名
```

---

### 模块4: 并发竞态自动检测

**功能：** AI 自动从 URL 列表中识别"可能有竞态"的接口，然后并发测试。

**工作方式：**
```
1. AI分析所有URL → 找出 支付/提现/领券/签到/投票 相关接口
2. 对每个目标接口并发发送5个请求
3. 对比响应码：如果多个都是200 → 可能存在竞态
4. 记录证据到日志
```

**触发条件：** URL中包含 withdraw/pay/coupon/sign/vote/redeem 等关键词时自动触发。

**红线保护：** 只并发5次就停，不会反复测试。

---

### 模块5: IDOR 多账号对比

**功能：** 配置两个测试账号的 Cookie，Agent 自动找 IDOR 接口并交叉验证。

**工作方式：**
```
1. AI从URL中找包含 用户ID/订单号/数字参数 的接口
2. 用 账号A 的Cookie访问 → 记录响应
3. 用 账号B 的Cookie访问同一接口 → 记录响应
4. 如果两个都是200 → 可能存在越权
```

**配置：**
```yaml
idor:
  cookie_a: "session=user_a_session_id"   # 账号A
  cookie_b: "session=user_b_session_id"   # 账号B
```

**红线保护：** 只用自己注册的2个账号，不遍历他人数据。

---

### 模块6: 历史漏洞情报查重（intel_checker.py）

**功能：** 出报告前自动查重，避免提交已知漏洞被忽略/扣分。

**工作方式：**
```
发现漏洞 → AI分析：
  - 这种漏洞在该目标是否属于"已知问题"？
  - 该CMS版本是否有已知CVE覆盖？
  - 补天/漏洞盒子是否可能已有同类提交？
  
输出：
  - 低风险 → 建议提交
  - 中风险 → 建议先搜索平台确认
  - 高风险 → 很可能重复，谨慎提交
```

---

### 新增配置项汇总（config.yaml）

```yaml
# 账号状态监控
session_monitor:
  check_url: ""           # 登录后可访问的URL
  cookie: ""              # 你的Cookie
  expected_keyword: ""    # 预期关键词
  check_interval: 10

# IDOR 双账号
idor:
  cookie_a: ""            # 账号A Cookie
  cookie_b: ""            # 账号B Cookie

# 资产发现
target:
  company_name: ""        # 公司名（用于关联穿透）
```

---

### 现在完整的文件结构

```
claude-hunt/auto_agent/
├── auto_hunt.py              # 主入口
├── agent_engine.py           # AI引擎(DeepSeek API)
├── hunt_logger.py            # 桌面日志(doing_日期.md)
├── redline_checker.py        # 红线审查
├── trace_analyzer.py         # 痕迹分析
├── waf_adapter.py            # 【新】WAF自适应
├── session_monitor.py        # 【新】Session监控
├── asset_discovery.py        # 【新】资产关联发现
├── intel_checker.py          # 【新】情报查重
├── config.yaml.example       # 配置模板
└── phases/
    ├── base.py               # 阶段基类
    ├── recon.py              # 信息搜集
    ├── params.py             # 参数发现
    ├── hunt.py               # 漏洞检测【已扩展：竞态+IDOR】
    ├── validate.py           # 7问验证
    ├── verify.py             # 四证齐全
    └── report.py             # 报告生成
```



---

## HexStrike AI 集成（可选增强后端）

[HexStrike AI](https://github.com/0x4m4/hexstrike-ai) 是一个开源的 MCP 渗透测试框架，封装了 **150+ 安全工具**，提供工具参数自动优化、智能缓存、错误恢复和进程管理。

### 跟 Auto-Hunt Agent 的关系

```
┌─────────────────────────────────┐
│  Auto-Hunt Agent (AI决策层)     │  ← 你的 DeepSeek AI 做决策
│  红线审查 / Session监控 / 日志  │
│  痕迹分析 / 四证验证 / 报告    │
└──────────────┬──────────────────┘
               │ execute_command()
               ▼
┌─────────────────────────────────┐
│  HexStrike Bridge (路由层)      │  ← hexstrike_bridge.py
│  判断: 走API还是本地执行?       │
└───────┬───────────────┬─────────┘
        │               │
        ▼               ▼
┌──────────────┐  ┌──────────────┐
│ HexStrike    │  │ 本地         │
│ API Server   │  │ subprocess   │
│ (150+工具    │  │ (直接执行)   │
│  参数优化)   │  │              │
└──────────────┘  └──────────────┘
```

- **有 HexStrike** → 工具命令走 API（更智能的参数+缓存+错误恢复）
- **没有 HexStrike** → 直接本地执行（跟以前一样，完全不影响）
- **HexStrike 中途掉线** → 自动降级为本地执行（不中断流程）

### 配置

```yaml
# config.yaml
hexstrike:
  enabled: false              # true=启用, false=禁用（默认）
  server_url: "http://127.0.0.1:8888"   # HexStrike server 地址
  timeout: 120                # 单条命令超时（秒）
  fallback_to_local: true     # server 掉线时自动降级为本地执行
```

**注意：**
- HexStrike 完全可选，不装不影响任何功能
- 你的 Auto-Hunt Agent 的红线/限速/Session 监控仍然生效，HexStrike 只是执行层
- 日志中会标记每条命令是通过 `[via: hexstrike]` 还是 `[via: local]` 执行的

详细安装和使用说明见 [HexStrike 官方仓库](https://github.com/0x4m4/hexstrike-ai)。
