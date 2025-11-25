import OpenAI from 'openai'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export class EmbeddingService {
  private client: OpenAI | null = null
  private isInitialized = false
  private xLog: (message: string) => void

  constructor(xLog) {
    this.xLog = xLog
  }

  // Initialize OpenAI client
  async initialize(apiKey?: string): Promise<void> {
    if (this.isInitialized) return
    this.xLog('Initializing OpenAI embedding service...')

    // Use provided API key or read from user data folder
    let key = apiKey || process.env.OPENAI_API_KEY

    if (!key) {
      try {
        const userDataPath = app.getPath('userData')
        const keyFilePath = path.join(userDataPath, 'openai-key.txt')
        if (fs.existsSync(keyFilePath)) {
          key = fs.readFileSync(keyFilePath, 'utf-8').trim()
          this.xLog('OpenAI API key loaded from user data folder')
        }
      } catch (error) {
        console.error('Error reading API key from file:', error)
      }
    }

    if (!key) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable, pass it to initialize(), or place it in openai-key.txt in the app user data folder'
      )
    }

    this.client = new OpenAI({ apiKey: key })
    this.isInitialized = true
    this.xLog('OpenAI embedding service initialized')
  }

  // Generate embedding for text using OpenAI's text-embedding-3-small model
  async embed(text: string): Promise<number[]> {
    if (!this.client) throw new Error('Service not initialized')

    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    })

    return response.data[0].embedding
  }

  // Calculate similarity between vectors
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    // Calculate dot product and magnitudes
    let dotProduct = 0
    let magA = 0
    let magB = 0

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i]
      magA += vecA[i] * vecA[i]
      magB += vecB[i] * vecB[i]
    }

    magA = Math.sqrt(magA)
    magB = Math.sqrt(magB)

    if (magA === 0 || magB === 0) return 0

    return dotProduct / (magA * magB)
  }
}
