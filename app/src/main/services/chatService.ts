import { app } from 'electron'
import OpenAI from 'openai'
import * as fs from 'fs'
import * as path from 'path'

export const getLlmResponse = async (input: string): Promise<string> => {
  let key: string = ''
  const userDataPath = app.getPath('userData')
  const keyFilePath = path.join(userDataPath, 'openai-key.txt')
  if (fs.existsSync(keyFilePath)) {
    key = fs.readFileSync(keyFilePath, 'utf-8').trim()
  }

  const client = new OpenAI({ apiKey: key })

  return (
    await client.responses.create({
      model: 'gpt-5.1',
      input
    })
  ).output_text
}
