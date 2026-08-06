/// LaTeX snippet catalog — 70+ snippets across 10 categories
/// Derived from the Swift prototype's Resources/latex_snippets.json

export interface LaTeXSnippet {
  id: string;
  title: string;
  aliases: string[];
  category: string;
  template: string;
  example: string;
  wrapMode: "none" | "wrapSelection";
}

export const LATEX_SNIPPETS: LaTeXSnippet[] = [
  // ─── Algebra ──────────────────────────────────
  { id: "fraction", title: "Fraction", aliases: ["frac", "division", "ratio", "over"], category: "Algebra", template: "\\frac{${1:numerator}}{${2:denominator}}", example: "\\frac{a+b}{c}", wrapMode: "none" },
  { id: "sqrt", title: "Square Root", aliases: ["sqrt", "root", "radical"], category: "Algebra", template: "\\sqrt{${1:expression}}", example: "\\sqrt{x^2 + y^2}", wrapMode: "wrapSelection" },
  { id: "nth_root", title: "N-th Root", aliases: ["cuberoot", "nthroot", "root n"], category: "Algebra", template: "\\sqrt[${1:n}]{${2:expression}}", example: "\\sqrt[3]{x}", wrapMode: "none" },
  { id: "power", title: "Power / Exponent", aliases: ["power", "exponent", "superscript", "squared", "cubed"], category: "Algebra", template: "{${1:base}}^{${2:exp}}", example: "x^{n}", wrapMode: "wrapSelection" },
  { id: "subscript", title: "Subscript", aliases: ["subscript", "index", "lower"], category: "Algebra", template: "{${1:base}}_{${2:index}}", example: "x_{i}", wrapMode: "wrapSelection" },
  { id: "paren", title: "Parentheses", aliases: ["parentheses", "brackets", "group", "parens"], category: "Algebra", template: "\\left( ${1:expression} \\right)", example: "\\left( x + y \\right)", wrapMode: "wrapSelection" },
  { id: "abs", title: "Absolute Value", aliases: ["abs", "absolute", "modulus", "magnitude"], category: "Algebra", template: "\\left| ${1:expression} \\right|", example: "\\left| x \\right|", wrapMode: "wrapSelection" },
  { id: "floor", title: "Floor", aliases: ["floor", "greatest integer"], category: "Algebra", template: "\\left\\lfloor ${1:x} \\right\\rfloor", example: "\\left\\lfloor x \\right\\rfloor", wrapMode: "wrapSelection" },
  { id: "ceil", title: "Ceiling", aliases: ["ceil", "ceiling", "least integer"], category: "Algebra", template: "\\left\\lceil ${1:x} \\right\\rceil", example: "\\left\\lceil x \\right\\rceil", wrapMode: "wrapSelection" },
  { id: "cases", title: "Piecewise / Cases", aliases: ["cases", "piecewise", "conditional", "brace"], category: "Algebra", template: "\\begin{cases} ${1:expr1} & \\text{if } ${2:cond1} \\\\ ${3:expr2} & \\text{if } ${4:cond2} \\end{cases}", example: "\\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}", wrapMode: "none" },
  { id: "align", title: "Aligned Equations", aliases: ["align", "aligned", "multiline", "equation align"], category: "Algebra", template: "\\begin{align*}\n    ${1:expr1} &= ${2:result1} \\\\\n    ${3:expr2} &= ${4:result2}\n\\end{align*}", example: "\\begin{align*}\n    x &= y + z \\\\\n    &= w\n\\end{align*}", wrapMode: "none" },

  // ─── Calculus ─────────────────────────────────
  { id: "sum", title: "Summation", aliases: ["sum", "sigma", "summation", "series"], category: "Calculus", template: "\\sum_{${1:i=0}}^{${2:n}} ${3:term}", example: "\\sum_{i=0}^{n} i^2", wrapMode: "none" },
  { id: "prod", title: "Product", aliases: ["prod", "product", "multiplication", "pi"], category: "Calculus", template: "\\prod_{${1:i=1}}^{${2:n}} ${3:term}", example: "\\prod_{i=1}^{n} i", wrapMode: "none" },
  { id: "integral", title: "Integral", aliases: ["integral", "int", "antiderivative"], category: "Calculus", template: "\\int_{${1:a}}^{${2:b}} ${3:f(x)} \\, d${4:x}", example: "\\int_{0}^{\\infty} e^{-x} \\, dx", wrapMode: "none" },
  { id: "double_integral", title: "Double Integral", aliases: ["double integral", "surface integral"], category: "Calculus", template: "\\iint_{${1:D}} ${2:f(x,y)} \\, dA", example: "\\iint_{D} f(x,y) \\, dA", wrapMode: "none" },
  { id: "limit", title: "Limit", aliases: ["limit", "lim", "approaches"], category: "Calculus", template: "\\lim_{${1:x} \\to ${2:\\infty}} ${3:f(x)}", example: "\\lim_{x \\to 0} \\frac{\\sin x}{x}", wrapMode: "none" },
  { id: "derivative", title: "Derivative", aliases: ["derivative", "diff", "dy/dx", "differentiation"], category: "Calculus", template: "\\frac{d}{d${1:x}} ${2:f(x)}", example: "\\frac{d}{dx} x^2", wrapMode: "none" },
  { id: "partial_derivative", title: "Partial Derivative", aliases: ["partial", "partial derivative", "nabla"], category: "Calculus", template: "\\frac{\\partial ${1:f}}{\\partial ${2:x}}", example: "\\frac{\\partial f}{\\partial x}", wrapMode: "none" },
  { id: "gradient", title: "Gradient", aliases: ["gradient", "grad", "del"], category: "Calculus", template: "\\nabla ${1:f}", example: "\\nabla f(x, y)", wrapMode: "wrapSelection" },

  // ─── Matrices ─────────────────────────────────
  { id: "matrix_2x2", title: "2×2 Matrix", aliases: ["matrix", "2x2", "mat2"], category: "Matrices", template: "\\begin{pmatrix} ${1:a} & ${2:b} \\\\ ${3:c} & ${4:d} \\end{pmatrix}", example: "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}", wrapMode: "none" },
  { id: "matrix_3x3", title: "3×3 Matrix", aliases: ["3x3", "mat3", "matrix 3"], category: "Matrices", template: "\\begin{pmatrix} ${1:a} & ${2:b} & ${3:c} \\\\ ${4:d} & ${5:e} & ${6:f} \\\\ ${7:g} & ${8:h} & ${9:i} \\end{pmatrix}", example: "\\begin{pmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 0 \\\\ 0 & 0 & 1 \\end{pmatrix}", wrapMode: "none" },
  { id: "determinant", title: "Determinant", aliases: ["determinant", "det", "matrix det"], category: "Matrices", template: "\\det\\left( ${1:A} \\right)", example: "\\det\\left( A \\right)", wrapMode: "wrapSelection" },

  // ─── Greek ────────────────────────────────────
  { id: "alpha", title: "Alpha (α)", aliases: ["alpha", "a greek"], category: "Greek", template: "\\alpha", example: "\\alpha", wrapMode: "none" },
  { id: "beta", title: "Beta (β)", aliases: ["beta", "b greek"], category: "Greek", template: "\\beta", example: "\\beta", wrapMode: "none" },
  { id: "gamma", title: "Gamma (γ)", aliases: ["gamma", "c greek", "γ"], category: "Greek", template: "\\gamma", example: "\\gamma", wrapMode: "none" },
  { id: "delta", title: "Delta (δ)", aliases: ["delta", "d greek", "δ", "Δ"], category: "Greek", template: "\\delta", example: "\\delta", wrapMode: "none" },
  { id: "epsilon", title: "Epsilon (ε)", aliases: ["epsilon", "e greek", "ε"], category: "Greek", template: "\\epsilon", example: "\\epsilon", wrapMode: "none" },
  { id: "theta", title: "Theta (θ)", aliases: ["theta", "angle", "θ"], category: "Greek", template: "\\theta", example: "\\theta", wrapMode: "none" },
  { id: "lambda", title: "Lambda (λ)", aliases: ["lambda", "λ", "eigenvalue"], category: "Greek", template: "\\lambda", example: "\\lambda", wrapMode: "none" },
  { id: "mu", title: "Mu (μ)", aliases: ["mu", "mean", "μ"], category: "Greek", template: "\\mu", example: "\\mu", wrapMode: "none" },
  { id: "pi", title: "Pi (π)", aliases: ["pi", "π", "3.14"], category: "Greek", template: "\\pi", example: "\\pi", wrapMode: "none" },
  { id: "sigma_lower", title: "Sigma (σ)", aliases: ["sigma", "σ", "standard deviation"], category: "Greek", template: "\\sigma", example: "\\sigma", wrapMode: "none" },
  { id: "phi", title: "Phi (φ)", aliases: ["phi", "φ", "golden ratio"], category: "Greek", template: "\\phi", example: "\\phi", wrapMode: "none" },
  { id: "omega", title: "Omega (ω)", aliases: ["omega", "ω", "ohm"], category: "Greek", template: "\\omega", example: "\\omega", wrapMode: "none" },

  // ─── Symbols ──────────────────────────────────
  { id: "infty", title: "Infinity (∞)", aliases: ["infinity", "inf", "∞"], category: "Symbols", template: "\\infty", example: "\\infty", wrapMode: "none" },
  { id: "partial_symbol", title: "Partial (∂)", aliases: ["partial", "∂", "curly d"], category: "Symbols", template: "\\partial", example: "\\partial", wrapMode: "none" },
  { id: "nabla_symbol", title: "Nabla (∇)", aliases: ["nabla", "∇", "del operator"], category: "Symbols", template: "\\nabla", example: "\\nabla", wrapMode: "none" },
  { id: "prime", title: "Prime (′)", aliases: ["prime", "'", "derivative notation"], category: "Symbols", template: "${1:f}'", example: "f'(x)", wrapMode: "none" },

  // ─── Logic ────────────────────────────────────
  { id: "forall", title: "For All (∀)", aliases: ["forall", "for all", "∀", "universal"], category: "Logic", template: "\\forall", example: "\\forall", wrapMode: "none" },
  { id: "exists", title: "Exists (∃)", aliases: ["exists", "there exists", "∃", "existential"], category: "Logic", template: "\\exists", example: "\\exists", wrapMode: "none" },
  { id: "implies", title: "Implies (⇒)", aliases: ["implies", "⇒", "therefore", "leads to"], category: "Logic", template: "\\Rightarrow", example: "P \\Rightarrow Q", wrapMode: "none" },
  { id: "iff", title: "IFF (⇔)", aliases: ["iff", "iff", "⇔", "equivalent", "if and only if"], category: "Logic", template: "\\Leftrightarrow", example: "P \\Leftrightarrow Q", wrapMode: "none" },
  { id: "not", title: "Not (¬)", aliases: ["not", "¬", "negation", "logical not"], category: "Logic", template: "\\neg", example: "\\neg P", wrapMode: "none" },

  // ─── Relations ────────────────────────────────
  { id: "leq", title: "≤ (Less/Equal)", aliases: ["leq", "le", "≤", "less equal", "at most"], category: "Relations", template: "\\leq", example: "x \\leq y", wrapMode: "none" },
  { id: "geq", title: "≥ (Greater/Equal)", aliases: ["geq", "ge", "≥", "greater equal", "at least"], category: "Relations", template: "\\geq", example: "x \\geq y", wrapMode: "none" },
  { id: "neq", title: "≠ (Not Equal)", aliases: ["neq", "ne", "≠", "not equal", "different"], category: "Relations", template: "\\neq", example: "x \\neq y", wrapMode: "none" },
  { id: "approx", title: "≈ (Approx)", aliases: ["approx", "≈", "approximately", "about"], category: "Relations", template: "\\approx", example: "x \\approx y", wrapMode: "none" },
  { id: "times", title: "× (Times)", aliases: ["times", "×", "cross product", "multiply"], category: "Relations", template: "\\times", example: "a \\times b", wrapMode: "none" },
  { id: "div_sign", title: "÷ (Division)", aliases: ["div", "÷", "divide", "division sign"], category: "Relations", template: "\\div", example: "a \\div b", wrapMode: "none" },
  { id: "pm", title: "± (Plus-Minus)", aliases: ["pm", "±", "plus minus", "plus or minus"], category: "Relations", template: "\\pm", example: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", wrapMode: "none" },

  // ─── Set Theory ───────────────────────────────
  { id: "in", title: "∈ (Element Of)", aliases: ["in", "∈", "element of", "belongs to", "member"], category: "Set Theory", template: "\\in", example: "x \\in A", wrapMode: "none" },
  { id: "subset", title: "⊂ (Subset)", aliases: ["subset", "⊂", "contained in"], category: "Set Theory", template: "\\subset", example: "A \\subset B", wrapMode: "none" },
  { id: "union", title: "∪ (Union)", aliases: ["union", "∪", "cup", "or set"], category: "Set Theory", template: "\\cup", example: "A \\cup B", wrapMode: "none" },
  { id: "intersection", title: "∩ (Intersection)", aliases: ["intersection", "∩", "cap", "and set"], category: "Set Theory", template: "\\cap", example: "A \\cap B", wrapMode: "none" },
  { id: "set_minus", title: "\\ (Set Difference)", aliases: ["setminus", "difference", "without"], category: "Set Theory", template: "\\setminus", example: "A \\setminus B", wrapMode: "none" },
  { id: "empty_set", title: "∅ (Empty Set)", aliases: ["empty", "∅", "empty set", "null set"], category: "Set Theory", template: "\\emptyset", example: "\\emptyset", wrapMode: "none" },

  // ─── Trigonometry ─────────────────────────────
  { id: "sin", title: "Sine", aliases: ["sin", "sine", "trig"], category: "Trigonometry", template: "\\sin(${1:x})", example: "\\sin(x)", wrapMode: "none" },
  { id: "cos", title: "Cosine", aliases: ["cos", "cosine", "trig"], category: "Trigonometry", template: "\\cos(${1:x})", example: "\\cos(x)", wrapMode: "none" },
  { id: "tan", title: "Tangent", aliases: ["tan", "tangent", "trig"], category: "Trigonometry", template: "\\tan(${1:x})", example: "\\tan(x)", wrapMode: "none" },

  // ─── Functions ────────────────────────────────
  { id: "log", title: "Logarithm", aliases: ["log", "logarithm", "log base"], category: "Functions", template: "\\log_{${1:b}}(${2:x})", example: "\\log_{10}(x)", wrapMode: "none" },
  { id: "ln", title: "Natural Log", aliases: ["ln", "natural log", "log e"], category: "Functions", template: "\\ln(${1:x})", example: "\\ln(x)", wrapMode: "none" },
  { id: "exp", title: "Exponential", aliases: ["exp", "exponential", "e to the"], category: "Functions", template: "e^{${1:x}}", example: "e^{x}", wrapMode: "wrapSelection" },
  { id: "min", title: "Minimum", aliases: ["min", "minimum", "least", "argmin"], category: "Functions", template: "\\min(${1:x})", example: "\\min(x, y)", wrapMode: "none" },
  { id: "max", title: "Maximum", aliases: ["max", "maximum", "greatest", "argmax"], category: "Functions", template: "\\max(${1:x})", example: "\\max(x, y)", wrapMode: "none" },

  // ─── Combinatorics ────────────────────────────
  { id: "binom", title: "Binomial", aliases: ["binom", "binomial", "choose", "nCr", "combination"], category: "Combinatorics", template: "\\binom{${1:n}}{${2:k}}", example: "\\binom{n}{k}", wrapMode: "none" },

  // ─── Decorations ──────────────────────────────
  { id: "overline", title: "Overline", aliases: ["overline", "bar", "conjugate", "complement", "vinculum"], category: "Decorations", template: "\\overline{${1:expression}}", example: "\\overline{z}", wrapMode: "wrapSelection" },
  { id: "hat", title: "Hat", aliases: ["hat", "estimate", "unit vector", "caret"], category: "Decorations", template: "\\hat{${1:x}}", example: "\\hat{x}", wrapMode: "wrapSelection" },
  { id: "vec", title: "Vector Arrow", aliases: ["vec", "vector", "arrow", "direction"], category: "Decorations", template: "\\vec{${1:v}}", example: "\\vec{v}", wrapMode: "wrapSelection" },
  { id: "dot", title: "Dot (derivative)", aliases: ["dot", "time derivative", "newton dot"], category: "Decorations", template: "\\dot{${1:x}}", example: "\\dot{x}", wrapMode: "wrapSelection" },
  { id: "tilde", title: "Tilde", aliases: ["tilde", "approx", "similar", "equivalence"], category: "Decorations", template: "\\tilde{${1:x}}", example: "\\tilde{x}", wrapMode: "wrapSelection" },

  // ─── Text ─────────────────────────────────────
  { id: "text", title: "Text In Math", aliases: ["text", "text in math", "mathrm", "words"], category: "Text", template: "\\text{${1:description}}", example: "\\text{for all } x > 0", wrapMode: "none" },
  { id: "mathrm", title: "Roman Text", aliases: ["mathrm", "roman", "upright", "operator name"], category: "Text", template: "\\mathrm{${1:text}}", example: "\\mathrm{d}x", wrapMode: "none" },
];

export const LATEX_CATEGORIES: string[] = [
  ...new Set(LATEX_SNIPPETS.map((s) => s.category)),
];

export function getSnippetsByCategory(category: string): LaTeXSnippet[] {
  return LATEX_SNIPPETS.filter((s) => s.category === category);
}

export function searchSnippets(query: string): LaTeXSnippet[] {
  const q = query.toLowerCase();
  return LATEX_SNIPPETS.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.aliases.some((a) => a.toLowerCase().includes(q)) ||
      s.category.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
  );
}

/** Fill in template placeholders like ${1:default} with the given text */
export function fillTemplate(template: string, selectedText?: string): string {
  // Replace first ${N:...} with selectedText if available
  let result = template;
  if (selectedText) {
    result = result.replace(/\$\{[\d]+:.*?\}/, selectedText);
  }
  // Remove remaining placeholders
  result = result.replace(/\$\{[\d]+:([^}]*)\}/g, "$1");
  return result;
}