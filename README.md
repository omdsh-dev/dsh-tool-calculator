# dsh-tool-calculator

DSH 计算器工具插件 —— 安全的数学表达式求值器。零依赖、零进程、纯函数。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 动机

Agent 做算术不稳定是 LLM 的通病。DSH 内置的 `bash` 工具可以调用 `echo $((15 + 27 * 3))` 完成计算，但有两个问题：

1. **每次算术都起一个 bash 进程**——Windows 上尤其昂贵（创建进程、加载 shell、执行、收集输出），高频调用时累积延迟显著
2. **bash 算术语法有限**——不支持 `sqrt`、`sin`、`cos`、`log`、`pow` 等数学函数，agent 在这些场景下只能猜答案或写脚本

本插件提供零依赖、零进程、纯函数的计算器——一次函数调用，毫秒级得出结果，覆盖常用初等数学函数。

## 安全模型

**无 `eval`、无 `new Function`。** 使用手写递归下降解析器（词法层 + 语法层），只求值白名单节点：

- 词法层只识别数字字面量、白名单标识符、运算符；引号、分号、反引号、`{}` `[]` 直接报错
- 标识符按名查白名单表（15 个函数 + 2 个常量），查不到即抛 `Unknown identifier`
- 求值结果必须是有限数字，`NaN`/`Infinity`（除零、负数开方等）统一拒绝

`new Function` + 正则白名单是**不安全的**——`constructor.constructor(...)` 可直达 `Function` 构造器执行任意代码，`process.exit(0)` 可直接杀死宿主进程（均已实测复现）。本实现不使用任何代码求值捷径。

## 架构

```
┌──────────────────────────────┐
│         DSH Agent             │
│  tool call: calculator { ... }│
└──────────┬───────────────────┘
           │ ctx.tools.register()
┌──────────▼───────────────────┐
│     src/index.ts             │
│     Cordis 插件入口           │
└──────────┬───────────────────┘
           │
┌──────────▼───────────────────┐
│     src/evaluate.ts          │
│     tokenize() → parse()     │
│     递归下降解析器            │
└──────────────────────────────┘
```

- `src/index.ts`：Cordis 插件入口（`name`/`inject`/`apply`），注册 `calculator` 工具
- `src/evaluate.ts`：`evaluate(expression: unknown): number`——入口独立校验类型（非字符串抛 `calculator: expression must be a string`），返回有限数字，非法输入全部抛错

## 工具声明

```ts
import type { Context } from 'cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { evaluate } from './evaluate.ts'

export const name = '@deepseek-ai/dsh-tool-calculator'
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'calculator',
    description:
      'Evaluate a mathematical expression safely. ' +
      'Supports +, -, *, /, %, **, parentheses, and functions: ' +
      'abs, ceil, floor, round, max, min, sqrt, pow, log, log2, log10, exp, sin, cos, tan, PI, E.',
    parameters: {
      expression: {
        type: 'string',
        required: true,
        description: 'Mathematical expression, e.g. "15 + 27 * sqrt(9)"',
      },
    },
    output: {
      schema: { type: 'number' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: async (args) => evaluate(args.expression),
    timeoutMs: 1000,
  }))
}
```

## 支持的操作

| 类别 | 项目 |
|------|------|
| 算术 | `+` `-` `*` `/` `%` `**`（幂，右结合：`2 ** 3 ** 2` = 512） |
| 函数（单参） | `abs` `ceil` `floor` `round` `sqrt` `log` `log2` `log10` `exp` `sin` `cos` `tan` |
| 函数（多参） | `pow(x, y)` `max(a, b, ...)` `min(a, b, ...)` |
| 常量 | `PI` `E` |
| 分组 | `(` `)`，一元正负 `+5` `-5` |

优先级：`**`（右结合）> 一元 `±` > `* / %` > `+ -`。

## 接入方式

### 前置条件

- DSH monorepo（`snapshot-20260803T142347Z-25b2ad4f67` 或更新）
- `@deepseek-ai/dsh-tools` 通过 monorepo workspace 可用

### 步骤

**1. 放入 monorepo**

```bash
cp -r dsh-tool-calculator ~/.dsh/source/master/packages/tools/dsh-tool-calculator
```

> DSH 使用 `packages/*/*` 两层 workspace 模式。本包必须放在 `packages/tools/` 下。

**2. 注册依赖**（`apps/cli/package.json`）

```json
"@deepseek-ai/dsh-tool-calculator": "workspace:^"
```

**3. 配置 cordis.yml**（`apps/cli/config/base.cordis.yml`）

```yaml
- id: tool-calculator
  name: '@deepseek-ai/dsh-tool-calculator'
```

**4. 注册 tsconfig 引用**（`tsconfig.host.json` 的 `references`）

```json
{ "path": "./packages/tools/dsh-tool-calculator" }
```

**5. 验证**

```bash
pnpm install
pnpm test              # 本地单测（源码仓库不内置 build 脚本，集成后由 monorepo 宿主构建）
```

集成后在 DSH monorepo 根执行 `pnpm run build` 并验证：

```bash
dsh -p "15+27*3 用calculator工具计算"
```

## 用法

安装后，agent 自动获得 `calculator` 工具：

```
calculator { expression: "15 + 27 * sqrt(9)" }  →  96
```

工具名满足 DeepSeek 函数名约束（≤64 字符，`[A-Za-z0-9_-]`）。注册后自动进入 Code Mode SDK（`await tools.calculator(...)`），canonical 返回值为数字。

## 已知限制

1. **分发链路**：`@deepseek-ai/dsh-tools` 是 DSH monorepo 私有包（未发布 npm），本插件需放入 monorepo 走 workspace 解析
2. **三角函数使用弧度**：与 `Math.sin`/`Math.cos` 一致；需要角度时写 `sin(30 * PI / 180)`
3. **不支持大整数**：JS `number` 是 IEEE 754 double，安全整数范围 ±9e15，超出有精度损失
4. **不支持科学计数法**：`1e5` 会被词法层拒绝

## 测试

```bash
pnpm test
```

包含功能用例与攻击载荷用例（`constructor.constructor` 链、`process.exit(0)`、`globalThis`、引号注入、分号语句等）。完整用例清单见本地维护的设计文档。

## 许可

MIT
