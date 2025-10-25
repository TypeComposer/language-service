import { TextDocument } from "vscode-languageserver-textdocument";

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
  "fragment",
];

export interface VirtualFile {
  url: string;
  tsUrl: string;
  content: string;
  virtualContent: string;
  tsContent: string;
  tsModified: number;
  bodyRange: IRange;
  importRange: IRange;
  className: string;
  document: TextDocument;
  version: number;
  isJsxOnly: boolean;
  folder: string;
}

export class IRange {
  constructor(public startTemplate: number, public endTemplate: number, public startVirtual: number, public endVirtual: number) {}

  public static invalid(): IRange {
    return new IRange(-1, -1, -1, -1);
  }

  public isInsideVirtual(pos: number) {
    if (pos === undefined) return false;
    return pos >= this.startVirtual && pos <= this.endVirtual;
  }

  public isInsideTemplate(pos: number) {
    if (pos === undefined) return false;
    return pos >= this.startTemplate && pos <= this.endTemplate;
  }
  public clone(): IRange {
    return new IRange(this.startTemplate, this.endTemplate, this.startVirtual, this.endVirtual);
  }
}
