import * as XLSX from 'xlsx'
import fs from 'fs'
import mammoth from 'mammoth'
import PDFParser from 'pdf2json'

// Parse .pdf
export const parsePdf = (filePath: string): Promise<string> =>
  new Promise((res, rej) => {
    const p = new PDFParser()
    // @ts-expect-error We are specifically testing if e.parserError exists
    p.on('pdfParser_dataError', (e) => rej(e.parserError || e))
    p.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        let text = ''
        // Extract text from each page
        if (pdfData.Pages) {
          pdfData.Pages.forEach((page: any) => {
            if (page.Texts) {
              page.Texts.forEach((textItem: any) => {
                if (textItem.R) {
                  textItem.R.forEach((run: any) => {
                    if (run.T) {
                      try {
                        text += decodeURIComponent(run.T) + ' '
                      } catch {
                        // If decoding fails, use the raw text
                        text += run.T + ' '
                      }
                    }
                  })
                }
              })
            }
            text += '\n'
          })
        }
        res(text.trim())
      } catch (err) {
        rej(err)
      }
    })
    p.loadPDF(filePath)
  })

// Parse .docx
export const parseDocx = async (filePath: string): Promise<string> => {
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value // Plain text output
}

// Parse .xls
export const parseXls = (filePath: string): string => {
  const workbook = XLSX.readFile(filePath)
  let text = ''
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    text += `Sheet: ${sheetName}\n`
    text += XLSX.utils.sheet_to_csv(sheet) + '\n\n'
  })
  return text
}

// Parse .txt
export const parseTxt = (filePath: string): string => {
  const text = fs.readFileSync(filePath, 'utf-8')
  return text
}
