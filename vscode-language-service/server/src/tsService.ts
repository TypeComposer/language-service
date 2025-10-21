import * as ts from "typescript";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { mapTemplateToTS, Transforme } from "./transform";
import path = require("path");
import { TextDocument, Position } from "vscode-languageserver-textdocument";
import { Diagnostic } from "vscode-languageserver";
import { IRange, VirtualFile } from "./utils";

export const EXTENSION_VIRTUAL = "tc.template.virtual.tsx";
const files = new Map<string, VirtualFile>();

const projectPath = path.resolve("/Users/Ezequiel/Documents/TypeComposer/docs", "tsconfig.json");
const configFile = ts.readConfigFile(projectPath, ts.sys.readFile);

function getParsedCommandLine(): ts.ParsedCommandLine {
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(projectPath));
  // console.log("parsedConfig", parsedConfig);
  return parsedConfig;
}

export const parsedConfig = getParsedCommandLine();

export const host: ts.LanguageServiceHost = {
  getScriptFileNames: () => Array.from(new Set<string>([...parsedConfig.fileNames.map((f) => path.resolve(f)), ...files.keys()])),
  getScriptVersion: (fileName) => files.get(fileName)?.version.toString() ?? "0",

  getScriptSnapshot: (fileName) => {
    if (fileName.endsWith(`.${EXTENSION_VIRTUAL}`)) {
      const content = files.get(fileName)?.virualContent;
      return content ? ts.ScriptSnapshot.fromString(content) : undefined;
    }
    const normalized = path.resolve(fileName);
    const text = fs.existsSync(normalized) ? fs.readFileSync(normalized, "utf8") : undefined;
    return text ? ts.ScriptSnapshot.fromString(text) : undefined;
  },

  getCompilationSettings: () => parsedConfig.options, // ← usa o tsconfig do projeto
  fileExists: (fileName) => files.has(fileName) || fs.existsSync(fileName),
  getDefaultLibFileName: ts.getDefaultLibFilePath,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  getCurrentDirectory: () => process.cwd(),
};

export function uriToPath(uri: string): string {
  if (uri.startsWith("file://")) {
    return fileURLToPath(uri);
  }
  return uri;
}

export function normalizeFileName(uri: string): string {
  return uri.replace(/\.template$/, `.tc.template.virtual.tsx`);
}

// @ts-ignore
export const tsService: ts.LanguageService & {
  getCompletionsTemplateAtPosition: (document: TextDocument, position: Position, options: ts.GetCompletionsAtPositionOptions) => ts.CompletionInfo | undefined;
} = ts.createLanguageService(host);

tsService.getCompletionsTemplateAtPosition = function (document: TextDocument, position: Position, options: ts.GetCompletionsAtPositionOptions) {
  const fileName = normalizeFileName(document.uri);
  const virtualFile = files.get(fileName);
  if (!virtualFile || !virtualFile.isValid) return undefined;
  const offset = virtualFile.bodyRange.start + document.offsetAt(position);
  console.log("Getting completions at offset:", offset, "in file:", fileName);
  return this.getCompletionsAtPosition(fileName, offset, options);
};

export function updateVirtualFile(document: TextDocument): Diagnostic[] {
  const fileName = normalizeFileName(document.uri);
  const templateSource = document.getText();
  const className = path.basename(document.uri, ".template");
  const virtualFile = files.get(fileName) || {
    url: fileName,
    content: document.getText(),
    version: 0,
    virualContent: "",
    tsContent: "",
    className,
    importRange: IRange.invalid(),
    bodyRange: IRange.invalid(),
    isValid: true,
    folder: path.dirname(fileURLToPath(document.uri)),
    document,
  };
  virtualFile.version++;
  virtualFile.content = templateSource;
  Transforme.analisar(virtualFile, templateSource);
  // console.log("Updated virtual file:", virtualFile);
  files.set(fileName, virtualFile);
  return [];
}
