import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { Transforme } from "./transforme";

let parsed!: ts.ParsedCommandLine;

const projectPath = path.resolve("/Users/Ezequiel/Documents/TypeComposer/docs", "tsconfig.json");
const configFile = ts.readConfigFile(projectPath, ts.sys.readFile);

function getParsedCommandLine(): ts.ParsedCommandLine {
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(projectPath));
  console.log("parsedConfig", parsedConfig);
  return parsedConfig;
}

export namespace Service {
  //
  const files = new Map<string, string>();

  export const parsedConfig = getParsedCommandLine();

  //
  export const host: ts.LanguageServiceHost & {
    updateFile: (fileName: string, content: string) => void;
  } = {
    getScriptFileNames: () => Array.from(new Set<string>([...parsedConfig.fileNames.map((f) => path.resolve(f)), ...files.keys()])),
    getScriptVersion: () => "1",

    getScriptSnapshot: (fileName) => {
      if (fileName.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`)) {
        const text = files.get(fileName);
        return text ? ts.ScriptSnapshot.fromString(text) : undefined;
      }
      const normalized = path.resolve(fileName);
      const text = files.get(normalized) ?? (fs.existsSync(normalized) ? fs.readFileSync(normalized, "utf8") : undefined);
      return text ? ts.ScriptSnapshot.fromString(text) : undefined;
    },
    updateFile: (fileName: string, content: string) => {
      files.set(fileName, content);
      languageService.cleanupSemanticCache();
    },
    getCurrentDirectory: () => process.cwd(),

    getCompilationSettings: () => parsedConfig.options, // ← usa o tsconfig do projeto

    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),

    fileExists: (fileName) => files.has(fileName) || fs.existsSync(fileName),

    readFile: (fileName) => {
      const normalized = path.resolve(fileName);
      if (fileName.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`)) {
        return files.get(fileName) ?? "";
      }
      return fs.readFileSync(normalized, "utf8");
    },
  };

  export const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
}
