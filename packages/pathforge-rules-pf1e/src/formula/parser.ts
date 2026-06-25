import type { BinaryOp, Node } from "./ast";
import { FormulaSyntaxError, tokenize, type Token } from "./tokenizer";

/**
 * Recursive-descent parser producing an AST. No code is ever generated or
 * executed — the output is a plain data tree consumed by the evaluator.
 *
 * Precedence (lowest to highest):
 *   ||  →  &&  →  == !=  →  < <= > >=  →  + -  →  * /  →  unary  →  primary
 */
/** Maximum expression nesting depth — bounds recursion on untrusted input. */
export const MAX_PARSE_DEPTH = 256;

export function parse(input: string): Node {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const node = parser.parseExpression();
  parser.expectEof();
  return node;
}

class Parser {
  private idx = 0;
  private depth = 0;
  constructor(private readonly tokens: Token[]) {}

  private enterDepth(): void {
    if (++this.depth > MAX_PARSE_DEPTH) {
      throw new FormulaSyntaxError("Formula is nested too deeply", this.peek().pos);
    }
  }

  private peek(): Token {
    return this.tokens[this.idx]!;
  }
  private next(): Token {
    return this.tokens[this.idx++]!;
  }
  private isOp(...values: string[]): boolean {
    const t = this.peek();
    return t.type === "op" && values.includes(t.value);
  }

  expectEof(): void {
    const t = this.peek();
    if (t.type !== "eof") {
      throw new FormulaSyntaxError(`Unexpected '${t.value || t.type}'`, t.pos);
    }
  }

  parseExpression(): Node {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): Node {
    let left = this.parseLogicalAnd();
    while (this.isOp("||")) {
      this.next();
      left = { type: "binary", op: "||", left, right: this.parseLogicalAnd() };
    }
    return left;
  }

  private parseLogicalAnd(): Node {
    let left = this.parseEquality();
    while (this.isOp("&&")) {
      this.next();
      left = { type: "binary", op: "&&", left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): Node {
    let left = this.parseComparison();
    while (this.isOp("==", "!=")) {
      const op = this.next().value as BinaryOp;
      left = { type: "binary", op, left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): Node {
    let left = this.parseAdditive();
    while (this.isOp("<", "<=", ">", ">=")) {
      const op = this.next().value as BinaryOp;
      left = { type: "binary", op, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (this.isOp("+", "-")) {
      const op = this.next().value as BinaryOp;
      left = { type: "binary", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    while (this.isOp("*", "/")) {
      const op = this.next().value as BinaryOp;
      left = { type: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.isOp("-", "+", "!")) {
      const op = this.next().value as "-" | "+" | "!";
      this.enterDepth();
      try {
        return { type: "unary", op, operand: this.parseUnary() };
      } finally {
        this.depth--;
      }
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    this.enterDepth();
    try {
      return this.parsePrimaryInner();
    } finally {
      this.depth--;
    }
  }

  private parsePrimaryInner(): Node {
    const t = this.peek();

    if (t.type === "number") {
      this.next();
      const value = Number(t.value);
      if (!Number.isFinite(value)) {
        throw new FormulaSyntaxError(`Invalid number '${t.value}'`, t.pos);
      }
      return { type: "number", value };
    }

    if (t.type === "ref") {
      this.next();
      return { type: "ref", path: t.value };
    }

    if (t.type === "lparen") {
      this.next();
      const expr = this.parseExpression();
      const close = this.peek();
      if (close.type !== "rparen") {
        throw new FormulaSyntaxError("Expected ')'", close.pos);
      }
      this.next();
      return expr;
    }

    if (t.type === "ident") {
      this.next();
      const open = this.peek();
      if (open.type !== "lparen") {
        // Bare identifiers are not allowed — only function calls and @{refs}.
        throw new FormulaSyntaxError(
          `Unknown token '${t.value}'. Use @{path} for references or a function call.`,
          t.pos,
        );
      }
      this.next(); // consume '('
      const args: Node[] = [];
      if (this.peek().type !== "rparen") {
        args.push(this.parseExpression());
        while (this.peek().type === "comma") {
          this.next();
          args.push(this.parseExpression());
        }
      }
      const close = this.peek();
      if (close.type !== "rparen") {
        throw new FormulaSyntaxError(`Expected ')' to close ${t.value}(...)`, close.pos);
      }
      this.next();
      return { type: "call", name: t.value, args };
    }

    throw new FormulaSyntaxError(`Unexpected '${t.value || t.type}'`, t.pos);
  }
}
