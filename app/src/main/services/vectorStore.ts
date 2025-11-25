import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'

export interface DocumentChunk {
  id: string
  text: string
  embedding: number[]
  metadata: ChunkMetadata
}

export interface ChunkMetadata {
  source: string // Full file path
  fileName: string
  folderPath: string
  chunkIndex: number
  timestamp: string
  extension: string
}

export interface SearchResult {
  text: string
  score: number
  metadata: ChunkMetadata
}

export class VectorStore {
  private documents: DocumentChunk[] = []
  private storePath: string
  private isLoaded = false

  private xLog: (message: string) => void

  constructor(xLog) {
    const userDataPath = app.getPath('userData')
    this.storePath = path.join(userDataPath, 'vector-store.json')
    this.xLog = xLog
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8')
      const parsed = JSON.parse(data)
      this.documents = parsed.documents || []
      this.isLoaded = true
      this.xLog(`Loaded ${this.documents.length} documents`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.xLog('No existing vector store, starting fresh')
        this.documents = []
        this.isLoaded = true
      } else {
        throw error
      }
    }
  }

  async save(): Promise<void> {
    const data = JSON.stringify({ documents: this.documents }, null, 2)
    await fs.writeFile(this.storePath, data, 'utf-8')
  }

  async addDocuments(chunks: DocumentChunk[]): Promise<void> {
    if (!this.isLoaded) await this.load()
    this.documents.push(...chunks)
    await this.save()
  }

  async search(
    queryEmbedding: number[],
    topK: number
  ): Promise<{
    results: SearchResult[]
    files: { fileName: string; folderPath: string; content: Buffer }[]
  }> {
    this.xLog('Starting search function')
    if (!this.isLoaded) await this.load()
    if (this.documents.length === 0) return { results: [], files: [] }

    this.xLog('Starting search in vector store...')
    const results = this.documents.map((doc) => ({
      text: doc.text,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding),
      metadata: doc.metadata
    }))

    this.xLog('Sorting search results...')
    const topResults = results.sort((a, b) => b.score - a.score).slice(0, topK)
    this.xLog('Sorted search results.')

    const uniqueFiles = topResults.map((res) => ({
      fileName: res.metadata.fileName,
      folderPath: res.metadata.folderPath,
      content: new Buffer('') // readFileSync(`${res.metadata.folderPath}/${res.metadata.fileName}`)
    }))

    return { results: topResults, files: uniqueFiles }
  }

  async removeFile(fileName: string, folderPath: string): Promise<void> {
    if (!this.isLoaded) await this.load()
    this.documents = this.documents.filter(
      (doc) => !(doc.metadata.fileName === fileName && doc.metadata.folderPath === folderPath)
    )
    await this.save()
  }

  getStats(): {
    totalChunks: number
    totalFolders: number
    folders: string[]
    files: Array<{ fileName: string; folderPath: string }>
  } {
    const folders = new Set<string>()
    const filesMap = new Map<string, { fileName: string; folderPath: string }>()

    this.documents.forEach((doc) => {
      folders.add(doc.metadata.folderPath)
      // Use fileName as key to avoid duplicates
      const key = `${doc.metadata.folderPath}::${doc.metadata.source}`
      if (!filesMap.has(key)) {
        filesMap.set(key, {
          fileName: doc.metadata.source,
          folderPath: doc.metadata.folderPath
        })
      }
    })

    return {
      totalChunks: this.documents.length,
      totalFolders: folders.size,
      folders: Array.from(folders),
      files: Array.from(filesMap.values())
    }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i]
    }
    return dotProduct
  }
}
