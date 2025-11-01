import * as t from "@babel/types";
import * as recast from "recast";
import * as babelParser from "recast/parsers/babel-ts";
import { IRange, VirtualFile } from "./utils";
import * as fs from "fs";
import path = require("path");
import { isDebug } from "./server";

interface ImportInfo {
  module: string;
  text: string;
  start: number;
  end: number;
  newText: string;
  startInsert: number;
  imports: string[];
}

export interface TemplateImport {
  module: string;
  import: string;
}
export namespace Transforme {
  export const EXTENSION_VIRTUAL = "tc.template.virtual.tsx";

  function buildTemplateReturn() {
    return t.returnStatement(t.parenthesizedExpression(t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [t.jsxText("/*__TC_START__*/"), t.jsxText("/*__TC_END__*/")])));
  }

  /**
   * Retorna a posição inicial dentro do arquivo virtual
   * onde o conteúdo original do .template foi injetado.
   */
  function getContentStartPosition(virtualText: string, code: string): IRange {
    const marker = "return (<>/*__TC_START__*//*__TC_END__*/</>);";
    const idx = virtualText.indexOf(marker);
    if (idx < 0) return IRange.invalid();

    // const startOffset = idx + marker.length + 1; // +1 por causa do \n logo após o marcador
    const before = virtualText.slice(0, idx + marker.length + 1 - "/*__TC_START__*//*__TC_END__*/</>);".length);
    return new IRange(0, 0, before.length, before.length + code.length);
  }

  export function splitImportsAndCode(code: string): { imports: string; codeWithoutImports: string; importRange: IRange } {
    try {
      const offset = code.indexOf("<");
      const imports = code.slice(0, offset);
      const codeWithoutImports = code.slice(offset);
      // const importLines = imports.split("\n");
      const importRange = imports.length ? new IRange(0, imports.length, 0, imports.length) : IRange.invalid();

      return { imports, codeWithoutImports, importRange };
    } catch (err) {
      console.error("Error separating imports and code:", err);
      return { imports: "", codeWithoutImports: code, importRange: IRange.invalid() };
    }
  }

  /**
   * Retorna true se o trecho (após imports) contém apenas JSX/TSX
   * ou statements vazios. Retorna false se encontrar declarações
   * de variáveis, funções, classes ou outros nodes que não sejam
   * JSXExpression/JSXElement/JSXFragment/EmptyStatement.
   */
  function isJsxOnly(code: string): boolean {
    if (code.trim() === "") return true;

    const importRegex = /^import\s.+?;$/gm;
    code = code.replace(importRegex, "").trim();
    if (code && (!code.startsWith("<") || !code.endsWith(">"))) return false;
    return true;
  }

  function analisarCode(virtualFile: VirtualFile, code: string): boolean {
    virtualFile.isJsxOnly = isJsxOnly(virtualFile.content);
    const { codeWithoutImports, imports, importRange } = splitImportsAndCode(virtualFile.content);
    const ast = recast.parse(code, { parser: babelParser });

    let modified = false;
    try {
      const modifiedTime = fs.statSync(virtualFile.tsUrl).mtimeMs;
      virtualFile.tsModified = modifiedTime;
    } catch (err) {
      virtualFile.tsModified = 0;
    }

    recast.types.visit(ast, {
      visitClassDeclaration(path) {
        const node = path.node;
        if (node.id?.name === virtualFile.className) {
          // @ts-ignore
          let templateMethod = node.body.body.find((m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === "template") as t.ClassMethod | undefined;

          if (templateMethod) {
            templateMethod.body = t.blockStatement([buildTemplateReturn()]);
          } else {
            templateMethod = t.classMethod("method", t.identifier("template"), [], t.blockStatement([buildTemplateReturn()]));
            // @ts-ignore
            node.body.body.push(templateMethod);
          }

          modified = true;
          return false;
        }
        this.traverse(path);
      },
    });

    if (!modified) return false;

    const virtualContent = `${imports}${recast.print(ast).code}`;

    const bodyRange = getContentStartPosition(virtualContent, virtualFile.content);
    bodyRange.startTemplate = imports.length;
    bodyRange.endTemplate = imports.length + codeWithoutImports.length;

    if (virtualContent) {
      const newContent = virtualContent.replace(
        "return (<>/*__TC_START__*//*__TC_END__*/</>);",
        `return (<>
${codeWithoutImports}
   </>);`
      );
      virtualFile.tsContent = code;
      virtualFile.virtualContent = newContent;
      virtualFile.bodyRange = bodyRange;
      virtualFile.importRange = importRange;
    }
    return true;
  }

  function debugFile(virtualFile: VirtualFile) {
    if (!virtualFile.tsUrl) return;
    // console.log(`Debug: ${virtualFile.tsUrl}`, { virtualContent: virtualFile.virtualContent });
    fs.writeFileSync(`${virtualFile.tsUrl}.jsx`, virtualFile.virtualContent, "utf8");
  }

  export function analisar(virtualFile: VirtualFile): boolean {
    try {
      if (virtualFile.tsUrl && fs.existsSync(virtualFile.tsUrl)) {
        const modifiedTime = fs.statSync(virtualFile.tsUrl).mtimeMs;
        if (virtualFile.tsModified === modifiedTime) {
          return analisarCode(virtualFile, virtualFile.tsContent);
        }
        const code = fs.readFileSync(virtualFile.tsUrl, "utf-8");
        return analisarCode(virtualFile, code);
      } else virtualFile.tsUrl = "";
      const files = fs.readdirSync(virtualFile.folder);
      for (const file of files) {
        if (!file.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`) && (file.endsWith(".tsx") || file.endsWith(".ts"))) {
          const filePath = path.join(virtualFile.folder, file);
          const code = fs.readFileSync(filePath, "utf-8");

          const isValid = analisarCode(virtualFile, code);
          if (isValid) {
            virtualFile.tsUrl = filePath;
            if (isDebug) debugFile(virtualFile);
            return true;
          }
        }
      }
    } catch (err) {
      console.error("Error reading folder:", err);
    }
    return false;
  }

  function infoImports(code: string): ImportInfo[] {
    const regex = /import\s+(?:\{([^}]+)\}|\*\s+as\s+([^\s]+)|([^\s'"]+))?\s*(?:from\s+)?['"]([^'"]+)['"]\s*;?/g;

    const result: ImportInfo[] = [];

    for (const match of code.matchAll(regex)) {
      const [fullMatch, namedImports, namespaceImport, defaultImport, moduleName] = match;
      const index = match.index ?? 0;

      let imports: string[] = [];

      if (namedImports) {
        imports = namedImports
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (namespaceImport) {
        imports = [`* as ${namespaceImport}`];
      } else if (defaultImport) {
        imports = [defaultImport];
      }
      result.push({
        module: moduleName,
        text: fullMatch.trim(),
        startInsert: 0,
        imports,
        newText: "",
        start: index,
        end: index + fullMatch.trim().length,
      });
    }

    return result;
  }

  export function margeImportTemplate(
    template: TemplateImport,
    code: string
  ): {
    action: "added" | "merged";
    start: number;
    newText: string;
  } {
    const info: ImportInfo[] = infoImports(code);
    const index = info.findIndex((imp) => imp.imports.length > 0 && imp.module === template.module);
    let imp: ImportInfo | null = null;
    if (index !== -1) {
      const existing = info[index];
      existing.text = `import { ${[...new Set([...existing.imports, ...template.import.split(",")])].join(", ")} } from '${template.module}';`;
      existing.imports = [...new Set([...existing.imports, ...template.import.split(",")])];
      existing.newText = `, ${template.import}`;
      existing.startInsert = existing.start + existing.text.indexOf(existing.newText);
      imp = existing;
    } else {
      const text = `import { ${template.import} } from '${template.module}';\n`;
      const lastImport = info.length ? info[info.length - 1] : null;
      const start = lastImport ? lastImport.end + 1 : 0;
      imp = {
        module: template.module,
        text,
        startInsert: 0,
        start,
        newText: text,
        end: start + text.length,
        imports: template.import.split(",").map((s) => s.trim()),
      };
    }
    if (imp) {
      code = code.slice(0, imp.start) + imp.text + code.slice(imp.end);
    }
    return {
      action: index === -1 ? "added" : "merged",
      start: imp.startInsert,
      newText: imp.newText,
    };
  }
}
