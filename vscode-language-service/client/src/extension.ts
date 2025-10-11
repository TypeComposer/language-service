import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { Transforme } from "./transforme";

const virtualFiles = new Map<string, { url: vscode.Uri; startPosition: vscode.Position }>();

const diagnostics = vscode.languages.createDiagnosticCollection("tsx-template");

function getVirtualContent(content: string): string {
  return `import { Component } from 'typecomposer';

export default class Virtual extends Component {
  test = "Hello World";

  onClick = () => {
    console.log(this.test);
  };

  template() {
    return (
/*__TC_START__*/
${content}
/*__TC_END__*/
    );
  }
}`;
}

/**
 * Retorna a posição inicial dentro do arquivo virtual
 * onde o conteúdo original do .template foi injetado.
 */
function getContentStartPosition(virtualText: string): vscode.Position {
  const marker = "/*__TC_START__*/";
  const idx = virtualText.indexOf(marker);
  if (idx < 0) return new vscode.Position(0, 0);

  // posição logo APÓS o marcador (na mesma linha ou na próxima, conforme você gerou)
  const startOffset = idx + marker.length + 1; // +1 por causa do \n logo após o marcador
  const before = virtualText.slice(0, startOffset);
  const lines = before.split("\n");
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;
  return new vscode.Position(line, character);
}

/**
 * Converte uma posição do .template (real) para o .virtual.tsx
 */
function mapToVirtualPosition(templatePos: vscode.Position, start: vscode.Position): vscode.Position {
  return new vscode.Position(start.line + templatePos.line, (templatePos.line === 0 ? start.character : 0) + templatePos.character);
}

/**
 * Converte uma posição do .virtual.tsx para o .template
 */
function mapToTemplatePosition(virtualPos: vscode.Position, start: vscode.Position): vscode.Position {
  return new vscode.Position(virtualPos.line - start.line, virtualPos.line === start.line ? virtualPos.character - start.character : virtualPos.character);
}

/**
 * Converte uma posição do .virtual.tsx para o .template
 */
function mapToTemplateRange(range: vscode.Range, start: vscode.Position): vscode.Range {
  return new vscode.Range(mapToTemplatePosition(range.start, start), mapToTemplatePosition(range.end, start));
}

function makeVirtualUri(document: vscode.TextDocument): vscode.Uri {
  const folder = path.dirname(document.uri.fsPath);
  const baseName = path.basename(document.uri.fsPath, ".template");
  return vscode.Uri.file(path.join(folder, `${baseName}.${Transforme.EXTENSION_VIRTUAL}`));
}

async function syncVirtualFile(document: vscode.TextDocument) {
  if (document.languageId !== "tsx-template") return;
  const folder = path.dirname(document.uri.fsPath);
  const baseName = path.basename(document.uri.fsPath, ".template");
  console.log("Syncing virtual file for", folder, " class:", baseName);
  const virtualUri = makeVirtualUri(document);
  const content = Transforme.getVirtualContent(folder, baseName, document.getText());
  //   const content = getVirtualContent(document.getText());

  try {
    await fs.writeFile(virtualUri.fsPath, content, "utf8");
    virtualFiles.set(document.uri.fsPath, {
      url: virtualUri,
      startPosition: getContentStartPosition(content),
    });
    console.log("VirtualFile:", virtualFiles.get(document.uri.fsPath));
  } catch (err) {
    console.error("Erro ao salvar arquivo virtual:", err);
  }
}

// Esconde os arquivos .virtual.tsx na árvore de arquivos
async function hideVirtualFiles() {
  const config = vscode.workspace.getConfiguration();
  const excludes = config.get<Record<string, boolean>>("files.exclude") || {};
  excludes[`**/*.${Transforme.EXTENSION_VIRTUAL}`] = false;
  await config.update("files.exclude", excludes, vscode.ConfigurationTarget.Workspace);
}

export async function activate(context: vscode.ExtensionContext) {
  await hideVirtualFiles();

  context.subscriptions.push(diagnostics);

  // Cria arquivos virtuais para docs já abertos
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === "tsx-template") {
      await syncVirtualFile(doc);
    }
  }

  // Cria/atualiza virtuais ao abrir/mudar .template
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(syncVirtualFile));

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (e) => {
      await syncVirtualFile(e.document);
    })
  );

  // Remove o .virtual.tsx quando o .template fecha
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(async (doc) => {
      if (doc.languageId === "tsx-template") {
        const virtualUri = virtualFiles.get(doc.uri.fsPath);
        if (virtualUri) {
          try {
            await fs.unlink(virtualUri.url.fsPath);
          } catch {
            // arquivo já removido
          }
          virtualFiles.delete(doc.uri.fsPath);
          diagnostics.delete(doc.uri);
        }
      }
    })
  );

  // Espelha diagnostics do virtual → template
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((event) => {
      for (const uri of event.uris) {
        if (uri.fsPath.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`)) {
          const entry = [...virtualFiles.entries()].find(([, virt]) => virt.url.fsPath === uri.fsPath);
          console.log("Diagnostics changed for virtual file:", uri, " entry:", entry);
          if (!entry) continue;

          const [realPath, virtualUri] = entry;
          const realUri = vscode.Uri.file(realPath);
          const diags = vscode.languages.getDiagnostics(virtualUri.url);

          const mapped = diags.map((d) => new vscode.Diagnostic(mapToTemplateRange(d.range, virtualUri.startPosition), d.message, d.severity));
          console.log("Mapped diagnostics for", diags, mapped);
          diagnostics.set(realUri, mapped);
        }
      }
    })
  );

  // Completion: delega ao TS no arquivo virtual
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: "tsx-template" },
      {
        async provideCompletionItems(document, position) {
          const virtualUri = virtualFiles.get(document.uri.fsPath);
          if (!virtualUri) return [];
          const doc = await vscode.workspace.openTextDocument(virtualUri.url);
          const completions = (await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, mapToVirtualPosition(position, virtualUri.startPosition))) ?? [];
          const fixedItems = completions.items.map((item) => {
            if (item.range) {
              if (item.range instanceof vscode.Range) {
                const start = mapToTemplatePosition(item.range.start, virtualUri.startPosition);
                const end = mapToTemplatePosition(item.range.end, virtualUri.startPosition);
                item.range = new vscode.Range(start, end);
              } else if ("inserting" in item.range) {
                // CompletionItemRange
                item.range = {
                  inserting: new vscode.Range(mapToTemplatePosition(item.range.inserting.start, virtualUri.startPosition), mapToTemplatePosition(item.range.inserting.end, virtualUri.startPosition)),
                  replacing: new vscode.Range(mapToTemplatePosition(item.range.replacing.start, virtualUri.startPosition), mapToTemplatePosition(item.range.replacing.end, virtualUri.startPosition)),
                };
              }
            }
            if (item.textEdit) {
              const edit = item.textEdit as vscode.TextEdit;
              item.textEdit = new vscode.TextEdit(
                new vscode.Range(mapToTemplatePosition(edit.range.start, virtualUri.startPosition), mapToTemplatePosition(edit.range.end, virtualUri.startPosition)),
                edit.newText
              );
            }

            // Corrige edições adicionais
            if (item.additionalTextEdits) {
              item.additionalTextEdits = item.additionalTextEdits.map((edit) => {
                return new vscode.TextEdit(
                  new vscode.Range(mapToTemplatePosition(edit.range.start, virtualUri.startPosition), mapToTemplatePosition(edit.range.end, virtualUri.startPosition)),
                  edit.newText
                );
              });
            }
            return item;
          });

          return new vscode.CompletionList(fixedItems, completions.isIncomplete);
        },
      }
    )
  );

  // Hover: delega ao TS no arquivo virtual
  // Hover: delega ao TS no arquivo virtual
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: "tsx-template" },
      {
        async provideHover(document, position) {
          const virtualUri = virtualFiles.get(document.uri.fsPath);
          if (!virtualUri) return null;

          const hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", virtualUri.url, mapToVirtualPosition(position, virtualUri.startPosition));

          if (!hovers || hovers.length === 0) {
            return null;
          }

          // Normaliza ranges
          for (const h of hovers) {
            if (h.range) {
              h.range = mapToTemplateRange(h.range, virtualUri.startPosition);
            }
          }

          // Junta todos os conteúdos em um só Hover
          const contents = hovers.flatMap((h) => (Array.isArray(h.contents) ? h.contents : [h.contents]));

          return new vscode.Hover(contents, hovers[0].range);
        },
      }
    )
  );

  // Definitions
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: "tsx-template" },
      {
        async provideDefinition(document, position) {
          const virt = virtualFiles.get(document.uri.fsPath);
          if (!virt) return [];
          const defs = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeDefinitionProvider", virt.url, mapToVirtualPosition(position, virt.startPosition));
          return defs?.map((def) => new vscode.Location(def.uri, mapToTemplateRange(def.range, virt.startPosition))) ?? [];
        },
      }
    )
  );

  // References
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(
      { language: "tsx-template" },
      {
        async provideReferences(document, position, contextRef) {
          const virt = virtualFiles.get(document.uri.fsPath);
          if (!virt) return [];
          const refs = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeReferenceProvider", virt.url, mapToVirtualPosition(position, virt.startPosition));
          return refs?.map((ref) => new vscode.Location(ref.uri, mapToTemplateRange(ref.range, virt.startPosition))) ?? [];
        },
      }
    )
  );
}
