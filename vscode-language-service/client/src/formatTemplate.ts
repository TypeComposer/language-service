import * as parser from "@babel/parser";
import * as recast from "recast";
import * as vscode from "vscode";


export function applyEdits(
	originalText: string,
	edits: vscode.TextEdit[],
	referenceDoc: vscode.TextDocument
): string {
	// VS Code devolve os edits ordenados
	let text = originalText;

	// Aplicar de trás para frente para não quebrar os offsets
	const sorted = edits.sort(
		(a, b) =>
			referenceDoc.offsetAt(b.range.start) -
			referenceDoc.offsetAt(a.range.start)
	);

	for (const edit of sorted) {
		const start = referenceDoc.offsetAt(edit.range.start);
		const end = referenceDoc.offsetAt(edit.range.end);
		text = text.slice(0, start) + edit.newText + text.slice(end);
	}

	return text;
}

export async function formatTemplate(text: string): Promise<string> {
	const tempDoc = await vscode.workspace.openTextDocument({
		content: text,
		language: "typescriptreact"
	});
	const edits = (await vscode.commands.executeCommand(
		"vscode.executeFormatDocumentProvider",
		tempDoc.uri
	)) as vscode.TextEdit[];
	console.log("Received edits:", edits);
	if (!edits || edits.length === 0) {
		return text; // Se não houver edições, retorna o texto original
	}

	const formatted = applyEdits(text, edits, tempDoc);
	console.log("Formatted template:", formatted);
	return formatted;
}
