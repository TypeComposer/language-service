import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Transforme } from "./transforme";
import { Service } from "./service-host";
import ts = require("typescript");
import { IRange } from "./utils";

export interface ResultVirtualFile {
  url: vscode.Uri;
  content: string;
  virualContent: string;
  tsContent: string;
  bodyRange: IRange;
  importRange: IRange;
  className: string;
  isValid: boolean;
  document: vscode.TextDocument;
}

function makeVirtualUri(document: vscode.TextDocument): vscode.Uri {
  const folder = path.dirname(document.uri.fsPath);
  const baseName = path.basename(document.uri.fsPath, ".template");
  return vscode.Uri.file(path.join(folder, `${baseName}.${Transforme.EXTENSION_VIRTUAL}`));
}

function updateDiagnostics(virtualFile: ResultVirtualFile, languageService: ts.LanguageService, diagnostics: vscode.DiagnosticCollection) {
  const uri: vscode.Uri = virtualFile.document.uri;
  const fileName = virtualFile.url.fsPath;
  const diagnosticsTc = languageService.getSemanticDiagnostics(fileName);
  const vscodeDiagnostics = diagnosticsTc
    .filter((e) => e.code !== 7026 && (virtualFile.bodyRange.isInside(e.start!) || virtualFile.importRange.isInside(e.start!)))
    .map((d) => {
      const virtualRange: IRange = virtualFile.bodyRange.isInside(d.start!) ? virtualFile.bodyRange : virtualFile.importRange;
      const start = d.start ?? 0;
      const length = d.length ?? 0;
      const range = virtualRange.toRange(start, length, virtualFile.virualContent);
      return new vscode.Diagnostic(range, ts.flattenDiagnosticMessageText(d.messageText, "\n"), vscode.DiagnosticSeverity.Error);
    });
  diagnostics.set(uri, vscodeDiagnostics);
}

class VirtualFileController {
  files = new Map<string, ResultVirtualFile>();

  async syncFile(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection) {
    if (document.languageId !== "tsx-template") return;

    const virtualFile: ResultVirtualFile = this.getVirtualFile(document);
    if (!virtualFile.isValid) return;

    try {
      Service.host.updateFile(virtualFile.url.fsPath, virtualFile.virualContent);
      this.files.set(document.uri.fsPath, virtualFile);
      VirtualFileController.debugFile(virtualFile);
      updateDiagnostics(virtualFile, Service.languageService, diagnostics);
    } catch (err) {
      diagnostics.set(virtualFile.document.uri, []);
      this.files.delete(document.uri.fsPath);
    }
  }

  static debugFile(virtualFile: ResultVirtualFile) {
    fs.writeFileSync(virtualFile.url.fsPath, virtualFile.virualContent, "utf8");
    fs.writeFileSync(`${virtualFile.url.fsPath}.json`, JSON.stringify(virtualFile, null, 2), "utf8");
  }

  private getVirtualFile(document: vscode.TextDocument): ResultVirtualFile {
    const virtualUri = makeVirtualUri(document);
    const folder = path.dirname(document.uri.fsPath);
    const className = path.basename(document.uri.fsPath, ".template");
    const virtualFile: ResultVirtualFile = {
      url: virtualUri,
      content: document.getText(),
      virualContent: "",
      tsContent: "",
      className,
      isValid: false,
      document: document,
      bodyRange: IRange.invalid(),
      importRange: IRange.invalid(),
    };
    try {
      const files = fs.readdirSync(folder);
      for (const file of files) {
        if (!file.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`) && (file.endsWith(".tsx") || file.endsWith(".ts"))) {
          const filePath = path.join(folder, file);
          const code = fs.readFileSync(filePath, "utf-8");

          virtualFile.isValid = Transforme.analisar(virtualFile, code);
          if (virtualFile.isValid) {
            return virtualFile;
          }
        }
      }
    } catch (err) {
      console.error("Erro ao ler a pasta:", err);
    }
    return virtualFile;
  }

  entries(): IterableIterator<[string, ResultVirtualFile]> {
    return this.files.entries();
  }

  get(path: string): ResultVirtualFile | undefined {
    return this.files.get(path);
  }
}

export const virtualFiles = new VirtualFileController();
