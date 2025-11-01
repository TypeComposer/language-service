import * as path from "path";
import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

export function activate(context: vscode.ExtensionContext) {
  const LANGUAGE_ID = "tsx-template";
  const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));
  const outputChannel = vscode.window.createOutputChannel("My Language Server");
  outputChannel.show(true);

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: LANGUAGE_ID }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.template"),
    },
    outputChannel: outputChannel,
  };

  const client = new LanguageClient("TypeComposerTemplate", "TypeComposer Template Language Server", serverOptions, clientOptions);
  context.subscriptions.push(client);

  let isReady = false;
  const startPromise = client.start();
  startPromise.then(() => {
    isReady = true;
    registerWithTypeScript(LANGUAGE_ID, context.asAbsolutePath(path.join("language", "language-configuration.json")), context);
    const active = vscode.window.activeTextEditor;
    if (active && active.document.languageId === LANGUAGE_ID) {
      client.sendNotification("typecomposer/documentFocus", { uri: active.document.uri.toString() });
    }
  });

  const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!isReady) return;
    if (!editor || editor.document.languageId !== LANGUAGE_ID) return;
    client.sendNotification("typecomposer/documentFocus", { uri: editor.document.uri.toString() });
  });
  context.subscriptions.push(disposable);
}

async function registerWithTypeScript(languageId: string, configurationPath: string, context: vscode.ExtensionContext) {
  try {
    const tsExtension = vscode.extensions.getExtension("vscode.typescript-language-features");
    if (!tsExtension) return;

    const api = (tsExtension.isActive ? tsExtension.exports : await tsExtension.activate()) as any;
    const tsApi = api?.getAPI?.(0);
    if (!tsApi?.registerLanguage) return;

    const disposable = tsApi.registerLanguage({
      id: languageId,
      modeIds: [languageId],
      configuration: configurationPath,
    });

    if (disposable) {
      context.subscriptions.push(disposable);
    }
  } catch (err) {
    console.error("Failed to register TypeComposer language with TypeScript extension", err);
  }
}

export function deactivate() {}
