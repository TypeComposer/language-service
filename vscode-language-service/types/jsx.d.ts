export {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Custom element provided by your library
      "tc-anchor-element": {
        rlink?: string;
        href?: string;
        target?: string;
        [attr: string]: any;
      };

      // Support customized built-in usage: <a is="tc-anchor-element" ... />
      a: {
        is?: "tc-anchor-element" | string;
        [attr: string]: any;
      };
    }
  }
}
