import { createConnection, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { tsService, updateVirtualFile } from "./tsService";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: { resolveProvider: false },
    hoverProvider: true,
  },
}));

documents.onDidOpen((e) => {
  const diagnostics = updateVirtualFile(e.document);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics });
});

documents.onDidChangeContent((change) => {
  const diagnostics = updateVirtualFile(change.document);
  connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  const completions = tsService.getCompletionsTemplateAtPosition(document, params.position, {})?.entries ?? [];
  console.log(`Completions for ${params.textDocument.uri}:`, completions.length);
  return completions.map((entry) => ({
    label: entry.name,
    kind: 6, // Variable
  }));
  return [];
});

connection.onHover((params) => {
  return null;
});

documents.listen(connection);
connection.listen();
