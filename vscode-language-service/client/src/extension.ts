import * as path from "path";
import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";
import { formatTemplate } from './formatTemplate';

const isDebug = process.execArgv.some((arg) => arg.includes("--inspect"));
const LANGUAGE_ID = "tsx-template";

async function workspaceHasActivationFlag(): Promise<boolean> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return false;

  for (const folder of folders) {
    const tsconfigUri = vscode.Uri.joinPath(folder.uri, "tsconfig.json");
    try {
      const bytes = await vscode.workspace.fs.readFile(tsconfigUri);
      const content = Buffer.from(bytes).toString("utf8");
      const re = /["']?\btypecomposer\b["']?\s*:\s*true\s*,?/i;
      return re.test(content);
    } catch (_) {
    }
  }
  return false;
}

function registerTemplateFormatter(context: vscode.ExtensionContext) {
  const provider: vscode.DocumentFormattingEditProvider = {
    async provideDocumentFormattingEdits(document) {
      return [
        vscode.TextEdit.replace(
          new vscode.Range(0, 0, document.lineCount, 0),
          await formatTemplate(document.getText())
        )
      ];
    }
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      "tsx-template",
      provider
    )
  );
}

function setDefaultFormatter(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration();
  const globalDefault = config.get("editor.defaultFormatter");
  console.log("Global default formatter:", config.get(`[${LANGUAGE_ID}]`));
  // @ts-ignore
  const templateDefault = config.get(`[${LANGUAGE_ID}]`)?.["editor.defaultFormatter"];
  if (!templateDefault) {
    registerTemplateFormatter(context);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const enabled = await workspaceHasActivationFlag();
  if (!enabled) {
    console.log('TypeComposer: activation flag not found in any tsconfig.json — extension disabled.');
    return;
  }
  const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));
  const outputChannel = vscode.window.createOutputChannel("Typecomposer Language Server");
  if (isDebug) outputChannel.show(true);

  setDefaultFormatter(context);
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

export function deactivate() { }
