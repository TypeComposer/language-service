import * as t from "@babel/types";
import * as recast from "recast";
import * as babelParser from "recast/parsers/babel-ts";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export namespace Transforme {
  export const EXTENSION_VIRTUAL = "tc.template.virtual.tsx";

  // Analisa todos os arquivos .tsx e .ts de uma pasta
  // Se já existir o método template() na classe alvo, substitui o conteúdo
  // Se não existir, cria o método template()
  export function getVirtualContent(folderPath: string, className: string, content: string): { content: string; startPosition: vscode.Position } {
    let startPosition = new vscode.Position(0, 0);
    try {
      const files = fs.readdirSync(folderPath);
      for (const file of files) {
        if (!file.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`) && (file.endsWith(".tsx") || file.endsWith(".ts"))) {
          const filePath = path.join(folderPath, file);
          const code = fs.readFileSync(filePath, "utf-8");

          const newCode = analisar(code, className, content);
          if (newCode) {
            return newCode;
          }
        }
      }
    } catch (err) {
      console.error("Erro ao ler a pasta:", err);
    }
    return { content, startPosition };
  }

  function buildTemplateReturn() {
    return t.returnStatement(t.parenthesizedExpression(t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [t.jsxText("/*__TC_START__*/"), t.jsxText("/*__TC_END__*/")])));
  }

  /**
   * Retorna a posição inicial dentro do arquivo virtual
   * onde o conteúdo original do .template foi injetado.
   */
  function getContentStartPosition(virtualText: string, offset: number): vscode.Position {
    const marker = "return (<>/*__TC_START__*//*__TC_END__*/</>);";
    const idx = virtualText.indexOf(marker);
    if (idx < 0) return new vscode.Position(0, 0);

    const startOffset = idx + marker.length + 1; // +1 por causa do \n logo após o marcador
    const before = virtualText.slice(0, startOffset);
    const lines = before.split("\n");
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;
    return new vscode.Position(line + offset, character);
  }

  export function splitImportsAndCode(code: string): { imports: string; codeWithoutImports: string; offset: number } {
    try {
      const lines = code.split("\n");
      let offset = code.indexOf("<");
      const imports = code.slice(0, offset);
      const offsetLine = imports.split("\n").length - 1;
      const codeWithoutImports = code.slice(offset);
      return { imports, codeWithoutImports, offset: offsetLine };
    } catch (err) {
      console.error("Erro ao separar imports e código:", err);
      return { imports: "", codeWithoutImports: code, offset: 0 };
    }
  }

  function analisar(code: string, className: string, content: string): { content: string; startPosition: vscode.Position } | null {
    const { codeWithoutImports, imports, offset } = splitImportsAndCode(content);

    // ✅ Parse com Recast + babel-ts (preserva comentários e formato)
    const ast = recast.parse(code, { parser: babelParser });

    let modified = false;
    let startPosition = new vscode.Position(0, 0);

    // ✅ Caminha pelo AST usando Recast Visitor API
    recast.types.visit(ast, {
      visitClassDeclaration(path) {
        const node = path.node;
        if (node.id?.name === className) {
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

    if (!modified) return null;

    const newCode = `${imports.trim()}${recast.print(ast).code}`;

    startPosition = getContentStartPosition(newCode, offset);

    if (newCode) {
      const newContent = newCode.replace(
        "return (<>/*__TC_START__*//*__TC_END__*/</>);",
        `return (
${codeWithoutImports}
    );`
      );
      return { content: newContent, startPosition };
    }

    return { content: code, startPosition: new vscode.Position(0, 0) };
  }
}
