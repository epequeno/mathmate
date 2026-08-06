/**
 * safeMath — Safe arithmetic expression evaluator
 *
 * Replaces `new Function()` / `eval()` for evaluating math expressions
 * that originate from model output or user input.
 *
 * Uses mathjs parse → AST validation → evaluation against a frozen scope.
 * Only allowlisted operators, functions, and symbols are permitted.
 * Anything else (property access, assignment, function definitions, etc.)
 * is rejected and returns NaN.
 */

import { parse, type MathNode } from "mathjs";

/* ── Allowlist ──────────────────────────────────────────────────── */

const ALLOWED_FUNCTIONS = new Set([
  "sin", "cos", "tan",
  "asin", "acos", "atan",
  "sinh", "cosh", "tanh",
  "sqrt", "abs",
  "log", "log2", "log10",
  "exp",
  "floor", "ceil", "round", "sign",
  "pow", "min", "max",
]);

/** Operators that map to arithmetic ops: + - * / ^ */
const ALLOWED_OPERATORS = new Set(["+", "-", "*", "/", "^"]);

/** Built-in symbol constants always allowed (even if not in user scope). */
const BUILTIN_SYMBOLS = new Set(["pi", "e", "i", "Infinity", "NaN"]);

/* ── Recursive AST validator ───────────────────────────────────── */

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Validate that every node in an AST subtree is within the allowlist.
 * Throws ValidationError on first disallowed node.
 */
function validateNode(node: MathNode, allowedVars: Set<string>): void {
  switch (node.type) {
    case "OperatorNode": {
      const n = node as any;
      if (!ALLOWED_OPERATORS.has(n.op)) {
        throw new ValidationError(
          `Disallowed operator "${n.op}"`
        );
      }
      // Validate children (the args are always MathNode[])
      for (const arg of n.args ?? []) {
        validateNode(arg, allowedVars);
      }
      break;
    }

    case "FunctionNode": {
      const n = node as any;
      const fnName = n.fn?.name ?? n.name ?? "";
      if (!ALLOWED_FUNCTIONS.has(fnName)) {
        throw new ValidationError(`Disallowed function "${fnName}"`);
      }
      for (const arg of n.args ?? []) {
        validateNode(arg, allowedVars);
      }
      break;
    }

    case "SymbolNode": {
      const sym = node as any;
      const name: string = sym.name ?? "";
      // Allow built-in constants and variables present in scope
      if (!BUILTIN_SYMBOLS.has(name) && !allowedVars.has(name)) {
        throw new ValidationError(`Disallowed symbol "${name}"`);
      }
      break;
    }

    case "ConstantNode": {
      // Always allowed — any numeric literal (including hex, scientific notation)
      break;
    }

    case "ParenthesisNode": {
      const paren = node as any;
      if (paren.content) {
        validateNode(paren.content, allowedVars);
      }
      break;
    }

    case "UnaryMinusNode": {
      const unary = node as any;
      if (unary.arg) {
        validateNode(unary.arg, allowedVars);
      }
      break;
    }

    default: {
      throw new ValidationError(
        `Disallowed node type "${node.type}"`
      );
    }
  }
}

/* ── Public API ─────────────────────────────────────────────────── */

export interface SafeMathResult {
  value: number;
  error?: undefined;
}

export interface SafeMathError {
  value?: undefined;
  error: string;
}

export type SafeMathOutcome = SafeMathResult | SafeMathError;

/**
 * Evaluate a math expression safely.
 *
 * Returns `{ value: number }` on success, or `{ error: string }` on failure.
 * Never throws.
 */
export function safeEvalNumber(
  expr: string,
  scope: Record<string, number> = {}
): SafeMathOutcome {
  const trimmed = expr.trim();
  if (trimmed.length === 0) {
    return { value: NaN };
  }

  // Build the set of allowed variable names from scope keys
  const allowedVars = new Set(Object.keys(scope));

  try {
    const node = parse(trimmed);

    // Reject empty expressions (whitespace-only, etc.)
    if (!node) {
      return { value: NaN };
    }

    // 1. Validate the AST against the allowlist
    validateNode(node, allowedVars);

    // 2. Deep-freeze the scope so user code can't mutate it
    const frozenScope = Object.freeze({ ...scope });

    // 3. Evaluate
    const raw = node.evaluate(frozenScope);

    // 4. Coerce to number; reject non-finite / non-numeric results
    const num = Number(raw);
    if (!isFinite(num)) {
      return { value: num }; // ±Infinity, NaN are "valid" math results
    }
    return { value: num };
  } catch (err) {
    const message =
      err instanceof ValidationError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown evaluation error";
    return { error: `Parse error: ${message}` };
  }
}

/**
 * Convenience: return a numeric value or NaN. Never throws.
 */
export function safeEvalNumberOrNaN(
  expr: string,
  scope: Record<string, number> = {}
): number {
  const result = safeEvalNumber(expr, scope);
  return result.value ?? NaN;
}

/**
 * Convenience: compare two numeric expressions for equivalence within tolerance.
 */
export function safeEquivalent(
  userExpr: string,
  correctExpr: string,
  tolerance: number = 1e-6
): boolean {
  const userResult = safeEvalNumber(userExpr);
  const correctResult = safeEvalNumber(correctExpr);

  if (userResult.error || correctResult.error) return false;
  if (userResult.value === undefined || correctResult.value === undefined)
    return false;

  // Both NaN → equivalent (e.g., undefined expressions)
  if (isNaN(userResult.value) && isNaN(correctResult.value)) return true;
  // One NaN, other not → not equivalent
  if (isNaN(userResult.value) || isNaN(correctResult.value)) return false;

  return Math.abs(userResult.value - correctResult.value) < tolerance;
}
