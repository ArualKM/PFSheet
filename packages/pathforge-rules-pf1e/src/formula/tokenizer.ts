/**
 * Tokenizer for the safe formula language.
 *
 * Security: the lexer ONLY recognizes a fixed alphabet (numbers, a small set of
 * operators, parentheses, commas, identifiers, and `@{path}` references). Any
 * other character is a hard error. There is no path by which arbitrary JS,
 * property access, or function references can enter the token stream.
 */

export type TokenType =
  | "number"
  | "ref"
  | "ident"
  | "op"
  | "lparen"
  | "rparen"
  | "comma"
  | "eof";

export type Token = {
  type: TokenType;
  value: string;
  /** Character offset in the source, for error messages. */
  pos: number;
};

export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    public pos: number,
  ) {
    super(message);
    this.name = "FormulaSyntaxError";
  }
}

/** Hard cap on formula source length — formulas are short by nature; this
 * bounds tokenizer/parser work on untrusted input. */
export const MAX_FORMULA_LENGTH = 4000;

const TWO_CHAR_OPS = new Set(["==", "!=", "<=", ">=", "&&", "||"]);
const ONE_CHAR_OPS = new Set(["+", "-", "*", "/", "<", ">", "!"]);
const REF_PATH_RE = /^[A-Za-z0-9_.[\]-]+$/;

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}
function isIdentStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}
function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

export function tokenize(input: string): Token[] {
  if (input.length > MAX_FORMULA_LENGTH) {
    throw new FormulaSyntaxError(
      `Formula exceeds maximum length of ${MAX_FORMULA_LENGTH} characters`,
      0,
    );
  }
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i]!;

    // whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    // reference @{path}
    if (ch === "@") {
      if (input[i + 1] !== "{") {
        throw new FormulaSyntaxError("Expected '{' after '@'", i);
      }
      const start = i + 2;
      let j = start;
      while (j < n && input[j] !== "}") j++;
      if (j >= n) throw new FormulaSyntaxError("Unterminated reference '@{...}'", i);
      const path = input.slice(start, j);
      if (!REF_PATH_RE.test(path)) {
        throw new FormulaSyntaxError(`Invalid reference path: "${path}"`, i);
      }
      tokens.push({ type: "ref", value: path, pos: i });
      i = j + 1;
      continue;
    }

    // number
    if (isDigit(ch) || (ch === "." && isDigit(input[i + 1] ?? ""))) {
      let j = i;
      let seenDot = false;
      while (j < n) {
        const c = input[j]!;
        if (isDigit(c)) {
          j++;
        } else if (c === "." && !seenDot) {
          seenDot = true;
          j++;
        } else {
          break;
        }
      }
      tokens.push({ type: "number", value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // identifier (function name)
    if (isIdentStart(ch)) {
      let j = i;
      while (j < n && isIdentPart(input[j]!)) j++;
      tokens.push({ type: "ident", value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // punctuation
    if (ch === "(") {
      tokens.push({ type: "lparen", value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", value: ch, pos: i });
      i++;
      continue;
    }

    // operators (two-char first)
    const two = input.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ type: "op", value: two, pos: i });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.has(ch)) {
      tokens.push({ type: "op", value: ch, pos: i });
      i++;
      continue;
    }

    throw new FormulaSyntaxError(`Unexpected character '${ch}'`, i);
  }

  tokens.push({ type: "eof", value: "", pos: n });
  return tokens;
}
