# 参与 FloraCast

欢迎通过代码、文档、数据核验、界面翻译和实际使用反馈参与项目。维护负责人及决策方式见 [GOVERNANCE.md](GOVERNANCE.md)。

## 问题与建议

可在 [GitHub Issues](https://github.com/Karl-XZ/FloraCast-Research/issues) 或 [Gitee Issues](https://gitee.com/karl-zhou/FloraCast-Research/issues) 提交。相同问题选择一个入口即可；跨平台讨论时附上对应链接。

问题报告请提供：

1. 使用的提交号、部署地址或本地启动方式。
2. 浏览器、操作系统、界面语言。
3. 操作步骤、预期结果与实际结果。
4. 相关地点、日期、产品、半径和查询文本；物种问题附原始观测链接。
5. 去除密钥、Cookie 和个人信息后的截图或错误信息。

功能建议请说明使用者、具体任务、当前操作成本和期望输出。涉及科学计算时，同时说明单位、时间范围、数据来源及计算依据。

## 本地开发

```bash
git clone https://github.com/Karl-XZ/FloraCast-Research.git
cd FloraCast-Research
npm ci --prefix server
```

将根目录 `.env.example` 复制为 `.env`，按需填写服务配置，再运行：

```bash
npm start --prefix server
npm test --prefix server
npm run verify:local --prefix server
```

完整步骤见 [部署说明](docs/deployment.md)。验证命令与覆盖范围见 [验证说明](docs/verification.md)。

## 提交修改

1. 从当前 `master` 创建一个用途明确的分支，例如 `fix/photo-selection` 或 `docs/setup-guide`。
2. 保持修改集中，沿用现有文件结构和编码风格。
3. 在 PR 中写清问题、修改内容、验证方法，以及对既有行为的影响。
4. 修改计算逻辑时运行相关已有测试，并为实际缺陷补充能够区分正确与错误行为的回归用例。
5. 修改界面时提供实际操作截图、地点与日期；说明远端数据请求是否成功。
6. 更新对应文档；面向使用者的变化记入 [CHANGELOG.md](CHANGELOG.md)。

维护者审核后合并；涉及数据来源、统计解释、授权范围或接口兼容性的修改，需要在讨论中说明依据。请求修改时保留原有讨论，方便后续追踪。

## 代码、数据与许可

- 新增代码按本项目 MIT 许可贡献，保留已有版权声明。
- 新增依赖注明名称、版本、用途和许可，并更新依赖锁文件及 [第三方说明](THIRD_PARTY_NOTICES.md)。
- 植物照片保留作者、原始记录与逐张许可；观测数据和照片可能采用不同许可。
- 测试数据注明真实来源或合成方式，保留缺失值，不将合成数据写成实测记录。
- 密钥放在本地环境或部署平台的密钥配置中。提交前检查差异，勿上传 `.env`、Cookie 或访问令牌。

## 协作约定

讨论围绕可复现的问题、代码和数据展开。尊重贡献者与数据提供者，清楚标注引用和贡献。涉及未公开的服务漏洞、账户或密钥问题，使用 [安全反馈流程](SECURITY.md)。
