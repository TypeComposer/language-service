import * as vscode from "vscode";
import { ResultVirtualFile } from "./VirtualFileController";

export namespace Utils {
  export const TAGS_HTML = [
    "div",
    "span",
    "p",
    "a",
    "ul",
    "li",
    "button",
    "input",
    "form",
    "header",
    "footer",
    "section",
    "article",
    "nav",
    "main",
    "aside",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "label",
    "select",
    "option",
    "textarea",
    "video",
    "audio",
    "canvas",
    "svg",
    "path",
    "circle",
    "rect",
    "header",
    "footer",
    "section",
    "article",
    "nav",
    "main",
    "aside",
  ];
  /**
   * Converte uma posição do .template (real) para o .virtual.tsx
   */
  export function mapToVirtualPosition(templatePos: vscode.Position, start: vscode.Position, offset: number): vscode.Position {
    return new vscode.Position(start.line + templatePos.line - offset, (templatePos.line === 0 ? start.character : 0) + templatePos.character);
  }

  /**
   * Converte uma posição do .virtual.tsx para o .template
   */
  export function mapToTemplatePosition(virtualPos: vscode.Position, start: vscode.Position, offset: number): vscode.Position {
    const check = new vscode.Position(virtualPos.line - start.line + offset, virtualPos.line === start.line ? virtualPos.character - start.character : virtualPos.character);

    return new vscode.Position(check.line < 0 ? 0 : check.line, check.character < 0 ? 0 : check.character);
  }

  /**
   * Converte uma posição do .virtual.tsx para o .template
   */
  export function mapToTemplateRange(range: vscode.Range, start: vscode.Position, offset: number = 0): vscode.Range {
    return new vscode.Range(mapToTemplatePosition(range.start, start, offset), mapToTemplatePosition(range.end, start, offset));
  }

  export function mapToVirtualRange(range: vscode.Range, start: vscode.Position): vscode.Range {
    // constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
    // return new vscode.Range(new vscode.Position(range.start.line + start.line, range.start.character), new vscode.Position(range.end.line + start.line, range.end.character));
    const pos = range.with(new vscode.Position(range.start.line + start.line, range.start.character), new vscode.Position(range.end.line + start.line, range.end.character));
    return pos;
  }

  /**
   * Verifica se uma posição do TypeScript (offset) está dentro de dois ranges do VSCode.
   *
   * @param range1 Primeiro range
   * @param range2 Segundo range
   * @param text Texto completo do ficheiro
   * @param tsPosition Offset (posição em caracteres) vinda do TypeScript
   * @returns {false | { text: string }} Retorna falso se fora dos ranges, ou o texto do trecho se estiver dentro
   */
  export function isTsPositionInsideRanges(range1: vscode.Range, range2: vscode.Range | undefined, text: string, tsPosition: number): boolean {
    // Calcula os offsets correspondentes aos ranges
    const getOffset = (pos: vscode.Position): number => {
      const lines = text.split(/\r?\n/);
      let offset = 0;
      for (let i = 0; i < pos.line; i++) {
        offset += lines[i].length + 1; // +1 pelo '\n'
      }
      offset += pos.character;
      return offset;
    };

    const start1 = getOffset(range1.start);
    const end1 = getOffset(range1.end);

    // Verifica se o offset está dentro de algum dos ranges
    const inside1 = tsPosition >= start1 && tsPosition <= end1;
    function inside2() {
      if (!range2) return false;
      const start2 = getOffset(range2.start);
      const end2 = getOffset(range2.end);
      return tsPosition >= start2 && tsPosition <= end2;
    }

    if (inside1 || inside2()) {
      return true;
    }

    return false;
  }

  // /**
  //  * Converte um offset (posição absoluta em caracteres) em uma vscode.Position,
  //  * usando o texto do arquivo virtual.
  //  */
  // export function offsetToPosition(text: string, offset: number, virtualFile: ResultVirtualFile): vscode.Position {
  //   let line = 0;
  //   let character = 0;

  //   for (let i = 0; i < offset; i++) {
  //     if (text[i] === "\n") {
  //       line++;
  //       character = 0;
  //     } else {
  //       character++;
  //     }
  //   }

  //   return new vscode.Position(line - virtualFile.startPosition.line, character);
  // }

  /**
   * Converte um vscode.Position para o offset usado pelo TypeScript.
   * @param position - A posição VSCode (linha e caractere)
   * @param code - O conteúdo completo do arquivo como string
   * @returns O offset (posição linear em caracteres) compatível com o TypeScript
   */
  export function toTsPosition(position: vscode.Position, code: string): number {
    const lines = code.split(/\r?\n/);
    let offset = 0;

    for (let i = 0; i < position.line; i++) {
      offset += lines[i].length + 1; // +1 por causa do '\n'
    }

    offset += position.character;
    return offset;
  }
}

export class IRange {
  public startLine;
  constructor(public start: number, public end: number, public line: number, virtualContext: string) {
    this.startLine = this.getLineOffset(this.start, virtualContext).line;
  }

  public static invalid(): IRange {
    return new IRange(-1, -1, -1, "");
  }

  public isInside(pos: number) {
    if (pos === undefined) return false;
    return pos >= this.start && pos <= this.end;
  }

  public getLineOffset(start: number, virtualContext: string): { line: number; character: number } {
    if (!virtualContext) return { line: 0, character: 0 };
    const lines = virtualContext.split("\n");
    let lineLength = 0;
    for (let i = 0; i < lines.length; i++) {
      if (start >= lineLength && start <= lineLength + lines[i].length) {
        return { line: i, character: lineLength };
      }
      lineLength += lines[i].length + 1; // +1 for the newline character
    }
    return { line: 0, character: 0 };
  }

  public toRange(start: number, length: number, virtualContent: string): vscode.Range {
    const { line, character } = this.getLineOffset(start, virtualContent);
    const startPos = new vscode.Position(line - this.startLine + this.line, start - character);
    const endPos = new vscode.Position(line - this.startLine + this.line, start - character + length);
    return new vscode.Range(startPos, endPos);
  }

  public toPosition(): vscode.Position {
    return new vscode.Position(this.startLine, 0);
  }
}
