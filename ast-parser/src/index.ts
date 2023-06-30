import { Parser } from "./parse";
import { Tokenizer } from "./tokenizer";

export function parse(code: string) {
  const tokenizer = new Tokenizer(code);
  const tokens = tokenizer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

export * from "./tokenizer";
export * from "./node-types";
