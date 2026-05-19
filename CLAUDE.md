# Bai-codeagent

详细工具说明、配置方法、注意事项见 know.md。

## 核心命令

```
/recon target.com              信息搜集
/hunt target.com               漏洞挖掘
/autopilot target.com --normal 全自动
/validate                      验证漏洞
/report                        生成报告
```

## 项目结构

- `server.js` — Web面板 (npm start → localhost:3000)
- `redops/` — RedOps Agent (python main.py → localhost:8000)
- `claude-hunt/` — Claude Code 自动化挖掘工具集
- `claude-hunt/tools/` — 渗透工具脚本
- `claude-hunt/mcp/` — MCP Server (Fiddler/Burp/RedOps)
- `know.md` — 完整工具文档和配置说明
