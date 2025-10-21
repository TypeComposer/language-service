import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Transforme } from "./transforme";

const projectPath = path.resolve("/Users/Ezequiel/Documents/TypeComposer/docs", "tsconfig.json");
const configFile = ts.readConfigFile(projectPath, ts.sys.readFile);

function getParsedCommandLine(): ts.ParsedCommandLine {
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(projectPath));
  console.log("parsedConfig", parsedConfig);
  return parsedConfig;
}

export namespace Service {
  //
  const files = new Map<string, { version: number; content: string }>();

  export const parsedConfig = getParsedCommandLine();

  //
  export const host: ts.LanguageServiceHost & {
    updateFile: (fileName: string, content: string) => void;
  } = {
    getScriptFileNames: () => Array.from(new Set<string>([...parsedConfig.fileNames.map((f) => path.resolve(f)), ...files.keys()])),
    getScriptVersion: (fileName) => files.get(fileName)?.version.toString() ?? "0",

    getScriptSnapshot: (fileName) => {
      if (fileName.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`)) {
        const content = files.get(fileName)?.content;
        return content ? ts.ScriptSnapshot.fromString(content) : undefined;
      }
      const normalized = path.resolve(fileName);
      const text = fs.existsSync(normalized) ? fs.readFileSync(normalized, "utf8") : undefined;
      return text ? ts.ScriptSnapshot.fromString(text) : undefined;
    },
    updateFile: (fileName: string, content: string) => {
      const entry = files.get(fileName);
      if (!entry) {
        files.set(fileName, { version: 0, content });
      } else {
        entry.version++;
        entry.content = content;
      }
      languageService.cleanupSemanticCache();
    },

    getCompilationSettings: () => parsedConfig.options, // ← usa o tsconfig do projeto

    fileExists: (fileName) => files.has(fileName) || fs.existsSync(fileName),
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    getCurrentDirectory: () => process.cwd(),
  };

  export const languageService = ts.createLanguageService(host);
}
