/** AST node types for the PathForge safe formula language. */

export type NumberLiteral = { type: "number"; value: number };
export type Reference = { type: "ref"; path: string };
export type Unary = { type: "unary"; op: "-" | "+" | "!"; operand: Node };
export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "&&"
  | "||";
export type Binary = { type: "binary"; op: BinaryOp; left: Node; right: Node };
export type Call = { type: "call"; name: string; args: Node[] };

export type Node = NumberLiteral | Reference | Unary | Binary | Call;
