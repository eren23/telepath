declare module "pdf-parse" {
  interface PdfResult {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }
  function pdfParse(buf: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PdfResult>;
  export default pdfParse;
}
