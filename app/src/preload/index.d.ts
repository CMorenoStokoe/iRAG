import { ElectronAPI } from '@electron-toolkit/preload'

interface API {
  selectFolder: () => Promise<string | null>
  indexFolder: (folderPath: string) => Promise<{ filesAdded: number; errors: string[] }>
  search: (query: string) => Promise<{
    results: {
      text: string
      score: number
      metadata: {
        fileName: string
        folderPath: string
        extension: string
        timestamp: string
      }
    }[]
    files: {
      fileName: string
      folderPath: string
      content: Buffer
    }[]
  }>
  removeFile: (fileName: string, folderPath: string) => Promise<boolean>
  getStats: () => Promise<{
    totalChunks: number
    totalFolders: number
    folders: string[]
    files: Array<{ fileName: string; folderPath: string }>
  }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
