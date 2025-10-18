import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { Transforme } from "./transforme";

export interface ResultVirtualFile {
  url: vscode.Uri;
  offset: number;
  startPosition: vscode.Position;
  content: string;
  bodyRange: vscode.Range;
  importRange: vscode.Range;
}

function makeVirtualUri(document: vscode.TextDocument): vscode.Uri {
  const folder = path.dirname(document.uri.fsPath);
  const baseName = path.basename(document.uri.fsPath, ".template");
  return vscode.Uri.file(path.join(folder, `${baseName}.${Transforme.EXTENSION_VIRTUAL}`));
}

class VirtualFileController {
  files = new Map<string, ResultVirtualFile>();

  async syncFile(document: vscode.TextDocument) {
    if (document.languageId !== "tsx-template") return;
    const folder = path.dirname(document.uri.fsPath);
    const baseName = path.basename(document.uri.fsPath, ".template");
    const virtualUri = makeVirtualUri(document);
    const { content, startPosition, offset, bodyRange, importRange } = Transforme.getVirtualContent(folder, baseName, document.getText());
    //   const content = getVirtualContent(document.getText());

    try {
      await fs.writeFile(virtualUri.fsPath, content, "utf8");
      this.files.set(document.uri.fsPath, { url: virtualUri, startPosition: startPosition, content, offset, bodyRange, importRange });
    } catch (err) {
      console.error("Erro ao salvar arquivo virtual:", err);
      this.files.delete(document.uri.fsPath);
    }
  }

  entries(): IterableIterator<[string, ResultVirtualFile]> {
    return this.files.entries();
  }

  get(path: string): ResultVirtualFile | undefined {
    return this.files.get(path);
  }
}

export const virtualFiles = new VirtualFileController();
