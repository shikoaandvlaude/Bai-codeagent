"""Base Phase — 阶段基类"""

import time


class BasePhase:
    """所有阶段的基类"""
    
    def __init__(self, engine, logger, redline, tracer, mode):
        self.engine = engine
        self.logger = logger
        self.redline = redline
        self.tracer = tracer
        self.mode = mode  # "auto" or "semi"
    
    def execute(self, target: str, findings: dict) -> dict:
        """子类实现"""
        raise NotImplementedError
    
    def _step(self, step_name: str, target: str, phase_findings: dict, 
              global_findings: dict, command: str, parser, result_key: str):
        """执行一个步骤"""
        try:
            from rich.console import Console
            console = Console()
        except ImportError:
            class C:
                def print(self, *a, **k): print(*a)
            console = C()
        
        console.print(f"  [dim]→ {step_name}...[/dim]")
        
        # 半自动模式确认
        if self.mode == "semi":
            try:
                from rich.prompt import Confirm
                if not Confirm.ask(f"    执行 {step_name}?", default=True):
                    self.logger.log_event("SKIP", f"用户跳过: {step_name}")
                    return
            except ImportError:
                pass
        
        # 执行命令
        result = self.engine.execute_command(command)
        
        # AI 分析输出
        analysis = ""
        if result["success"] and result["output"]:
            analysis = self.engine.think(
                f"分析以下 {step_name} 的输出，简要说明发现了什么（一句话）:\n{result['output'][:2000]}",
            )
        
        # 记录日志
        self.logger.log_command(command, result, analysis)
        
        # 记录响应到红线检查器（用于统计 403/404 比例）
        if result.get("returncode") == 0:
            self.redline.record_response(200, result.get("output", ""))
        elif "403" in result.get("output", ""):
            self.redline.record_response(403, result.get("output", ""))
        elif "404" in result.get("output", ""):
            self.redline.record_response(404, result.get("output", ""))
        
        # 红线即时检查（每步都查）
        redline_result = self.redline.check({}, 0)
        if redline_result["stop"]:
            self.logger.log_event("REDLINE_STOP", redline_result["reason"])
            console.print(f"    [bold red]🚨 红线触发: {redline_result['reason']}[/bold red]")
            return
        
        # 解析结果
        if result["success"] and result["output"] and parser and result_key:
            parsed = parser(result["output"])
            if parsed:
                phase_findings[result_key].extend(parsed)
                console.print(f"    [green]✓ 发现 {len(parsed)} 条[/green]")
            else:
                console.print(f"    [dim]○ 无新发现[/dim]")
        elif not result["success"]:
            console.print(f"    [red]✗ 失败[/red]")
        
        # 限速
        time.sleep(self.engine.config.get('rate_limit', {}).get('delay_between_phases', 2))
    
    def _safe_command(self, command: str, target: str) -> bool:
        """检查命令是否安全"""
        dangerous = ['sqlmap', 'rm ', 'wget -O', 'curl -o', '> /', 'sudo', 'chmod 777']
        for d in dangerous:
            if d in command:
                return False
        return True
