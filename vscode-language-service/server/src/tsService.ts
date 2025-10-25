import * as ts from "typescript";
import * as fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { Transforme } from "./transform";
import path = require("path");
import { TextDocument, Range } from "vscode-languageserver-textdocument";
import { CodeAction, CodeActionKind, CompletionItem, CompletionItemKind, Diagnostic, InsertTextFormat, Location, Position } from "vscode-languageserver";
import { IRange, TAGS_HTML, VirtualFile } from "./utils";
import { documents } from "./server";

export const EXTENSION_VIRTUAL = "tc.template.virtual.tsx";

function normalizeFileName(uri: string): string {
  return uri.replace(/\.template$/, `.tc.template.virtual.tsx`);
}

export class TsLanguageServiceHost {
  parsedConfig: ts.ParsedCommandLine;
  host: ts.LanguageServiceHost;
  tsService!: ts.LanguageService;
  private files = new Map<string, VirtualFile>();

  constructor(workspacePath: string) {
    this.parsedConfig = this.loadTsConfig(workspacePath)!;
    this.host = this.createHost();
  }

  loadTsConfig(workspacePath: string) {
    const configPath = ts.findConfigFile(workspacePath, ts.sys.fileExists, "tsconfig.json");

    if (!configPath) {
      return null;
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

    if (configFile.error) {
      const message = ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n");
      console.error("Error: tsconfig.json:", message);
      return null;
    }

    const configDir = path.dirname(configPath);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, configDir);
    return parsed;
  }

  createHost(): ts.LanguageServiceHost {
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(new Set<string>([...this.parsedConfig.fileNames.map((f) => path.resolve(f)), ...this.files.keys()])),
      getScriptVersion: (fileName) => this.files.get(fileName)?.version.toString() ?? "0",

      getScriptSnapshot: (fileName) => {
        if (fileName.endsWith(`.${EXTENSION_VIRTUAL}`)) {
          const content = this.files.get(fileName)?.virtualContent;
          return content ? ts.ScriptSnapshot.fromString(content) : undefined;
        }
        const normalized = path.resolve(fileName);
        const text = fs.existsSync(normalized) ? fs.readFileSync(normalized, "utf8") : undefined;
        return text ? ts.ScriptSnapshot.fromString(text) : undefined;
      },

      getCompilationSettings: () => this.parsedConfig.options,
      fileExists: (fileName) => this.files.has(fileName) || fs.existsSync(fileName),
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      getCurrentDirectory: () => process.cwd(),
    };

    // @ts-ignore
    this.tsService = ts.createLanguageService(host);

    return host;
  }

  getCompletionsTemplateAtPosition(document: TextDocument, position: Position, options: ts.GetCompletionsAtPositionOptions) {
    const fileName = normalizeFileName(document.uri);
    const virtualFile = this.files.get(fileName);
    if (!virtualFile || !virtualFile.isValid) return [];
    const offset = this.normalizeTemplateToVirtualFilePosition(virtualFile, document.offsetAt(position));

    const completions: CompletionItem[] = (this.tsService.getCompletionsAtPosition(fileName, offset, options)?.entries ?? []).map((entry) => ({
      label: entry.name,
      kind: 6, // Variable
    }));
    const textBefore = document.getText().slice(0, document.offsetAt(position));
    const lastChar = textBefore.slice(-1);

    if (lastChar === "<") {
      completions.push(
        ...TAGS_HTML.map((tag) => ({
          label: tag,
          kind: CompletionItemKind.Snippet,
          insertText: `${tag}>$0</${tag}>`,
          insertTextFormat: InsertTextFormat.Snippet,
        }))
      );
    }

    return completions;
  }

  private normalizeVirtualFileToTemplatePosition(virtualFile: VirtualFile, startPos: number): number {
    const range: IRange = (virtualFile.bodyRange.isInsideVirtual(startPos) ? virtualFile.bodyRange : virtualFile.importRange).clone();
    const offset = virtualFile.bodyRange.isInsideVirtual(startPos) && virtualFile.importRange.endVirtual != -1 ? virtualFile.importRange.endVirtual : 0;
    const normalizedPos = startPos - range.startVirtual + offset;
    return normalizedPos;
  }

  private normalizeTemplateToVirtualFilePosition(virtualFile: VirtualFile, position: number): number {
    const range: IRange = (virtualFile.bodyRange.isInsideTemplate(position) ? virtualFile.bodyRange : virtualFile.importRange).clone();
    const offset = virtualFile.bodyRange.isInsideTemplate(position) && virtualFile.importRange.endVirtual != -1 ? virtualFile.importRange.endVirtual : 0;
    const normalizedPos = position + range.startVirtual - offset;
    return normalizedPos;
  }

  getHoverTemplateAtPosition(document: TextDocument, position: Position) {
    const fileName = normalizeFileName(document.uri);
    const virtualFile = this.files.get(fileName);
    if (!virtualFile || !virtualFile.isValid) return null;
    const info = this.tsService.getQuickInfoAtPosition(fileName, this.normalizeTemplateToVirtualFilePosition(virtualFile, document.offsetAt(position)));
    if (!info) return null;
    const display = ts.displayPartsToString(info.displayParts);
    const documentation = ts.displayPartsToString(info.documentation);
    const start = this.normalizeVirtualFileToTemplatePosition(virtualFile, info.textSpan.start);
    const contents = [{ language: "typescript", value: display }];
    if (documentation) contents.push({ language: "typescript", value: documentation });
    return {
      contents: contents,
      range: info.textSpan
        ? {
            start: document.positionAt(start),
            end: document.positionAt(start + info.textSpan.length),
          }
        : undefined,
    };
  }

  normalizeUriVirtualToTS(virtualFile: VirtualFile, uri: string): string {
    if (uri.endsWith(`.${EXTENSION_VIRTUAL}`)) return pathToFileURL(virtualFile.tsUrl).toString();
    return uri;
  }

  // @ts-ignore
  getDefinitionTemplateAtPosition(document: TextDocument, position: Position) {
    const fileName = normalizeFileName(document.uri);
    const virtualFile = this.files.get(fileName);
    if (!virtualFile || !virtualFile.isValid) return null;
    const offset = this.normalizeTemplateToVirtualFilePosition(virtualFile, document.offsetAt(position));
    const defs = this.tsService.getDefinitionAtPosition(fileName, offset) as ts.DefinitionInfo[];

    if (!defs || defs.length === 0) return null;

    const locations: Location[] = defs.map((d) => {
      const targetPath = path.resolve(d.fileName);
      const uri = this.normalizeUriVirtualToTS(virtualFile, pathToFileURL(targetPath).toString());

      let targetDoc = documents.get(uri);
      if (!targetDoc) {
        const text = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
        targetDoc = TextDocument.create(uri, "typescript", 0, text);
      }

      const start = targetDoc.positionAt(d.textSpan.start);
      const end = targetDoc.positionAt(d.textSpan.start + d.textSpan.length);
      return { uri, range: { start, end } };
    });

    return locations;
  }

  getDiagnosticsTemplate(document: TextDocument): Diagnostic[] {
    const fileName = normalizeFileName(document.uri);
    const virtualFile = this.files.get(fileName);
    if (!virtualFile || !virtualFile.isValid) return [];
    const diagnostics = this.tsService.getSemanticDiagnostics(fileName).concat(this.tsService.getSyntacticDiagnostics(fileName));
    return diagnostics
      .filter((diag) => {
        const start = diag.start ?? 0;
        return virtualFile.bodyRange.isInsideVirtual(start) || virtualFile.importRange.isInsideVirtual(start);
      })
      .map((diag) => {
        const start = diag.start ?? 0;
        const length = diag.length ?? 0;
        const range: IRange = (virtualFile.bodyRange.isInsideVirtual(start) ? virtualFile.bodyRange : virtualFile.importRange).clone();
        const offset = virtualFile.bodyRange.isInsideVirtual(start) && virtualFile.importRange.endVirtual != -1 ? virtualFile.importRange.endVirtual : 0;
        const startPos = document.positionAt(start - range.startVirtual + offset);
        const endPos = document.positionAt(start + length - range.startVirtual + offset);
        return {
          severity: 1,
          range: {
            start: startPos,
            end: endPos,
          },
          code: diag.code,
          message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
          source: "TypeComposer",
        };
      });
  }

  getCodeFixesTemplateAtPosition(document: TextDocument, range: Range, errorCodes: readonly number[]): CodeAction[] {
    const fileName = normalizeFileName(document.uri);
    const virtualFile = this.files.get(fileName);
    if (!virtualFile || !virtualFile.isValid) return [];
    const start = virtualFile.bodyRange.startVirtual + document.offsetAt(range.start);
    const end = virtualFile.bodyRange.endVirtual + document.offsetAt(range.end);
    const fixes = this.tsService.getCodeFixesAtPosition(fileName, start, end, errorCodes, {}, {});

    const actions: CodeAction[] = fixes.map((fix) => ({
      title: fix.description,
      kind: CodeActionKind.QuickFix,
      edit: {
        changes: {
          [document.uri]: fix.changes.flatMap((c) =>
            c.textChanges.map((tc) => ({
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0 + tc.span.length, character: 0 },
              },
              newText: tc.newText,
            }))
          ),
        },
      },
    }));
    return actions;
  }

  deleteVirtualFile(uri: string) {
    const fileName = normalizeFileName(uri);
    this.files.delete(fileName);
  }

  updateVirtualFile(document: TextDocument): Diagnostic[] {
    this.tsService.cleanupSemanticCache();
    const fileName = normalizeFileName(document.uri);
    const templateSource = document.getText();
    const className = path.basename(document.uri, ".template");
    const virtualFile = this.files.get(fileName) || {
      url: fileName,
      tsUrl: "",
      tsModified: 0,
      content: document.getText(),
      version: 0,
      virtualContent: "",
      tsContent: "",
      className,
      importRange: IRange.invalid(),
      bodyRange: IRange.invalid(),
      isValid: true,
      folder: path.dirname(fileURLToPath(document.uri)),
      document,
      isJsxOnly: false,
    };
    virtualFile.version++;
    virtualFile.content = templateSource;
    Transforme.analisar(virtualFile, templateSource);
    this.files.set(fileName, virtualFile);
    const diagnostics = this.getDiagnosticsTemplate(document);
    if (!virtualFile.isJsxOnly && templateSource.trim().length > 0) {
      const lines = templateSource.split("\n");
      const start = { line: 0, character: 0 };
      const end = { line: lines.length - 1, character: lines[lines.length - 1]?.length || 0 };
      diagnostics.push({
        severity: 1,
        range: {
          start,
          end,
        },
        code: 9999,

        message: `The file contains non-JSX/TSX code after imports. Only JSX/TSX code is allowed in .template files. Example: wrap multiple root elements or siblings in a fragment like <>...</> (e.g. <>\n  <div/>\n  <div/>\n</>).`,
        source: "TypeComposer",
      });
    }
    return diagnostics;
  }
}
