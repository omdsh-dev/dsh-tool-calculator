# dsh-tool-calculator

DSH 计算器工具插件 —— 安全的数学表达式求值器。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 为什么需要

Agent 做算术不稳定是 LLM 通病。内置 `bash` 工具可以算，但每次起进程（Windows 上尤其贵），且 bash 算术不支持 `sqrt`/`sin`/`pow` 等函数。本插件零依赖、零进程、纯函数。

## 安全

手写递归下降解析器。无 `eval`、无 `new Function`。攻击载荷（`constructor.constructor` 链、`process.exit(0)`、`globalThis`、引号注入、分号语句）全部在词法/语法层被拒绝。

## 安装

### 前置条件

- DSH monorepo（`snapshot-20260803T142347Z-25b2ad4f67` 或更新）
- `@deepseek-ai/dsh-tools` 通过 monorepo workspace 可用

### 步骤

**1. 放入 monorepo**

```bash
cp -r dsh-tool-calculator ~/.dsh/source/master/packages/tools/dsh-tool-calculator
```

> DSH 使用 `packages/*/*` 两层 workspace 模式。本包必须放在 `packages/tools/` 下。

**2. 注册依赖**

在 `apps/cli/package.json` 的 `dependencies` 中添加：

```json
"@deepseek-ai/dsh-tool-calculator": "workspace:^"
```

**3. 配置 cordis.yml**

在 `apps/cli/config/base.cordis.yml` 中添加：

```yaml
- id: tool-calculator
  name: '@deepseek-ai/dsh-tool-calculator'
```

**4. 注册 tsconfig 引用**

在 `tsconfig.host.json` 的 `references` 中添加：

```json
{ "path": "./packages/tools/dsh-tool-calculator" }
```

**5. 构建并验证**

```bash
pnpm install
pnpm run build
dsh -p "15+27*3 用calculator工具计算"
```

## 用法

安装后，agent 自动获得 `calculator` 工具：

```
calculator { expression: "15 + 27 * sqrt(9)" }  →  96
```

支持：

- 算术：`+` `-` `*` `/` `%` `**`（幂，右结合）
- 函数：`abs` `ceil` `floor` `round` `sqrt` `pow` `log` `log2` `log10` `exp` `sin` `cos` `tan` `max` `min`
- 常量：`PI` `E`
- 括号分组、一元正负

## 测试

```bash
pnpm test
```

22 个用例：12 个基础功能 + 10 个攻击载荷。

## 许可

MIT
