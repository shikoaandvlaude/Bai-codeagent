"""Hunt Phase — 漏洞挖掘阶段"""

from .base import BasePhase


class HuntPhase(BasePhase):
    """漏洞挖掘：XSS、CORS、密钥泄露、并发竞态、IDOR越权"""
    
    def execute(self, target: str, findings: dict) -> dict:
        phase_findings = {"vulnerabilities": [], "secrets": []}
        
        self.logger.log_phase_start("漏洞挖掘 (Hunt)")
        
        # Step 1: Nuclei 扫描（限速+只扫高危）
        alive = findings.get('alive_hosts', [])
        if alive:
            hosts_str = '\\n'.join(alive[:20])
            self._step("Nuclei高危扫描", target, phase_findings, findings,
                       f"echo '{hosts_str}' | nuclei -severity critical,high -rate-limit 5 -c 3 -silent 2>/dev/null | head -50",
                       self._parse_nuclei,
                       "vulnerabilities")
        
        # Step 2: XSS 检测 (dalfox)
        params = findings.get('params', [])
        xss_urls = [p for p in params if '?' in p][:10]
        if xss_urls:
            urls_str = '\\n'.join(xss_urls)
            self._step("Dalfox XSS检测", target, phase_findings, findings,
                       f"echo '{urls_str}' | dalfox pipe --worker 2 --delay 300 --silence 2>/dev/null | head -20",
                       self._parse_dalfox,
                       "vulnerabilities")
        
        # Step 3: CORS 错配检测
        if alive:
            hosts_str = '\\n'.join(alive[:10])
            self._step("CORS错配检测", target, phase_findings, findings,
                       f"echo '{hosts_str}' | while read h; do curl -s -H 'Origin: https://evil.com' -I \"$h\" 2>/dev/null | grep -i 'access-control' && echo \"CORS: $h\"; done | head -20",
                       self._parse_cors,
                       "vulnerabilities")
        
        # Step 4: 密钥泄露扫描
        self._step("TruffleHog密钥扫描", target, phase_findings, findings,
                   f"trufflehog github --org={target.split('.')[0]} --only-verified --json 2>/dev/null | head -10",
                   self._parse_secrets,
                   "secrets")
        
        # Step 5: 并发竞态检测（SRC高价值）
        self._race_condition_test(target, findings, phase_findings)
        
        # Step 6: IDOR 越权检测（多账号对比）
        self._idor_test(target, findings, phase_findings)
        
        # Step 7: AI 决策额外攻击面
        if self.mode == "auto":
            combined = {**findings, **phase_findings}
            decision = self.engine.decide_next_action("hunt", combined, target)
            if decision.get("action") == "execute":
                cmd = decision.get("command", "")
                if cmd and self._safe_command(cmd, target):
                    self._step(f"AI: {decision.get('reason', '额外探测')}", target, 
                               phase_findings, findings, cmd, lambda out: [], None)
        
        return phase_findings
    
    def _race_condition_test(self, target: str, findings: dict, phase_findings: dict):
        """并发竞态自动检测"""
        # 让 AI 从已发现的 URL 中识别可能存在竞态的接口
        urls = findings.get('urls', []) + findings.get('params', [])
        if not urls:
            return
        
        # AI 筛选可能的竞态接口
        sample_urls = '\n'.join(urls[:50])
        analysis = self.engine.think(f"""
从以下URL列表中，找出可能存在并发竞态漏洞的接口（支付/提现/领券/签到/投票/点赞）：

{sample_urls}

只输出你认为最可能有竞态问题的URL（最多3个），每行一个。
如果没有找到，输出 "NONE"
""")
        
        if not analysis or "NONE" in analysis.upper():
            return
        
        race_targets = [l.strip() for l in analysis.strip().split('\n') if l.strip() and 'http' in l.lower()][:3]
        
        if not race_targets:
            return
        
        self.logger.log_event("FINDING", f"识别到 {len(race_targets)} 个可能的竞态接口")
        
        # 获取配置中的 Cookie
        cookie = self.engine.config.get('session_monitor', {}).get('cookie', '')
        
        for race_url in race_targets:
            # 用 race_tester.py 测试（如果存在的话）
            # 否则用简单的 curl 并发
            if cookie:
                cmd = (f'for i in $(seq 1 5); do '
                       f'curl -s -o /dev/null -w "%{{http_code}}\\n" '
                       f'-H "Cookie: {cookie}" '
                       f'"{race_url}" & done; wait')
            else:
                cmd = (f'for i in $(seq 1 5); do '
                       f'curl -s -o /dev/null -w "%{{http_code}}\\n" '
                       f'"{race_url}" & done; wait')
            
            self._step(f"竞态测试: {race_url[:50]}", target, phase_findings, findings,
                       cmd, self._parse_race, "vulnerabilities")
    
    def _idor_test(self, target: str, findings: dict, phase_findings: dict):
        """IDOR 越权检测（多账号对比）"""
        config = self.engine.config
        idor_config = config.get('idor', {})
        
        cookie_a = idor_config.get('cookie_a', '')
        cookie_b = idor_config.get('cookie_b', '')
        
        if not cookie_a or not cookie_b:
            # 没配置双账号，跳过
            return
        
        # AI 从 URL 中找可能有 IDOR 的接口
        urls = findings.get('urls', []) + findings.get('params', [])
        if not urls:
            return
        
        sample_urls = '\n'.join(urls[:50])
        analysis = self.engine.think(f"""
从以下URL中，找出可能存在IDOR(越权访问)的接口。
特征：URL中包含用户ID/订单号/数字参数的。
例如: /api/user/123/profile, /order/456, /message?id=789

{sample_urls}

只输出最可能有IDOR的URL（最多3个），每行一个。
如果没有找到，输出 "NONE"
""")
        
        if not analysis or "NONE" in analysis.upper():
            return
        
        idor_targets = [l.strip() for l in analysis.strip().split('\n') if l.strip() and 'http' in l.lower()][:3]
        
        if not idor_targets:
            return
        
        self.logger.log_event("FINDING", f"识别到 {len(idor_targets)} 个可能的IDOR接口")
        
        for idor_url in idor_targets:
            # 用 A 的 Cookie 访问，再用 B 的 Cookie 访问，对比
            cmd = (
                f'echo "=== Account A ===" && '
                f'curl -s -w "\\nHTTP_CODE:%{{http_code}}" -H "Cookie: {cookie_a}" "{idor_url}" | tail -5 && '
                f'echo "\\n=== Account B ===" && '
                f'curl -s -w "\\nHTTP_CODE:%{{http_code}}" -H "Cookie: {cookie_b}" "{idor_url}" | tail -5'
            )
            
            self._step(f"IDOR测试: {idor_url[:50]}", target, phase_findings, findings,
                       cmd, self._parse_idor, "vulnerabilities")
    
    def _parse_nuclei(self, output: str) -> list:
        """解析 nuclei 输出"""
        vulns = []
        for line in output.strip().split('\n'):
            if line.strip():
                vulns.append({
                    "type": "nuclei",
                    "url": line.strip(),
                    "severity": "high",
                    "detail": line.strip()
                })
        return vulns
    
    def _parse_dalfox(self, output: str) -> list:
        """解析 dalfox 输出"""
        vulns = []
        for line in output.strip().split('\n'):
            if line.strip() and 'POC' in line.upper() or 'XSS' in line.upper():
                vulns.append({
                    "type": "XSS",
                    "url": line.strip(),
                    "severity": "high",
                    "detail": line.strip()
                })
        return vulns
    
    def _parse_cors(self, output: str) -> list:
        """解析 CORS 输出"""
        vulns = []
        for line in output.strip().split('\n'):
            if 'CORS:' in line:
                vulns.append({
                    "type": "CORS Misconfiguration",
                    "url": line.replace("CORS:", "").strip(),
                    "severity": "medium",
                    "detail": "Access-Control-Allow-Origin 接受任意来源"
                })
        return vulns
    
    def _parse_secrets(self, output: str) -> list:
        """解析 trufflehog 输出"""
        secrets = []
        for line in output.strip().split('\n'):
            if line.strip():
                secrets.append(line.strip()[:200])
        return secrets

    def _parse_race(self, output: str) -> list:
        """解析并发竞态测试输出"""
        vulns = []
        codes = [l.strip() for l in output.strip().split('\n') if l.strip().isdigit()]
        if codes:
            # 如果所有并发请求都返回200，可能存在竞态
            success_count = codes.count("200")
            if success_count > 1:
                vulns.append({
                    "type": "Race Condition (并发竞态)",
                    "url": "见日志",
                    "severity": "high",
                    "detail": f"并发{len(codes)}次请求，{success_count}次成功(200)，可能存在竞态"
                })
        return vulns

    def _parse_idor(self, output: str) -> list:
        """解析 IDOR 测试输出"""
        vulns = []
        # 如果两个账号都能访问同一资源（都是200），可能有IDOR
        if "Account A" in output and "Account B" in output:
            if output.count("HTTP_CODE:200") >= 2:
                vulns.append({
                    "type": "IDOR (水平越权)",
                    "url": "见日志",
                    "severity": "high",
                    "detail": "两个不同账号都能访问同一资源，可能存在越权"
                })
        return vulns
