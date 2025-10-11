import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import * as recast from "recast";
import * as fs from "fs";
import * as path from "path";
import { parseExpression } from "@babel/parser";

export namespace Transforme {
  export const EXTENSION_VIRTUAL = "tc.template.virtual.tsx";
  // Analisa todos os arquivos .tsx e .ts de uma pasta
  // Se já existir o método template() na classe alvo, substitui o conteúdo
  // Se não existir, cria o método template()
  export function getVirtualContent(folderPath: string, className: string, content: string): string {
    try {
      const files = fs.readdirSync(folderPath);
      console.log("Procurando classe", className, "na pasta", folderPath, "arquivos:", files);
      for (const file of files) {
        if (!file.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`) && (file.endsWith(".tsx") || file.endsWith(".ts"))) {
          const filePath = path.join(folderPath, file);
          const code = fs.readFileSync(filePath, "utf-8");
          console.log("Lendo arquivo:", file, " tamanho:", code.length);

          const newCode = analisar(code, className, content);
          if (newCode) {
            return newCode;
          }
        }
      }
    } catch (err) {
      console.error("Erro ao ler a pasta:", err);
    }
    return content;
  }

  function buildTemplateReturn() {
    return t.returnStatement(t.parenthesizedExpression(t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [t.jsxText("/*__TC_START__*/"), t.jsxText("/*__TC_END__*/")])));
  }

  function analisar(code: string, className: string, content: string): string | null {
    console.log("Analisando código para classe:", className);
    // 1) Parse com Babel
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
    let modified = false;
    // 2) Caminha com Babel Traverse

    traverse(ast, {
      ClassDeclaration(path) {
        if (path.node.id?.name === className) {
          let templateMethod = path.node.body.body.find((m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === "template") as t.ClassMethod | undefined;

          if (templateMethod) {
            // já existe → sobrescreve o corpo
            templateMethod.body = t.blockStatement([buildTemplateReturn()]);
            console.log("Transforme: método template sobrescrito na classe", className);
          } else {
            // não existe → cria
            const method = t.classMethod("method", t.identifier("template"), [], t.blockStatement([buildTemplateReturn()]));
            path.node.body.body.push(method);
            console.log("Transforme: método template criado na classe", className);
          }

          modified = true;
          path.stop();
        }
      },
    });
    if (!modified) return null;
    const newCode = recast.print(ast).code;
    if (newCode) {
      return newCode.replace(
        "return (<>/*__TC_START__*//*__TC_END__*/</>);",
        `return (
/*__TC_START__*/
${content}
/*__TC_END__*/
    );`
      );
    }
    // 3) Imprime com Recast para preservar estilo do código
    return code;
  }
}
