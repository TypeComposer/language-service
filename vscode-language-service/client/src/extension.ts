import * as path from "path";
import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

export function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "tsx-template" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.template"),
    },
  };

  const client = new LanguageClient("TypeComposerTemplate", "TypeComposer Template Language Server", serverOptions, clientOptions);
  context.subscriptions.push(client);

  let isReady = false;
  const startPromise = client.start();
  startPromise.then(() => {
    isReady = true;
    const active = vscode.window.activeTextEditor;
    if (active && active.document.languageId === "tsx-template") {
      client.sendNotification("typecomposer/documentFocus", { uri: active.document.uri.toString() });
    }
  });

  const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!isReady) return;
    if (!editor || editor.document.languageId !== "tsx-template") return;
    client.sendNotification("typecomposer/documentFocus", { uri: editor.document.uri.toString() });
  });
  context.subscriptions.push(disposable);
}

export function deactivate() {}
