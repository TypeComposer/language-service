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
  client.start();
}

export function deactivate() {}
