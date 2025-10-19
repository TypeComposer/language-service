import * as vscode from "vscode";
import { Transforme } from "./transforme";
import { virtualFiles } from "./VirtualFileController";
import { Service } from "./service-host";
import { Utils } from "./utils";
// import { Transforme } from "./transforme";
// import { virtualFiles } from "./VirtualFileController";
// import { Utils } from "./utils";
// import { off } from "process";
// import { Service } from "./service-host";

export const diagnostics = vscode.languages.createDiagnosticCollection("tsx-template");

// /**
//  * Converte vscode.Position para offset do TypeScript
//  * @param text Conteúdo do ficheiro como string
//  * @param position Position do VSCode
//  */
// function positionToOffset(text: string, position: vscode.Position): number {
//   const lines = text.split(/\r?\n/);
//   let offset = 0;

//   for (let i = 0; i < position.line; i++) {
//     offset += lines[i].length + 1; // +1 para o \n
//   }

//   offset += position.character;
//   return offset;
// }

export namespace Action {
  // //
  // export function onDidChangeDiagnostics(event: vscode.DiagnosticChangeEvent) {
  //   for (const uri of event.uris) {
  //     try {
  //       if (uri.fsPath.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`)) {
  //         const entry = [...virtualFiles.entries()].find(([, virt]) => virt.url.fsPath === uri.fsPath);
  //         if (!entry) continue;
  //         const [realPath, virtualUri] = entry;
  //         const realUri = vscode.Uri.file(realPath);
  //         const diags = vscode.languages.getDiagnostics(virtualUri.url);
  //         const mapped = diags
  //           .filter((e) => e.range.start.line >= virtualUri.startPosition.line)
  //           .map((d) => new vscode.Diagnostic(Utils.mapToTemplateRange(d.range, virtualUri.startPosition, virtualUri.offset), d.message, d.severity));
  //         diagnostics.set(realUri, mapped);
  //       }
  //     } catch (err) {}
  //   }
  // }
  //   //
  //   export async function registerHoverProvider(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.ProviderResult<vscode.Hover>> {
  //     try {
  //       const virtualUri = virtualFiles.get(document.uri.fsPath);
  //       if (!virtualUri) return null;
  //       const hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", virtualUri.url, Utils.mapToVirtualPosition(position, virtualUri.startPosition, virtualUri.offset));
  //       if (!hovers || hovers.length === 0) {
  //         return null;
  //       }
  //       // Normaliza ranges
  //       for (const h of hovers) {
  //         if (h.range) {
  //           h.range = Utils.mapToTemplateRange(h.range, virtualUri.startPosition);
  //         }
  //       }
  //       // Junta todos os conteúdos em um só Hover
  //       const contents = hovers.flatMap((h) => (Array.isArray(h.contents) ? h.contents : [h.contents]));
  //       return new vscode.Hover(contents, hovers[0].range);
  //     } catch (err) {
  //       return null;
  //     }
  //   }
  //   //
  //   export async function registerDefinitionProvider(
  //     document: vscode.TextDocument,
  //     position: vscode.Position,
  //     token: vscode.CancellationToken
  //   ): Promise<vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]>> {
  //     try {
  //       const virt = virtualFiles.get(document.uri.fsPath);
  //       if (!virt) return [];
  //       const defs = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeDefinitionProvider", virt.url, Utils.mapToVirtualPosition(position, virt.startPosition, virt.offset));
  //       return defs?.map((def) => new vscode.Location(def.uri, Utils.mapToTemplateRange(def.range, virt.startPosition))) ?? [];
  //     } catch (err) {
  //       return [];
  //     }
  //   }
  //   //
  //   export async function registerCodeActionsProvider(
  //     document: vscode.TextDocument,
  //     range: vscode.Range | vscode.Selection,
  //     context: vscode.CodeActionContext,
  //     token: vscode.CancellationToken
  //   ): Promise<vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]>> {
  //     const virt = virtualFiles.get(document.uri.fsPath);
  //     if (!virt || !context) return [];
  //     try {
  //       const virtualActions = (await vscode.commands.executeCommand<vscode.CodeAction[]>("vscode.executeCodeActionProvider", virt.url, Utils.mapToVirtualRange(range, virt.startPosition))) ?? [];
  //       // console.log("CodeActions received from virtual:start", virtualActions);
  //       // Agora ajustamos as ações para o documento original
  //       const actions = virtualActions.map((action) => {
  //         const newAction = new vscode.CodeAction(action.title, action.kind);
  //         // Se existir um edit, remapeia os ranges e URIs
  //         if (action.edit) {
  //           const newEdit = new vscode.WorkspaceEdit();
  //           for (const [uri, edits] of action.edit.entries()) {
  //             for (const edit of edits) {
  //               const newRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
  //               console.log("Remapping edit range:", edit.range, " newRange:", newRange);
  //               newEdit.replace(document.uri, newRange, edit.newText);
  //             }
  //           }
  //           newAction.edit = newEdit;
  //         }
  //         // Copia o comando, se existir
  //         newAction.command = action.command;
  //         newAction.isPreferred = action.isPreferred;
  //         newAction.diagnostics = action.diagnostics;
  //         return newAction;
  //       });
  //       // @ts-ignore
  //       return actions; //?.map((action) => new vscode.CodeAction(action.title, action.kind, mapToTemplateRange(action.range, virt.startPosition))) ?? [];
  //     } catch (err) {
  //       // console.error("Error providing code actions:", err);
  //       return [];
  //     }
  //   }
  //   //
  //   export async function registerReferenceProvider(
  //     document: vscode.TextDocument,
  //     position: vscode.Position,
  //     context: vscode.ReferenceContext,
  //     token: vscode.CancellationToken
  //   ): Promise<vscode.ProviderResult<vscode.Location[]>> {
  //     try {
  //       const virt = virtualFiles.get(document.uri.fsPath);
  //       if (!virt) return [];
  //       const refs = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeReferenceProvider", virt.url, Utils.mapToVirtualPosition(position, virt.startPosition, virt.offset));
  //       return refs?.map((ref) => new vscode.Location(ref.uri, Utils.mapToTemplateRange(ref.range, virt.startPosition))) ?? [];
  //     } catch (err) {
  //       return [];
  //     }
  //   }
  //   //
  export async function registerCompletionItemProvider(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext,
    tagCompletions: vscode.CompletionItem[] = []
  ): Promise<vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>>> {
    try {
      const virtualUri = virtualFiles.get(document.uri.fsPath);
      if (!virtualUri || !virtualUri.isValid) return [];
      //   const doc = await vscode.workspace.openTextDocument(virtualUri.url);
      //   console.log("Provi
      // ding completions for virtual file:", {
      //     url: virtualUri.url.fsPath,
      //     pos: Utils.mapToVirtualPosition(position, virtualUri.startPosition, virtualUri.offset),
      //     startPosition: virtualUri.startPosition,
      //     offset: virtualUri.offset,
      //   });
      //   const completions =
      //     (await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, Utils.mapToVirtualPosition(position, virtualUri.startPosition, virtualUri.offset))) ??
      //     [];
      //   const fixedItems = completions.items.map((item) => {
      //     if (item.range) {
      //       if (item.range instanceof vscode.Range) {
      //         const start = Utils.mapToTemplatePosition(item.range.start, virtualUri.startPosition, virtualUri.offset);
      //         const end = Utils.mapToTemplatePosition(item.range.end, virtualUri.startPosition, virtualUri.offset);
      //         item.range = new vscode.Range(start, end);
      //       } else if ("inserting" in item.range) {
      //         // CompletionItemRange
      //         item.range = {
      //           inserting: new vscode.Range(
      //             Utils.mapToTemplatePosition(item.range.inserting.start, virtualUri.startPosition, virtualUri.offset),
      //             Utils.mapToTemplatePosition(item.range.inserting.end, virtualUri.startPosition, virtualUri.offset)
      //           ),
      //           replacing: new vscode.Range(
      //             Utils.mapToTemplatePosition(item.range.replacing.start, virtualUri.startPosition, virtualUri.offset),
      //             Utils.mapToTemplatePosition(item.range.replacing.end, virtualUri.startPosition, virtualUri.offset)
      //           ),
      //         };
      //       }
      //     }
      //     if (item.textEdit) {
      //       const edit = item.textEdit as vscode.TextEdit;
      //       item.textEdit = new vscode.TextEdit(
      //         new vscode.Range(
      //           Utils.mapToTemplatePosition(edit.range.start, virtualUri.startPosition, virtualUri.offset),
      //           Utils.mapToTemplatePosition(edit.range.end, virtualUri.startPosition, virtualUri.offset)
      //         ),
      //         edit.newText
      //       );
      //     }
      //     // Corrige edições adicionais
      //     if (item.additionalTextEdits) {
      //       item.additionalTextEdits = item.additionalTextEdits.map((edit) => {
      //         return new vscode.TextEdit(
      //           new vscode.Range(
      //             Utils.mapToTemplatePosition(edit.range.start, virtualUri.startPosition, virtualUri.offset),
      //             Utils.mapToTemplatePosition(edit.range.end, virtualUri.startPosition, virtualUri.offset)
      //           ),
      //           edit.newText
      //         );
      //       });
      //     }
      //     return item;
      //   });
      //   console.log("Completions received from virtual:", completions);
      //   console.warn("Completions received from virtual:", fixedItems);
      const startPosition = virtualUri.bodyRange.toPosition();
      // console.log("startPosition for completions:", startPosition);
      const vsPosition = Utils.mapToVirtualPosition(position, startPosition, 0);
      // console.log("vsPosition for completions:", vsPosition);
      const pos = Utils.toTsPosition(vsPosition, virtualUri.virualContent);
      // console.log("pos for completions:", pos);
      // console.log("Mapped position for completions:", { startPosition, vsPosition, pos, url: virtualUri?.url.fsPath });
      //   return new vscode.CompletionList([...fixedItems, ...tagCompletions], completions.isIncomplete);
      console.log("Fetching completions from TS Language Service at position:", pos, "in file:", virtualUri?.url.fsPath);
      const completions = Service.languageService.getCompletionsAtPosition(virtualUri?.url.fsPath, pos, {}) || [];
      console.log("Completions:", completions);
      //   console.log("Providing completions for virtual file:", virtualUri?.url.fsPath);
      //   console.warn("virtualFile:", virtualFile);
      return tagCompletions;
    } catch (err) {
      return [];
    }
  }
}
