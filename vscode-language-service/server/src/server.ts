import { CodeAction, CodeActionKind, CompletionItem, CompletionItemKind, createConnection, FileChangeType, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TsLanguageServiceHost } from "./tsService";
import { TAGS_HTML } from "./utils";

const connection = createConnection(ProposedFeatures.all);
export const documents = new TextDocuments(TextDocument);
export const isDebug = process.execArgv.some((arg) => arg.includes("--inspect"));
let tsService!: TsLanguageServiceHost;

connection.onInitialize((params) => {
  console.log(isDebug ? "Language Server running in DEBUG mode" : "Language Server running in NORMAL mode");
  const workspaceFolder = params.workspaceFolders?.[0];
  const workspacePath: string = workspaceFolder ? new URL(workspaceFolder.uri).pathname : new URL(params?.rootUri || "").pathname;
  tsService = new TsLanguageServiceHost(workspacePath);
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false, triggerCharacters: [".", "<", "/", " ", '"'] },
      definitionProvider: true,
      hoverProvider: true,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix, CodeActionKind.Refactor],
      },
    },
  };
});

documents.onDidOpen((e) => {
  const diagnostics = tsService.updateVirtualFile(e.document);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics });
});

documents.onDidChangeContent((change) => {
  const diagnostics = tsService.updateVirtualFile(change.document);
  connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

connection.onNotification("typecomposer/documentFocus", (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) return;
  const diagnostics = tsService.updateVirtualFile(document);
  connection.sendDiagnostics({ uri: params.uri, diagnostics });
});

connection.onDidChangeWatchedFiles((params) => {
  for (const change of params.changes) {
    if (!change.uri.endsWith(".template")) continue;
    if (change.type === FileChangeType.Deleted) {
      tsService.deleteVirtualFile(change.uri);
      connection.sendDiagnostics({ uri: change.uri, diagnostics: [] });
    }
  }
});

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return tsService.getCompletionsTemplateAtPosition(document, params.position, {});
});

// @ts-ignore
connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const hoverInfo = tsService.getHoverTemplateAtPosition(document, params.position);
  return hoverInfo;
});

connection.onCodeAction((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  const diagnosticCodes = params.context.diagnostics.map((d) => d.code as number);
  return tsService.getCodeFixesTemplateAtPosition(document, params.range, diagnosticCodes);
});

// // Quick Fixes, Definitions, References, etc. can be added here similarly
connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const definitionInfo = tsService.getDefinitionTemplateAtPosition(document, params.position);
  return definitionInfo;
});

documents.listen(connection);
connection.listen();
