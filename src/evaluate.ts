/**
 * 零依赖、无 eval / new Function 的数学表达式求值器。
 *
 * 安全模型：词法层只识别数字、白名单标识符、运算符；
 * 语法层按优先级递归下降求值；标识符按名查白名单表，查不到即抛错。
 * 任何形式的代码注入（constructor.constructor 链、process 全局、
 * 引号注入、分号语句等）均被词法/语法层拒绝。
 */

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
  sqrt: Math.sqrt, pow: Math.pow, log: Math.log, log2: Math.log2,
  log10: Math.log10, exp: Math.exp, sin: Math.sin, cos: Math.cos,
  tan: Math.tan, max: Math.max, min: Math.min,
}

const CONSTANTS: Record<string, number> = {
  PI: Math.PI, E: Math.E,
}

/** 词法分析：将输入字符串拆分为 token 数组 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  for (let i = 0; i < input.length;) {
    const ch = input.charAt(i)
    if (/\s/.test(ch)) { i++; continue }
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < input.length && /[0-9]/.test(input.charAt(i + 1)))) {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(input.slice(i))
      if (!m) throw new Error(`Invalid number at position ${i}`)
      tokens.push(m[0]); i += m[0].length; continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_]\w*/.exec(input.slice(i))
      if (!m) throw new Error(`Invalid identifier at position ${i}`)
      tokens.push(m[0]); i += m[0].length; continue
    }
    if (ch === '*' && input[i + 1] === '*') { tokens.push('**'); i += 2; continue }
    if ('+-*/%(),'.includes(ch)) { tokens.push(ch); i++; continue }
    throw new Error(`Invalid character "${ch}" at position ${i}`)
  }
  return tokens
}

/** 语法分析 + 求值（递归下降，按运算符优先级） */
function parse(input: string): number {
  const tokens = tokenize(input)
  let pos = 0
  const peek = (): string | undefined => tokens[pos]
  const take = (): string | undefined => tokens[pos++]

  // 加减（最低优先级）
  const parseAdd = (): number => {
    let left = parseMul()
    while (peek() === '+' || peek() === '-') {
      const op = take()
      const right = parseMul()
      left = op === '+' ? left + right : left - right
    }
    return left
  }
  // 乘除取模
  const parseMul = (): number => {
    let left = parseUnary()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = take()
      const right = parseUnary()
      left = op === '*' ? left * right : op === '/' ? left / right : left % right
    }
    return left
  }
  // 一元正负
  const parseUnary = (): number => {
    if (peek() === '-' || peek() === '+') {
      const op = take()
      return op === '-' ? -parseUnary() : parseUnary()
    }
    return parsePower()
  }
  // 幂（右结合）
  const parsePower = (): number => {
    const base = parsePrimary()
    if (peek() === '**') {
      take()
      return base ** parseUnary()
    }
    return base
  }
  // 原子：数字 / 常量 / 函数调用 / 括号
  const parsePrimary = (): number => {
    const t = take()
    if (t === undefined) throw new Error('Unexpected end of expression')
    if (t === '(') {
      const value = parseAdd()
      if (take() !== ')') throw new Error('Missing closing parenthesis')
      return value
    }
    if (t === ')') throw new Error('Unexpected ")"')
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return Number(t)
    if (/^[A-Za-z_]\w*$/.test(t)) {
      if (t in CONSTANTS) {
        if (peek() === '(') throw new Error(`"${t}" is a constant, not a function`)
        return CONSTANTS[t]!
      }
      if (t in FUNCTIONS) {
        if (take() !== '(') throw new Error(`Missing "(" after function "${t}"`)
        const args: number[] = []
        if (peek() !== ')') {
          args.push(parseAdd())
          while (peek() === ',') { take(); args.push(parseAdd()) }
        }
        if (take() !== ')') throw new Error(`Missing ")" after arguments of "${t}"`)
        return FUNCTIONS[t]!(...args)
      }
      throw new Error(`Unknown identifier "${t}"`)
    }
    throw new Error(`Unexpected token "${t}"`)
  }

  const value = parseAdd()
  if (pos < tokens.length) throw new Error(`Unexpected token "${tokens[pos]}"`)
  return value
}

/** 公开接口：求值表达式，返回有限数字；NaN/Infinity 或其他错误均抛错 */
const MAX_EXPRESSION_LENGTH = 500

export function evaluate(expression: string): number {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(`Expression too long (${expression.length} > ${MAX_EXPRESSION_LENGTH})`)
  }
  const result = parse(expression)
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Expression did not evaluate to a finite number')
  }
  return result
}
