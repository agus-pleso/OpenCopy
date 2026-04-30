declare module "html-to-docx" {
  type HtmlToDocxOptions = Record<string, unknown>;
  function htmlToDocx(
    html: string,
    headerHtml?: string | null,
    options?: HtmlToDocxOptions,
    footerHtml?: string | null,
  ): Promise<Buffer | Blob>;
  export default htmlToDocx;
}
