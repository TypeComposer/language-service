import * as vscode from "vscode";
import { Transforme } from "./transforme";
import { virtualFiles } from "./VirtualFileController";
import { Utils } from "./utils";

export const diagnostics = vscode.languages.createDiagnosticCollection("tsx-template");

export namespace Action {
  //
  export function onDidChangeDiagnostics(event: vscode.DiagnosticChangeEvent) {
    for (const uri of event.uris) {
      if (uri.fsPath.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`)) {
        const entry = [...virtualFiles.entries()].find(([, virt]) => virt.url.fsPath === uri.fsPath);
        // console.log("Diagnostics changed for virtual file:", uri, " entry:", entry);
        if (!entry) continue;

        const [realPath, virtualUri] = entry;
        const realUri = vscode.Uri.file(realPath);
        const diags = vscode.languages.getDiagnostics(virtualUri.url);

        const mapped = diags.map((d) => new vscode.Diagnostic(Utils.mapToTemplateRange(d.range, virtualUri.startPosition), d.message, d.severity));
        console.log("Diagnostics Mapped diagnostics for", diags, mapped);
        diagnostics.set(realUri, mapped);
      }
    }
  }
  //
  export async function registerHoverProvider(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.ProviderResult<vscode.Hover>> {
    const virtualUri = virtualFiles.get(document.uri.fsPath);
    if (!virtualUri) return null;

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", virtualUri.url, Utils.mapToVirtualPosition(position, virtualUri.startPosition));

    if (!hovers || hovers.length === 0) {
      return null;
    }

    // Normaliza ranges
    for (const h of hovers) {
      if (h.range) {
        h.range = Utils.mapToTemplateRange(h.range, virtualUri.startPosition);
      }
    }

    // Junta todos os conteúdos em um só Hover
    const contents = hovers.flatMap((h) => (Array.isArray(h.contents) ? h.contents : [h.contents]));

    return new vscode.Hover(contents, hovers[0].range);
  }
  //
  export async function registerDefinitionProvider(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]>> {
    const virt = virtualFiles.get(document.uri.fsPath);
    if (!virt) return [];
    const defs = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeDefinitionProvider", virt.url, Utils.mapToVirtualPosition(position, virt.startPosition));
    return defs?.map((def) => new vscode.Location(def.uri, Utils.mapToTemplateRange(def.range, virt.startPosition))) ?? [];
  }
  //
  export async function registerCodeActionsProvider(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]>> {
    const virt = virtualFiles.get(document.uri.fsPath);
    if (!virt || !context) return [];

    try {
      const virtualActions = (await vscode.commands.executeCommand<vscode.CodeAction[]>("vscode.executeCodeActionProvider", virt.url, Utils.mapToVirtualRange(range, virt.startPosition))) ?? [];
      // console.log("CodeActions received from virtual:start", virtualActions);

      // Agora ajustamos as ações para o documento original
      const actions = virtualActions.map((action) => {
        const newAction = new vscode.CodeAction(action.title, action.kind);

        // Se existir um edit, remapeia os ranges e URIs
        if (action.edit) {
          const newEdit = new vscode.WorkspaceEdit();

          for (const [uri, edits] of action.edit.entries()) {
            for (const edit of edits) {
              const newRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
              console.log("Remapping edit range:", edit.range, " newRange:", newRange);
              newEdit.replace(document.uri, newRange, edit.newText);
            }
          }

          newAction.edit = newEdit;
        }

        // Copia o comando, se existir
        newAction.command = action.command;
        newAction.isPreferred = action.isPreferred;
        newAction.diagnostics = action.diagnostics;

        return newAction;
      });

      // @ts-ignore
      return actions; //?.map((action) => new vscode.CodeAction(action.title, action.kind, mapToTemplateRange(action.range, virt.startPosition))) ?? [];
    } catch (err) {
      // console.error("Error providing code actions:", err);
      return [];
    }
  }
  //
  export async function registerReferenceProvider(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.ProviderResult<vscode.Location[]>> {
    const virt = virtualFiles.get(document.uri.fsPath);
    if (!virt) return [];
    const refs = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeReferenceProvider", virt.url, Utils.mapToVirtualPosition(position, virt.startPosition));
    return refs?.map((ref) => new vscode.Location(ref.uri, Utils.mapToTemplateRange(ref.range, virt.startPosition))) ?? [];
  }
  //
  export async function registerCompletionItemProvider(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>>> {
    const virtualUri = virtualFiles.get(document.uri.fsPath);
    if (!virtualUri) return [];
    const doc = await vscode.workspace.openTextDocument(virtualUri.url);
    console.log("Providing completions for virtual file:", { url: virtualUri.url.fsPath, pos: Utils.mapToVirtualPosition(position, virtualUri.startPosition), startPosition: virtualUri.startPosition });
    const completions = (await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, Utils.mapToVirtualPosition(position, virtualUri.startPosition))) ?? [];
    const fixedItems = completions.items.map((item) => {
      if (item.range) {
        if (item.range instanceof vscode.Range) {
          const start = Utils.mapToTemplatePosition(item.range.start, virtualUri.startPosition);
          const end = Utils.mapToTemplatePosition(item.range.end, virtualUri.startPosition);
          item.range = new vscode.Range(start, end);
        } else if ("inserting" in item.range) {
          // CompletionItemRange
          item.range = {
            inserting: new vscode.Range(Utils.mapToTemplatePosition(item.range.inserting.start, virtualUri.startPosition), Utils.mapToTemplatePosition(item.range.inserting.end, virtualUri.startPosition)),
            replacing: new vscode.Range(Utils.mapToTemplatePosition(item.range.replacing.start, virtualUri.startPosition), Utils.mapToTemplatePosition(item.range.replacing.end, virtualUri.startPosition)),
          };
        }
      }
      if (item.textEdit) {
        const edit = item.textEdit as vscode.TextEdit;
        item.textEdit = new vscode.TextEdit(
          new vscode.Range(Utils.mapToTemplatePosition(edit.range.start, virtualUri.startPosition), Utils.mapToTemplatePosition(edit.range.end, virtualUri.startPosition)),
          edit.newText
        );
      }

      // Corrige edições adicionais
      if (item.additionalTextEdits) {
        item.additionalTextEdits = item.additionalTextEdits.map((edit) => {
          return new vscode.TextEdit(
            new vscode.Range(Utils.mapToTemplatePosition(edit.range.start, virtualUri.startPosition), Utils.mapToTemplatePosition(edit.range.end, virtualUri.startPosition)),
            edit.newText
          );
        });
      }
      return item;
    });

    return new vscode.CompletionList(fixedItems, completions.isIncomplete);
  }
}
