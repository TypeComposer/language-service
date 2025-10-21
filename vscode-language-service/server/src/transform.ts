import * as t from "@babel/types";
import * as recast from "recast";
import * as babelParser from "recast/parsers/babel-ts";
import { IRange, VirtualFile } from "./utils";
import * as fs from "fs";
import path = require("path");

export function mapTemplateToTS(source: string): string {
  //   // Exemplo simples: converte {{ var }} → let var: any;
  //   const matches = [...source.matchAll(/\{\{\s*(\w+)\s*\}\}/g)];
  //   const declarations = matches.map(([, name]) => `let ${name}: any;`).join("\n");

  //   return `
  // ${declarations}
  // // --- Template content (ignored by TS) ---
  // /*
  // ${source.replace(/\*\//g, "* /")}
  // */
  // `;
  return source;
}

export namespace Transforme {
  export const EXTENSION_VIRTUAL = "tc.template.virtual.tsx";

  // Analisa todos os arquivos .tsx e .ts de uma pasta
  // Se já existir o método template() na classe alvo, substitui o conteúdo
  // Se não existir, cria o método template()

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
    console.log("before:", before.length);
    fs.writeFileSync(`/Users/Ezequiel/Documents/TypeComposer/docs/src/components/sidebar/test.text`, before, "utf8");
    return new IRange(before.length, before.length + code.length, 0, "");
  }

  export function splitImportsAndCode(code: string): { imports: string; codeWithoutImports: string; importRange: IRange } {
    try {
      const offset = code.indexOf("<");
      const imports = code.slice(0, offset);
      const codeWithoutImports = code.slice(offset);
      // const importLines = imports.split("\n");
      const importRange = imports.length ? new IRange(0, imports.length, 0, "") : IRange.invalid();

      return { imports, codeWithoutImports, importRange };
    } catch (err) {
      console.error("Erro ao separar imports e código:", err);
      return { imports: "", codeWithoutImports: code, importRange: IRange.invalid() };
    }
  }

  function analisarCode(virtualFile: VirtualFile, code: string): boolean {
    const { codeWithoutImports, imports, importRange } = splitImportsAndCode(virtualFile.content);
    // ✅ Parse com Recast + babel-ts (preserva comentários e formato)
    const ast = recast.parse(code, { parser: babelParser });

    let modified = false;

    // ✅ Caminha pelo AST usando Recast Visitor API
    recast.types.visit(ast, {
      visitClassDeclaration(path) {
        const node = path.node;
        if (node.id?.name === virtualFile.className) {
          // @ts-ignore
          let templateMethod = node.body.body.find((m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === "template") as t.ClassMethod | undefined;

          if (templateMethod) {
            // já existe → sobrescreve o corpo
            templateMethod.body = t.blockStatement([buildTemplateReturn()]);
          } else {
            // não existe → cria
            templateMethod = t.classMethod("method", t.identifier("template"), [], t.blockStatement([buildTemplateReturn()]));
            // @ts-ignore
            node.body.body.push(templateMethod);
          }

          modified = true;
          return false; // para a visita
        }
        this.traverse(path);
      },
    });

    if (!modified) return false;

    const virualContent = `${imports}${recast.print(ast).code}`;

    const bodyRange = getContentStartPosition(virualContent, virtualFile.content);

    if (virualContent) {
      const newContent = virualContent.replace(
        "return (<>/*__TC_START__*//*__TC_END__*/</>);",
        `return (<>
${codeWithoutImports}
   </>);`
      );
      bodyRange.startLine = bodyRange.getLineOffset(bodyRange.start, newContent).line;
      bodyRange.line = imports.split("\n").length - 1;
      virtualFile.tsContent = code;
      virtualFile.virualContent = newContent;
      virtualFile.bodyRange = bodyRange;
      virtualFile.importRange = importRange;
    }
    return true;
  }

  export function analisar(virtualFile: VirtualFile, templateSource: string): boolean {
    try {
      const files = fs.readdirSync(virtualFile.folder);
      for (const file of files) {
        if (!file.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`) && (file.endsWith(".tsx") || file.endsWith(".ts"))) {
          const filePath = path.join(virtualFile.folder, file);
          const code = fs.readFileSync(filePath, "utf-8");

          virtualFile.isValid = analisarCode(virtualFile, code);
          if (virtualFile.isValid) {
            return true;
          }
        }
      }
    } catch (err) {
      console.error("Erro ao ler a pasta:", err);
    }
    return false;
  }
}
