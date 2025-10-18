import * as vscode from "vscode";

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
}
