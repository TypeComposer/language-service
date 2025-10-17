import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { Transforme } from "./transforme";
import { Action, diagnostics } from "./actions";
import { virtualFiles } from "./VirtualFileController";

//new Map<string, { url: vscode.Uri; startPosition: vscode.Position }>();

// async function syncVirtualFile(document: vscode.TextDocument) {}

// Esconde os arquivos .virtual.tsx na árvore de arquivos
async function hideVirtualFiles() {
  const config = vscode.workspace.getConfiguration();
  const excludes = config.get<Record<string, boolean>>("files.exclude") || {};
  excludes[`**/*.${Transforme.EXTENSION_VIRTUAL}`] = false;
  await config.update("files.exclude", excludes, vscode.ConfigurationTarget.Workspace);
}

export async function activate(context: vscode.ExtensionContext) {
  await hideVirtualFiles();

  const config = {
    onDidChangeDiagnostics: true,
    onDidChangeTextDocument: true,
    onDidCloseTextDocument: true,
    onDidOpenTextDocument: true,
    registerHoverProvider: false,
    registerDefinitionProvider: false,
    registerCompletionItemProvider: true,
    registerCodeActionsProvider: false,
    registerReferenceProvider: false,
  };

  context.subscriptions.push(diagnostics);

  // Cria arquivos virtuais para docs já abertos
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === "tsx-template") {
      await virtualFiles.syncFile(doc);
    }
  }

  // Cria/atualiza virtuais ao abrir/mudar .template
  if (config.onDidOpenTextDocument) context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(virtualFiles.syncFile.bind(virtualFiles)));

  if (config.onDidChangeTextDocument)
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(async (e) => {
        await virtualFiles.syncFile(e.document);
      })
    );

  // Remove o .virtual.tsx quando o .template fecha
  if (config.onDidCloseTextDocument)
    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument(async (doc) => {
        // for (const [realPath, virt] of virtualFiles.entries()) {
        //   try {
        //     await fs.unlink(virt.url.fsPath);
        //     console.log("Deleted virtual file:", virt.url.fsPath);
        //   } catch {}
        //   virtualFiles.delete(realPath);
        // }
      })
    );
  // // Loga mudança de foco (útil para debug)
  // vscode.window.onDidChangeActiveTextEditor((editor) => {
  //   console.log("Usuário clicou fora do editor (explorer, terminal, output, etc.)");
  //   if (lastDoc && (!editor || editor.document.uri.fsPath !== lastDoc.uri.fsPath)) {
  //     console.log("Documento perdeu o foco:", lastDoc.uri.fsPath);
  //   }

  //   if (editor) {
  //     console.log("Novo documento ativo:", editor.document.uri.fsPath);
  //     lastDoc = editor.document;
  //   } else {
  //     lastDoc = undefined;
  //   }
  //   console.log("Nenhum editor ativo (perdeu o foco)");
  // });

  // Espelha diagnostics do virtual → template
  if (config.onDidChangeDiagnostics) context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(Action.onDidChangeDiagnostics));

  // Completion: delega ao TS no arquivo virtual
  if (config.registerCompletionItemProvider)
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { language: "tsx-template" },
        {
          async provideCompletionItems(document, position, _token, _context) {
            return Action.registerCompletionItemProvider(document, position, _token, _context);
          },
        },
        "<",
        "/",
        " ",
        '"',
        "."
      )
    );

  // Hover: delega ao TS no arquivo virtual
  if (config.registerHoverProvider)
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        { language: "tsx-template" },
        {
          async provideHover(document, position) {
            return Action.registerHoverProvider(document, position, new vscode.CancellationTokenSource().token);
          },
        }
      )
    );

  // Definitions
  if (config.registerDefinitionProvider)
    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(
        { language: "tsx-template" },
        {
          async provideDefinition(document, position) {
            return Action.registerDefinitionProvider(document, position, new vscode.CancellationTokenSource().token);
          },
        }
      )
    );

  // Quick Fixes
  if (config.registerCodeActionsProvider)
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        { language: "tsx-template" },
        {
          async provideCodeActions(document, range, context, token) {
            return Action.registerCodeActionsProvider(document, range, context, token);
          },
        }
      )
    );

  // References
  if (config.registerReferenceProvider)
    context.subscriptions.push(
      vscode.languages.registerReferenceProvider(
        { language: "tsx-template" },
        {
          async provideReferences(document, position, context, _token) {
            return Action.registerReferenceProvider(document, position, context, _token);
          },
        }
      )
    );
}
