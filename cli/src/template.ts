export class TemplateError extends Error {
  constructor(
    public field: string,
    public reason: "undefined-capture" | "syntax",
    message: string,
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

const TEMPLATE_RE = /\$(\$|\{([A-Za-z_$][A-Za-z0-9_$]*)\}|\{)/g;

export function renderTemplate(
  field: string,
  template: string,
  captures: Record<string, string>,
): string {
  let out = "";
  let last = 0;
  TEMPLATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null = TEMPLATE_RE.exec(template);
  while (m !== null) {
    out += template.slice(last, m.index);
    if (m[1] === "$") {
      out += "$";
    } else if (m[1] === "{") {
      throw new TemplateError(
        field,
        "syntax",
        `模板 "${template}" 含未闭合或非法的 \${...}(在偏移 ${m.index})`,
      );
    } else {
      const name = m[2]!;
      if (!Object.prototype.hasOwnProperty.call(captures, name)) {
        throw new TemplateError(
          field,
          "undefined-capture",
          `模板 "${template}" 引用了未定义的捕获组 "${name}"`,
        );
      }
      out += captures[name];
    }
    last = m.index + m[0].length;
    m = TEMPLATE_RE.exec(template);
  }
  out += template.slice(last);
  if (out.includes("${")) {
    throw new TemplateError(
      field,
      "syntax",
      `模板 "${template}" 含未闭合的 \${...}`,
    );
  }
  return out;
}
