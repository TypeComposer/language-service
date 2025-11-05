import {  CodeActionKind, createConnection, FileChangeType, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TsLanguageServiceHost } from "./tsService";
import { fileURLToPath } from "url";

const connection = createConnection(ProposedFeatures.all);
export const documents = new TextDocuments(TextDocument);
export const isDebug = process.execArgv.some((arg) => arg.includes("--inspect"));
let tsService!: TsLanguageServiceHost;
let serverEnabled = false;

connection.onInitialize((params) => {
  connection.console.log(isDebug ? "Language Server running in DEBUG mode" : "Language Server running");
  const workspaceFolder = params.workspaceFolders?.[0];
  const workspacePath = workspaceFolder ? fileURLToPath(workspaceFolder.uri) : params.rootUri ? fileURLToPath(params.rootUri) : process.cwd();
  connection.console.log(`Workspace path resolved to: ${workspacePath}`);
  try {
    tsService = new TsLanguageServiceHost(workspacePath);
    serverEnabled = true;
  } catch (err) {
    serverEnabled = false;
  connection.console.error(`Failed to initialize TypeComposer TS host: ${err instanceof Error ? err.message : String(err)}`);
    // keep server alive but disabled — return minimal capabilities so client doesn't repeatedly crash
  }
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
  if (!serverEnabled) {
    connection.console.warn("TypeComposer server is disabled; skipping onDidOpen processing.");
    return;
  }
  try {
    const diagnostics = tsService.updateVirtualFile(e.document);
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics });
    } catch (err) {
    connection.console.error(`Error handling onDidOpen: ${err instanceof Error ? err.message : String(err)}`);
  }
});

documents.onDidChangeContent((change) => {
  if (!serverEnabled) return;
  try {
    const diagnostics = tsService.updateVirtualFile(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
  } catch (err) {
    connection.console.error(`Error handling onDidChangeContent: ${err instanceof Error ? err.message : String(err)}`);
  }
});

connection.onNotification("typecomposer/documentFocus", (params: { uri: string }) => {
  if (!serverEnabled) return;
  try {
    const document = documents.get(params.uri);
    if (!document) return;
    const diagnostics = tsService.updateVirtualFile(document);
    connection.sendDiagnostics({ uri: params.uri, diagnostics });
  } catch (err) {
    connection.console.error(`Error handling documentFocus: ${err instanceof Error ? err.message : String(err)}`);
  }
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
  if (!serverEnabled) return [];
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  try {
    return tsService.getCompletionsTemplateAtPosition(document, params.position, {});
  } catch (err) {
    connection.console.error(`Error onCompletion: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
});

// @ts-ignore
connection.onHover((params) => {
  if (!serverEnabled) return null;
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  try {
    const hoverInfo = tsService.getHoverTemplateAtPosition(document, params.position);
    return hoverInfo;
  } catch (err) {
    connection.console.error(`Error onHover: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
});

connection.onCodeAction((params) => {
  if (!serverEnabled) return [];
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  try {
    const diagnosticCodes = params.context.diagnostics.map((d) => d.code as number);
    return tsService.getCodeFixesTemplateAtPosition(document, params.range, diagnosticCodes);
  } catch (err) {
    connection.console.error(`Error onCodeAction: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
});

// // Quick Fixes, Definitions, References, etc. can be added here similarly
connection.onDefinition((params) => {
  if (!serverEnabled) return null;
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  try {
    const definitionInfo = tsService.getDefinitionTemplateAtPosition(document, params.position);
    return definitionInfo;
  } catch (err) {
    connection.console.error(`Error onDefinition: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
});

documents.listen(connection);
connection.listen();
