import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	CompletionItem,
	CompletionItemKind,
	Hover,
	Diagnostic,
	DiagnosticSeverity,
	TextDocumentSyncKind,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Inicialização
connection.onInitialize((_params: InitializeParams) => {
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: {
				resolveProvider: true,
			},
			hoverProvider: true,
		},
	};
});

// Autocompletion
connection.onCompletion((_textDocumentPosition) => {
	return [
		{
			label: 'div',
			kind: CompletionItemKind.Keyword,
			detail: 'Tag <div>',
		},
		{
			label: 'button',
			kind: CompletionItemKind.Keyword,
			detail: 'Tag <button>',
		},
	] as CompletionItem[];
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	item.insertText = `<${item.label}></${item.label}>`;
	return item;
});

// Hover
connection.onHover((_params): Hover | null => {
	return {
		contents: {
			kind: 'markdown',
			value: '**Exemplo:** informação adicional no hover.',
		},
	};
});

// Diagnostics simples: avisa se encontrar a palavra "tesas"
documents.onDidChangeContent((change) => {
	const diagnostics: Diagnostic[] = [];
	const text = change.document.getText();

	const pattern = /\btesas\b/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text))) {
		diagnostics.push({
			severity: DiagnosticSeverity.Warning,
			range: {
				start: change.document.positionAt(match.index),
				end: change.document.positionAt(match.index + match[0].length),
			},
			message: `Você quis dizer "testes"?`,
			source: 'tsx-template-lsp',
		});
	}

	connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

documents.listen(connection);
connection.listen();
