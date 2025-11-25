import fs from 'fs'
import path from 'path'
import { parseDocx, parsePdf, parseTxt, parseXls } from './services/documentParser'
import { EmbeddingService } from './services/embeddingService'
import { VectorStore } from './services/vectorStore'
import { randomUUID } from 'crypto'
import { dialog } from 'electron'
import { getLlmResponse } from './services/chatService'

export const ipcHandlers = (
  ipcMain: Electron.IpcMain,
  embeddingService: EmbeddingService,
  vectorService: VectorStore,
  xLog: (message: string) => void
): void => {
  // Add this: Folder selection handler
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  // Create IPC handler for indexing a folder
  ipcMain.handle('index-folder', async (_: Electron.IpcMainInvokeEvent, folderPath: string) => {
    // 1. Scan folder for files
    xLog(`Indexing folder: ${folderPath}`)
    const files = fs.readdirSync(folderPath).map((file) => path.join(folderPath, file))
    xLog(`Found files: ${files.join(', ')}`)
    // 2. Parse each file
    const processedFiles = [] as {
      name: string
      extension: string
      filePath: string
      content: string
      contentChunks: string[]
    }[]
    const errors: string[] = []
    for (const filePath of files) {
      try {
        // Skip directories
        const stats = fs.statSync(filePath)
        if (stats.isDirectory()) {
          xLog(`Skipping directory: ${filePath}`)
          continue
        }
        // Parse contents to string
        let content: string | string[] = ''
        const extension = path.extname(filePath).toLowerCase()
        switch (extension) {
          case '.docx':
            content = await parseDocx(filePath)
            break
          case '.xlsx':
            content = parseXls(filePath)
            break
          case '.pdf':
            content = await parsePdf(filePath)
            break
          // Default to txt parser for unknown types
          default:
            content = parseTxt(filePath)
            break
        }

        xLog(`Parsed ${path.basename(filePath)}: ${content.length} characters`)

        // Chunk contents
        const words = content.split(/\s+/)
        const chunkSize = 500 // words
        const overlap = 50 // words
        const chunks: string[] = []
        for (let i = 0; i < words.length; i += chunkSize - overlap) {
          const chunk = words.slice(i, i + chunkSize).join(' ')
          if (chunk.trim().length > 0) {
            chunks.push(chunk.trim())
          }
        }

        xLog(`Created ${chunks.length} chunks for ${path.basename(filePath)}`)

        if (chunks.length === 0) {
          xLog(`WARNING: No chunks created for ${path.basename(filePath)} - content may be empty`)
          errors.push(`No content extracted from ${path.basename(filePath)}`)
          continue
        }

        processedFiles.push({
          name: path.basename(filePath),
          extension: path.extname(filePath),
          filePath,
          content,
          contentChunks: chunks
        })
      } catch (err) {
        console.error(`Error processing file ${filePath}:`, err)
        errors.push(`Error processing file ${filePath}: ${err}`)
      }
    }
    // 3. Generate embeddings
    const fileEmbeddings = [] as {
      text: string
      embedding: number[]
      source: string
      extension: string
      filePath: string
      chunkIndex: number
    }[]
    for (const { contentChunks, name, extension, filePath } of processedFiles) {
      try {
        xLog(`Generating embeddings for file: ${name}`)
        let chunkIndex = 0
        for (const chunk of contentChunks) {
          try {
            xLog(`Embedding chunk ${chunkIndex}/${contentChunks.length}`)
            const embedding = await embeddingService.embed(chunk)
            fileEmbeddings.push({
              text: chunk,
              embedding,
              source: name,
              extension,
              filePath,
              chunkIndex
            })
            chunkIndex++
          } catch (err) {
            console.error(`Error embedding chunk ${chunkIndex} of file ${name}:`, err)
            errors.push(`Error embedding chunk ${chunkIndex} of file ${name}: ${err}`)
          }
        }
      } catch (err) {
        console.error(`Error generating embeddings for file ${name}:`, err)
        errors.push(`Error generating embeddings for file ${name}: ${err}`)
      }
    }
    xLog(`Generated embeddings for ${fileEmbeddings.length} chunks`)

    // 4. Store in vector database
    xLog('Storing embeddings in vector store...')
    try {
      await vectorService.addDocuments(
        fileEmbeddings.map(({ text, embedding, source, extension, filePath, chunkIndex }) => ({
          id: randomUUID(),
          text,
          embedding: embedding,
          metadata: {
            source,
            fileName: source,
            extension,
            folderPath: path.dirname(filePath),
            chunkIndex,
            timestamp: new Date().toISOString()
          }
        }))
      )
    } catch (err) {
      console.error('Error storing embeddings in vector store:', err)
      errors.push(`Error storing embeddings in vector store: ${err}`)
    }
    xLog('Embeddings stored successfully')

    return { filesAdded: fileEmbeddings.length, errors: errors }
  })

  // Search functionality
  ipcMain.handle('search', async (_: Electron.IpcMainInvokeEvent, query: string) => {
    xLog(`Searching for query: ${query}`)
    try {
      xLog('Generating embedding for query...')
      const queryEmbedding = await embeddingService.embed(query)
      xLog('Performing search in vector store...')
      const searchResponse = await vectorService.search(queryEmbedding, 10)
      const results = searchResponse.results
      xLog(`Search returned ${results.length} results`)
      if (results.length > 0) {
        xLog(`Top result: ${JSON.stringify(results[0]).slice(0, 100)}...`)
      }

      // Add file preview data to each result
      const enrichedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const filePath = path.join(result.metadata.folderPath, result.metadata.fileName)
            if (fs.existsSync(filePath)) {
              const buffer = fs.readFileSync(filePath)
              return {
                ...result,
                preview: {
                  buffer: Array.from(buffer),
                  extension: result.metadata.extension
                }
              }
            }
          } catch (err) {
            console.error(`Error loading preview for ${result.metadata.fileName}:`, err)
          }
          return result
        })
      )

      // Summarise
      console.log('Generating summary with LLM...')
      const systemPrompt = `You are a retrieval-augmented generation (RAG) assistant. Use the provided context to answer the user's query accurately and concisely, or explain the context of the search terms, such as which files they are found in, how many files, the degree of confidence etc. Do NOT engage in chat, request information, or assume the user can have any two-way dialog with you at all. Do not just list al the files, make a short and meaningful sentence or two about the search and its context. Do not use any formatting.`
      const userQuery = `The user asked for: "${query}"`
      const searchResults =
        'Here are the relevant RAG search results:\n' +
        enrichedResults.map((d) => `${d.metadata.fileName} (${d.score}% match): ${d.text}`).join()
      const summary = await getLlmResponse(`${systemPrompt} \n ${userQuery} \n ${searchResults}`)
      console.log('Got LLM summary')

      xLog(`Returning results to renderer: ${enrichedResults.length} items`)
      return { results: enrichedResults, summary }
    } catch (err) {
      console.error('Error during search:', err)
      throw err
    }
  })

  // Get stats
  ipcMain.handle('get-stats', async () => vectorService.getStats())

  // Remove file
  ipcMain.handle(
    'remove-file',
    async (_: Electron.IpcMainInvokeEvent, fileName: string, folderPath: string) =>
      vectorService.removeFile(fileName, folderPath)
  )
}
