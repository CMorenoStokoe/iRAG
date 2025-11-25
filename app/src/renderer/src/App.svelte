<script lang="ts">
  import { onMount } from 'svelte'

  // States
  $: stats = { totalChunks: 0, totalFolders: 0, folders: [], files: [] } as {
    totalChunks: number
    totalFolders: number
    folders: string[]
    files: Array<{ fileName: string; folderPath: string }>
  }
  let errors = []
  let successes = []
  let dismissedResults = false
  let selectedFolder: string | null = null
  let indexing = false
  $: matches = {
    results: [],
    files: [],
    summary: ''
  } as {
    results: {
      text: string
      score: number
      preview?: { buffer: number[]; extension: string }
      metadata: {
        source?: string
        fileName: string
        folderPath: string
        chunkIndex: number
        timestamp: string
        extension: string
      }
    }[]
    files: {
      fileName: string
      folderPath: string
      content?: any
    }[]
    summary: string
  }
  let searchTerm = ''
  let loading = false
  let statsExpanded = true
  let logsExpanded = false
  let resultsExpanded = true
  let filesExpanded = false

  const handleRemoveFile = async (fileName: string, folderPath: string) => {
    logsExpanded = true
    try {
      await window.api.removeFile(fileName, folderPath)
      const updatedStats = await window.api.getStats()
      stats = updatedStats
      successes = [`Removed ${fileName}`]
      dismissedResults = false
    } catch (err) {
      errors = [`Failed to remove ${fileName}: ${err}`]
      errors.forEach((err) => (logs = [[new Date(), err], ...logs]))
      dismissedResults = false
    }
  }
  let logs: [Date, string][] = []

  // Handlers
  const handleSelectFolder = async () => {
    const folder = await window.api.selectFolder()
    if (folder) {
      selectedFolder = folder
    }
  }

  const handleAddFolder = async () => {
    if (!selectedFolder) {
      alert('Please select a folder first')
      return
    }

    indexing = true
    try {
      const results = await window.api.indexFolder(selectedFolder)
      console.log(`Folder add results:`, results)
      errors = results.errors
      successes = [`Indexed ${results.filesAdded} file chunks`]
      dismissedResults = false
      const updatedStats = await window.api.getStats()
      stats = updatedStats
    } catch (err) {
      errors = ['Failed to index folder: ' + err]
    } finally {
      indexing = false
    }
  }
  const handleSearch = async (message: string) => {
    loading = true
    logsExpanded = true
    console.log(`GUI: Searching for: ${message}`)
    try {
      const response: any = await window.api.search(message)
      console.log('🚀 ~ handleSearch ~ response:', response)
      matches = {
        results: response.results || response || [],
        files: [],
        summary: response.summary || ''
      }
    } catch (err) {
      console.error('Search error:', err)
      matches = { results: [], files: [], summary: '' }
    }
    loading = false
  }

  onMount(() => {
    // Start logger
    ;(window as any).ipc.on((message) => {
      console.log(message)
      const newMessage = [new Date(), message]
      logs = [newMessage, ...logs].slice(0, 1000) as any
    })
    // Initial stats fetch
    window.api.getStats().then((s) => {
      stats = s
    })
    window.electron.ipcRenderer.send('ping')
  })
</script>

<div
  class="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-auto"
>
  <!-- Header -->
  <div>
    <div class="max-w-7xl mx-auto px-6 py-2 flex items-center gap-3">
      <img src="/src/assets/logo.png" alt="iRAG Logo" class="h-12 w-12" />
      <h1
        class="text-lg font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent"
      >
        iRAG Document Search
      </h1>
    </div>
  </div>

  <div class="max-w-7xl mx-auto px-6 py-8">
    <!-- Stats Card -->
    <div
      class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 mb-8"
    >
      <button
        on:click={() => (statsExpanded = !statsExpanded)}
        class="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors rounded-t-xl"
      >
        <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span class="text-2xl">📊</span> Statistics
        </h2>
        <span class="text-2xl text-slate-500">{statsExpanded ? '▼' : '▶'}</span>
      </button>
      {#if statsExpanded}
        <div class="px-6 pb-6">
          <div class="grid grid-cols-4 gap-4 mb-6">
            <div class="text-center">
              <p class="text-3xl font-bold text-cyan-400">{stats.totalChunks}</p>
              <p class="text-sm text-slate-400 mt-1">Total Chunks</p>
            </div>
            <div class="text-center">
              <p class="text-3xl font-bold text-purple-400">{stats.totalFolders}</p>
              <p class="text-sm text-slate-400 mt-1">Folders</p>
            </div>
            <div class="text-center">
              <p class="text-3xl font-bold text-emerald-400">{stats.files.length}</p>
              <p class="text-sm text-slate-400 mt-1">Files</p>
            </div>
            <div class="text-center">
              <p class="text-3xl font-bold text-orange-400">{matches.results.length}</p>
              <p class="text-sm text-slate-400 mt-1">Results</p>
            </div>
          </div>

          <!-- Files & Folders Details -->
          <div class="border-t border-slate-700/50 pt-4">
            <button
              on:click={() => (filesExpanded = !filesExpanded)}
              class="w-full flex items-center justify-between py-2 hover:bg-slate-700/30 rounded px-3 transition-colors"
            >
              <span class="text-sm font-semibold text-slate-300">📁 View All Files & Folders</span>
              <span class="text-slate-500">{filesExpanded ? '▼' : '▶'}</span>
            </button>

            {#if filesExpanded}
              <div class="mt-4 space-y-4">
                <!-- Folders -->
                {#each stats.folders as folder}
                  <div class="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                    <div class="flex items-center gap-2 mb-3">
                      <span class="text-xl">📂</span>
                      <p class="text-sm font-semibold text-slate-200 font-mono break-all">
                        {folder}
                      </p>
                    </div>

                    <!-- Files in this folder -->
                    <div class="ml-6 space-y-2">
                      {#each stats.files.filter((f) => f.folderPath === folder) as file}
                        <div
                          class="flex items-center justify-between bg-slate-800/50 rounded p-2 border border-slate-700/50 hover:border-red-500/50 transition-colors group"
                        >
                          <div class="flex items-center gap-2 flex-1 min-w-0">
                            <span class="text-sm">📄</span>
                            <p class="text-xs text-slate-300 font-mono truncate">
                              {file.fileName}
                            </p>
                          </div>
                          <button
                            on:click={() => handleRemoveFile(file.fileName, file.folderPath)}
                            class="text-red-400 hover:text-red-300 hover:bg-red-500/20 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove file"
                          >
                            <span class="text-lg">✕</span>
                          </button>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Notifications -->
    {#if dismissedResults === false && (errors.length > 0 || successes.length > 0)}
      <div class="mb-8">
        {#each errors as error}
          <div
            class="bg-red-950/50 backdrop-blur-sm border-l-4 border-red-500 p-4 mb-3 rounded-r-lg shadow-xl"
          >
            <p class="text-red-300 font-medium">❌ {error}</p>
          </div>
        {/each}
        {#each successes as success}
          <div
            class="bg-emerald-950/50 backdrop-blur-sm border-l-4 border-emerald-500 p-4 mb-3 rounded-r-lg shadow-xl"
          >
            <p class="text-emerald-300 font-medium">✅ {success}</p>
          </div>
        {/each}
        <button
          on:click={() => (dismissedResults = true)}
          class="text-sm text-slate-400 hover:text-slate-200 underline"
        >
          Dismiss
        </button>
      </div>
    {/if}

    <!-- Action Cards -->
    <div class="grid grid-cols-2 gap-6 mb-8">
      <!-- Index Card -->
      <div
        class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl p-6 border border-slate-700/50"
      >
        <h2 class="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
          <span class="text-2xl">📁</span> Index Documents
        </h2>
        <button
          on:click={handleSelectFolder}
          class="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-3 px-4 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5"
        >
          Select Folder
        </button>
        {#if selectedFolder}
          <div class="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
            <p class="text-xs text-slate-500 mb-1">Selected:</p>
            <p class="text-sm text-slate-200 font-mono truncate">{selectedFolder}</p>
          </div>
          <button
            on:click={handleAddFolder}
            disabled={indexing}
            class="w-full mt-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-3 px-4 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {indexing ? '⏳ Indexing...' : '🚀 Index Folder'}
          </button>
        {/if}
      </div>

      <!-- Search Card -->
      <div
        class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl p-6 border border-slate-700/50"
      >
        <h2 class="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
          <span class="text-2xl">🔍</span> Search Documents
        </h2>
        <input
          bind:value={searchTerm}
          placeholder="Enter your search query..."
          class="w-full px-4 py-3 bg-slate-900/50 border-2 border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all duration-200"
        />
        <button
          on:click={() => handleSearch(searchTerm)}
          disabled={loading}
          class="w-full mt-4 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-semibold py-3 px-4 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {loading ? '⏳ Searching...' : '🔎 Search'}
        </button>
      </div>
    </div>

    <!-- Logs -->
    <div
      class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 mb-8"
    >
      <button
        on:click={() => (logsExpanded = !logsExpanded)}
        class="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors rounded-t-xl"
      >
        <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span class="text-2xl">📋</span> Logs
          <span class="text-sm font-normal text-slate-500">({logs.length} events)</span>
        </h2>
        <span class="text-2xl text-slate-500">{logsExpanded ? '▼' : '▶'}</span>
      </button>
      {#if logsExpanded || loading || indexing}
        <div class="px-6 pb-6 max-h-64 overflow-auto">
          {#each logs as [timestamp, log]}
            <div class="mb-1">
              <p class="text-xs text-slate-400 font-mono">
                <span class="text-slate-600">{timestamp.toTimeString().split(' ')[0]}:</span>
                {log}
              </p>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Results -->
    {#if matches.results.length > 0}
      <div
        class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 mb-8"
      >
        <button
          on:click={() => (resultsExpanded = !resultsExpanded)}
          class="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors rounded-t-xl"
        >
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span class="text-2xl">📄</span> Search Results
            <span class="text-sm font-normal text-slate-500">({matches.results.length} found)</span>
          </h2>
          <span class="text-2xl text-slate-500">{resultsExpanded ? '▼' : '▶'}</span>
        </button>
        {#if resultsExpanded}
          <div class="px-6 pb-6">
            <!-- Summary -->
            {#if matches.summary}
              <div
                class="bg-gradient-to-r from-cyan-900/30 to-purple-900/30 rounded-lg p-4 mb-6 border border-cyan-500/30"
              >
                <h3 class="text-sm font-semibold text-cyan-300 mb-2">🤖 AI Summary</h3>
                <p class="text-slate-200 leading-relaxed">{matches.summary}</p>
              </div>
            {/if}

            <div class="flex flex-row gap-6 overflow-x-auto pb-4">
              {#each matches.results as result, idx}
                <div
                  class="bg-slate-900/50 backdrop-blur-sm rounded-xl shadow-2xl p-6 border border-slate-700/50 min-w-[500px] max-w-[500px] shrink-0 hover:shadow-cyan-500/20 hover:border-cyan-500/50 transition-all duration-200"
                >
                  <div class="max-w-full flex justify-between items-start mb-4">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-2xl"
                          >{result.metadata.extension === '.pdf'
                            ? '📕'
                            : result.metadata.extension === '.docx'
                              ? '📘'
                              : '📄'}</span
                        >
                        <h3 class="font-bold text-lg text-slate-100 truncate text-wrap">
                          {result.metadata.fileName}
                        </h3>
                      </div>
                      <p class="text-xs text-slate-500">
                        Chunk #{result.metadata.chunkIndex + 1}
                      </p>
                    </div>
                    <div class="flex flex-col items-end gap-2">
                      <span
                        class="text-xs bg-gradient-to-r from-cyan-500 to-purple-500 text-white px-3 py-1 rounded-full font-semibold shadow-lg"
                      >
                        {(result.score * 100).toFixed(1)}% match
                      </span>
                      <span class="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-full">
                        #{idx + 1}
                      </span>
                    </div>
                  </div>

                  <div
                    class="bg-slate-950/50 rounded-lg p-4 mb-4 border border-slate-700/50 max-h-48 overflow-y-auto"
                  >
                    <p class="text-sm text-slate-300 leading-relaxed">
                      "{result.text}"
                    </p>
                  </div>

                  <p class="font-mono text-xs text-slate-500">
                    {result.metadata.folderPath}/{result.metadata.fileName}
                  </p>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
