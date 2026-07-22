// pdfmake 0.3.x: Der Browser-Build (`build/pdfmake.js`) exportiert eine
// CJS-Singleton-Instanz. @types/pdfmake deklariert die API als Named Exports —
// dieses Modul-Mapping macht den Default-Import typsicher.
declare module 'pdfmake/build/pdfmake.js' {
  import type {
    addFonts,
    addVirtualFileSystem,
    createPdf,
    setProgressCallback,
  } from 'pdfmake'

  const pdfMake: {
    createPdf: typeof createPdf
    addFonts: typeof addFonts
    addVirtualFileSystem: typeof addVirtualFileSystem
    setProgressCallback: typeof setProgressCallback
  }
  export default pdfMake
}
