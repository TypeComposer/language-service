import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { Transforme } from "./transforme";

let parsed!: ts.ParsedCommandLine;

function getCompilerOptions(): ts.CompilerOptions {
  const configPath = "/Users/Ezequiel/Documents/TypeComposer/docs/tsconfig.json";
  //ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");

  let compilerOptions: ts.CompilerOptions = {};

  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
    compilerOptions = parsed.options;
  } else {
    console.warn("⚠️ Nenhum tsconfig.json encontrado, usando opções padrão.");
    compilerOptions = {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ESNext,
      strict: true,
    };
  }
  return compilerOptions;
}

export namespace Service {
  //
  export const files = new Map<string, string>();
  //
  export const compilerOptions = getCompilerOptions();
  //
  export const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => Array.from(new Set<string>([...parsed.fileNames.map((f) => path.resolve(f)), ...files.keys()])),
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

    getCurrentDirectory: () => process.cwd(),

    getCompilationSettings: () => compilerOptions, // ← usa o tsconfig do projeto

    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),

    fileExists: (fileName) => files.has(fileName) || fs.existsSync(fileName),

    readFile: (fileName) => {
      const normalized = path.resolve(fileName);
      if (fileName.endsWith(`.${Transforme.EXTENSION_VIRTUAL}`)) {
        console.log("Reading file:", fileName);
        return files.get(fileName) ?? "";
      }
      return fs.readFileSync(normalized, "utf8");
    },
  };

  export const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
}
