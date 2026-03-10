import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { basename, extname, join, dirname } from '@tauri-apps/api/path'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { asText } from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/Preference'
import { toast } from 'sonner'

export type WatchStatus = 'idle' | 'watching' | 'paused'
export type FileStatus = 'queued' | 'downloading' | 'transcribing' | 'done' | 'error' | 'skipped'

export type OutputMode = 'subfolder' | 'fixed'

export interface MonitoredFile {
	path: string
	name: string
	size: number
	status: FileStatus
	progress?: number
	outputPath?: string
	errorMessage?: string
	startedAt?: number
}

export interface WatchPair {
	id: string
	sourceFolder: string
	outputMode: OutputMode
	outputFolder: string // used when outputMode === 'fixed'; ignored for 'subfolder'
	label: string
	durationMinutes: number | null // null = continuous
	timeoutMinutes: number // max time per file before skip
}

// Runtime state kept in memory (not persisted)
export interface PairRuntime {
	status: WatchStatus
	queue: MonitoredFile[]
	isTranscribing: boolean
	totalDone: number
	totalError: number
	totalSkipped: number
	timerEndsAt: number | null
	timeRemainingSeconds: number | null
}

export interface LogEntry {
	timestamp: string
	file: string
	size: number
	status: 'done' | 'error' | 'skipped'
	outputPath?: string
	errorMessage?: string
	durationSeconds?: number
	pairLabel: string
}

function generateId() {
	return Math.random().toString(36).slice(2, 10)
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

// Build output filename: [VideoName]_[SizeBytes].txt
function buildOutputFilename(videoName: string, ext: string, fileSize: number): string {
	const base = videoName.slice(0, -(ext.length + 1))
	return `${base}_${fileSize}.txt`
}

// Persistent log file (JSONL) stored alongside app data
const LOG_STORAGE_KEY = 'ta_transcription_log'
const QUEUE_STORAGE_KEY = 'ta_pending_queue'

function readLog(): LogEntry[] {
	try {
		const raw = localStorage.getItem(LOG_STORAGE_KEY)
		return raw ? JSON.parse(raw) : []
	} catch { return [] }
}

function appendLog(entry: LogEntry) {
	const log = readLog()
	log.push(entry)
	// Keep last 5000 entries
	const trimmed = log.length > 5000 ? log.slice(-5000) : log
	localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(trimmed))
}

function savePendingQueue(pairs: Record<string, MonitoredFile[]>) {
	try {
		const pending: Record<string, Array<{ path: string; name: string; size: number }>> = {}
		for (const [id, files] of Object.entries(pairs)) {
			const queued = files.filter(f => f.status === 'queued')
			if (queued.length > 0) {
				pending[id] = queued.map(f => ({ path: f.path, name: f.name, size: f.size }))
			}
		}
		localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(pending))
	} catch {}
}

function loadPendingQueue(): Record<string, Array<{ path: string; name: string; size: number }>> {
	try {
		const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
		return raw ? JSON.parse(raw) : {}
	} catch { return {} }
}

function clearPendingQueue() {
	localStorage.removeItem(QUEUE_STORAGE_KEY)
}

export function useTranscriptionLog() {
	const [log, setLog] = useState<LogEntry[]>(readLog)

	const refresh = useCallback(() => {
		setLog(readLog())
	}, [])

	const clear = useCallback(() => {
		localStorage.removeItem(LOG_STORAGE_KEY)
		setLog([])
	}, [])

	return { log, refresh, clear }
}

export function useMonitorViewModel() {
	const preference = usePreferenceProvider()

	const [pairs, setPairs] = useLocalStorage<WatchPair[]>('ta_monitor_pairs', [])

	const [runtimes, setRuntimes] = useState<Record<string, PairRuntime>>({})

	const runtimesRef = useRef(runtimes)
	const pairsRef = useRef(pairs)
	useEffect(() => { runtimesRef.current = runtimes }, [runtimes])
	useEffect(() => { pairsRef.current = pairs }, [pairs])

	// Initialize runtime for each persisted pair on mount
	useEffect(() => {
		setRuntimes((prev) => {
			const next = { ...prev }
			for (const pair of pairs) {
				if (!next[pair.id]) {
					next[pair.id] = {
						status: 'idle',
						queue: [],
						isTranscribing: false,
						totalDone: 0,
						totalError: 0,
						totalSkipped: 0,
						timerEndsAt: null,
						timeRemainingSeconds: null,
					}
				}
			}
			return next
		})
	}, [pairs.map((p) => p.id).join(',')])

	// Restore pending queue from disk on mount
	useEffect(() => {
		const pending = loadPendingQueue()
		if (Object.keys(pending).length === 0) return
		setRuntimes((prev) => {
			const next = { ...prev }
			for (const [id, files] of Object.entries(pending)) {
				if (!next[id]) continue
				const existingPaths = new Set(next[id].queue.map(f => f.path))
				const newFiles: MonitoredFile[] = files
					.filter(f => !existingPaths.has(f.path))
					.map(f => ({ ...f, status: 'queued' as FileStatus }))
				if (newFiles.length > 0) {
					next[id] = { ...next[id], queue: [...next[id].queue, ...newFiles] }
				}
			}
			return next
		})
		clearPendingQueue()
		// Trigger processing for each pair that got files restored
		for (const id of Object.keys(pending)) {
			setTimeout(() => processQueue(id), 500)
		}
	}, [])

	// Persist pending queue periodically
	useEffect(() => {
		const interval = setInterval(() => {
			const queueMap: Record<string, MonitoredFile[]> = {}
			for (const [id, rt] of Object.entries(runtimesRef.current)) {
				queueMap[id] = rt.queue
			}
			savePendingQueue(queueMap)
		}, 5000)
		return () => clearInterval(interval)
	}, [])

	// Timer tick — updates countdown, auto-stops expired watchers, checks timeouts
	useEffect(() => {
		const interval = setInterval(() => {
			const now = Date.now()
			setRuntimes((prev) => {
				const next = { ...prev }
				let changed = false
				for (const id of Object.keys(next)) {
					const rt = next[id]

					// Timer expiration
					if (rt.status === 'watching' && rt.timerEndsAt !== null) {
						const remaining = Math.max(0, Math.ceil((rt.timerEndsAt - now) / 1000))
						if (remaining !== rt.timeRemainingSeconds) {
							next[id] = { ...rt, timeRemainingSeconds: remaining }
							changed = true
						}
						if (remaining === 0) {
							invoke('stop_watch_folder', { watchId: id }).catch(() => {})
							next[id] = { ...next[id], status: 'idle', timerEndsAt: null, timeRemainingSeconds: null }
							changed = true
						}
					}

					// Timeout check for currently transcribing file
					if (rt.isTranscribing) {
						const pair = pairsRef.current.find(p => p.id === id)
						const timeoutMs = (pair?.timeoutMinutes ?? 30) * 60 * 1000
						const transcribingFile = rt.queue.find(f => f.status === 'transcribing')
						if (transcribingFile?.startedAt && (now - transcribingFile.startedAt > timeoutMs)) {
							const updatedQueue = rt.queue.map(f =>
								f.path === transcribingFile.path
									? { ...f, status: 'skipped' as FileStatus, errorMessage: `Timeout (>${pair?.timeoutMinutes ?? 30}min)` }
									: f
							)
							next[id] = {
								...next[id],
								isTranscribing: false,
								totalSkipped: (next[id].totalSkipped || 0) + 1,
								queue: updatedQueue,
							}
							changed = true
							appendLog({
								timestamp: new Date().toISOString(),
								file: transcribingFile.name,
								size: transcribingFile.size,
								status: 'skipped',
								errorMessage: `Timeout (>${pair?.timeoutMinutes ?? 30}min)`,
								pairLabel: pair?.label ?? id,
							})
							setTimeout(() => processQueue(id), 200)
						}
					}
				}
				return changed ? next : prev
			})
		}, 1000)
		return () => clearInterval(interval)
	}, [])

	// Listen to transcribe_progress globally
	useEffect(() => {
		let unlisten: (() => void) | null = null
		listen<number>('transcribe_progress', (event) => {
			const value = event.payload
			if (value >= 0 && value <= 100) {
				setRuntimes((prev) => {
					const next = { ...prev }
					for (const id of Object.keys(next)) {
						const rt = next[id]
						if (!rt.isTranscribing) continue
						const idx = rt.queue.findIndex((f) => f.status === 'transcribing')
						if (idx === -1) continue
						const updatedQueue = [...rt.queue]
						updatedQueue[idx] = { ...updatedQueue[idx], progress: value }
						next[id] = { ...rt, queue: updatedQueue }
					}
					return next
				})
			}
		}).then((fn) => { unlisten = fn })
		return () => { unlisten?.() }
	}, [])

	// Listen for cloud file download events (Google Drive / OneDrive placeholders)
	useEffect(() => {
		let unlistenDownloading: (() => void) | null = null
		let unlistenDownloaded: (() => void) | null = null
		let unlistenFailed: (() => void) | null = null

		listen<string>('cloud_file_downloading', (event) => {
			const filePath = event.payload
			setRuntimes((prev) => {
				const next = { ...prev }
				for (const id of Object.keys(next)) {
					const rt = next[id]
					const idx = rt.queue.findIndex((f) => f.path === filePath && f.status === 'transcribing')
					if (idx !== -1) {
						const updatedQueue = [...rt.queue]
						updatedQueue[idx] = { ...updatedQueue[idx], status: 'downloading' as FileStatus }
						next[id] = { ...rt, queue: updatedQueue }
					}
				}
				return next
			})
		}).then((fn) => { unlistenDownloading = fn })

		listen<string>('cloud_file_downloaded', (event) => {
			const filePath = event.payload
			setRuntimes((prev) => {
				const next = { ...prev }
				for (const id of Object.keys(next)) {
					const rt = next[id]
					const idx = rt.queue.findIndex((f) => f.path === filePath && f.status === 'downloading')
					if (idx !== -1) {
						const updatedQueue = [...rt.queue]
						updatedQueue[idx] = { ...updatedQueue[idx], status: 'transcribing' as FileStatus }
						next[id] = { ...rt, queue: updatedQueue }
					}
				}
				return next
			})
		}).then((fn) => { unlistenDownloaded = fn })

		listen<string>('cloud_file_download_failed', (event) => {
			toast.error(`Falha ao baixar arquivo da nuvem: ${event.payload}`)
		}).then((fn) => { unlistenFailed = fn })

		return () => {
			unlistenDownloading?.()
			unlistenDownloaded?.()
			unlistenFailed?.()
		}
	}, [])

	// Listen for video_detected events from Rust
	useEffect(() => {
		let unlisten: (() => void) | null = null
		listen<{ watch_id: string; path: string; size: number }>('video_detected', async (event) => {
			const { watch_id, path, size } = event.payload
			const name = await basename(path)
			enqueueFile(watch_id, { path, name, size, status: 'queued' })
		}).then((fn) => { unlisten = fn })
		return () => { unlisten?.() }
	}, [])

	function enqueueFile(pairId: string, file: MonitoredFile) {
		setRuntimes((prev) => {
			const rt = prev[pairId]
			if (!rt) return prev
			if (rt.queue.some((f) => f.path === file.path)) return prev
			return { ...prev, [pairId]: { ...rt, queue: [...rt.queue, file] } }
		})
		setTimeout(() => processQueue(pairId), 100)
	}

	async function getOutputPath(pair: WatchPair, file: MonitoredFile): Promise<string> {
		const ext = await extname(file.path)
		const outputFilename = buildOutputFilename(file.name, ext, file.size)

		if (pair.outputMode === 'subfolder') {
			const videoDir = await dirname(file.path)
			const subfolderPath = await join(videoDir, 'Transcrição')
			try { await fs.mkdir(subfolderPath, { recursive: true }) } catch {}
			return join(subfolderPath, outputFilename)
		} else {
			try { await fs.mkdir(pair.outputFolder, { recursive: true }) } catch {}
			return join(pair.outputFolder, outputFilename)
		}
	}

	async function processQueue(pairId: string) {
		const rt = runtimesRef.current[pairId]
		if (!rt || rt.isTranscribing) return

		const nextFileIdx = rt.queue.findIndex((f) => f.status === 'queued')
		if (nextFileIdx === -1) return

		const file = rt.queue[nextFileIdx]
		const pair = pairsRef.current.find((p) => p.id === pairId)
		if (!pair) return

		if (!preference.modelPath) {
			toast.error('Nenhum modelo selecionado. Configure um modelo nas Configurações.')
			return
		}

		const startedAt = Date.now()
		setRuntimes((prev) => {
			const cur = prev[pairId]
			const updatedQueue = [...cur.queue]
			updatedQueue[nextFileIdx] = { ...file, status: 'transcribing', progress: 0, startedAt }
			return { ...prev, [pairId]: { ...cur, isTranscribing: true, queue: updatedQueue } }
		})

		try {
			await invoke('load_model', { modelPath: preference.modelPath, gpuDevice: preference.gpuDevice })

			const options = { path: file.path, ...preference.modelOptions, lang: 'pt' }

			const res: { segments: Array<{ start: number; stop: number; text: string }> } = await invoke('transcribe', { options })

			const outputPath = await getOutputPath(pair, file)

			await fs.writeTextFile(outputPath, asText(res.segments, ''))

			const durationSeconds = Math.round((Date.now() - startedAt) / 1000)

			setRuntimes((prev) => {
				const cur = prev[pairId]
				const updatedQueue = cur.queue.map((f) =>
					f.path === file.path ? { ...f, status: 'done' as FileStatus, progress: 100, outputPath } : f
				)
				return { ...prev, [pairId]: { ...cur, isTranscribing: false, totalDone: cur.totalDone + 1, queue: updatedQueue } }
			})

			appendLog({
				timestamp: new Date().toISOString(),
				file: file.name,
				size: file.size,
				status: 'done',
				outputPath,
				durationSeconds,
				pairLabel: pair.label,
			})
		} catch (error) {
			const errorMsg = String(error)
			const durationSeconds = Math.round((Date.now() - startedAt) / 1000)

			setRuntimes((prev) => {
				const cur = prev[pairId]
				const updatedQueue = cur.queue.map((f) =>
					f.path === file.path ? { ...f, status: 'error' as FileStatus, errorMessage: errorMsg } : f
				)
				return { ...prev, [pairId]: { ...cur, isTranscribing: false, totalError: cur.totalError + 1, queue: updatedQueue } }
			})

			appendLog({
				timestamp: new Date().toISOString(),
				file: file.name,
				size: file.size,
				status: 'error',
				errorMessage: errorMsg,
				durationSeconds,
				pairLabel: pair.label,
			})
		}

		setTimeout(() => processQueue(pairId), 200)
	}

	async function addPair() {
		const sourceFolder = await openDialog({ directory: true, multiple: false, title: 'Selecione a pasta de vídeos (MP4, MOV, M4V)' })
		if (!sourceFolder) return

		// Ask user: subfolder mode or fixed path?
		const useFixedPath = await openDialog({
			directory: true,
			multiple: false,
			title: 'Selecione pasta fixa para transcrições (ou CANCELE para salvar ao lado do vídeo em /Transcrição)',
		})

		const outputMode: OutputMode = useFixedPath ? 'fixed' : 'subfolder'
		const outputFolder = useFixedPath ? (useFixedPath as string) : ''

		const id = generateId()
		const label = `Monitor ${pairs.length + 1}`
		const newPair: WatchPair = {
			id,
			sourceFolder: sourceFolder as string,
			outputMode,
			outputFolder,
			label,
			durationMinutes: null,
			timeoutMinutes: 30,
		}

		setPairs((prev) => [...prev, newPair])
		setRuntimes((prev) => ({
			...prev,
			[id]: { status: 'idle', queue: [], isTranscribing: false, totalDone: 0, totalError: 0, totalSkipped: 0, timerEndsAt: null, timeRemainingSeconds: null },
		}))
	}

	async function removePair(id: string) {
		const rt = runtimesRef.current[id]
		if (rt?.status === 'watching' || rt?.status === 'paused') {
			await invoke('stop_watch_folder', { watchId: id }).catch(() => {})
		}
		setPairs((prev) => prev.filter((p) => p.id !== id))
		setRuntimes((prev) => {
			const next = { ...prev }
			delete next[id]
			return next
		})
	}

	function setDuration(id: string, minutes: number | null) {
		setPairs((prev) => prev.map((p) => (p.id === id ? { ...p, durationMinutes: minutes } : p)))
	}

	function setTimeout_minutes(id: string, minutes: number) {
		setPairs((prev) => prev.map((p) => (p.id === id ? { ...p, timeoutMinutes: minutes } : p)))
	}

	async function startWatching(id: string) {
		const pair = pairsRef.current.find((p) => p.id === id)
		if (!pair) return
		try {
			await invoke('start_watch_folder', { watchId: id, folder: pair.sourceFolder })
			const timerEndsAt = pair.durationMinutes ? Date.now() + pair.durationMinutes * 60 * 1000 : null
			const timeRemainingSeconds = pair.durationMinutes ? pair.durationMinutes * 60 : null
			setRuntimes((prev) => ({ ...prev, [id]: { ...prev[id], status: 'watching', timerEndsAt, timeRemainingSeconds } }))
		} catch (e) {
			toast.error(`Erro ao iniciar monitoramento: ${e}`)
		}
	}

	async function stopWatching(id: string) {
		try { await invoke('stop_watch_folder', { watchId: id }) } catch {}
		setRuntimes((prev) => ({ ...prev, [id]: { ...prev[id], status: 'idle', timerEndsAt: null, timeRemainingSeconds: null } }))
	}

	async function pauseWatching(id: string) {
		try { await invoke('pause_watch_folder', { watchId: id }) } catch {}
		setRuntimes((prev) => ({ ...prev, [id]: { ...prev[id], status: 'paused' } }))
	}

	async function resumeWatching(id: string) {
		try { await invoke('resume_watch_folder', { watchId: id }) } catch {}
		setRuntimes((prev) => ({ ...prev, [id]: { ...prev[id], status: 'watching' } }))
	}

	async function runNow(id: string) {
		const pair = pairsRef.current.find((p) => p.id === id)
		if (!pair) return
		try {
			const files: string[] = await invoke('scan_folder_videos', { folder: pair.sourceFolder })
			if (files.length === 0) {
				toast.info('Nenhum vídeo encontrado na pasta de origem (.mp4, .mov, .m4v)')
				return
			}
			for (const path of files) {
				const name = await basename(path)
				// Get file size via Rust metadata or estimate
				let size = 0
				try {
					const stat = await fs.stat(path)
					size = stat.size
				} catch {}
				enqueueFile(id, { path, name, size, status: 'queued' })
			}
			toast.success(`${files.length} vídeo(s) adicionado(s) à fila.`)
		} catch (e) {
			toast.error(`Erro ao escanear pasta: ${e}`)
		}
	}

	function clearDone(id: string) {
		setRuntimes((prev) => {
			const cur = prev[id]
			if (!cur) return prev
			return { ...prev, [id]: { ...cur, queue: cur.queue.filter((f) => f.status !== 'done' && f.status !== 'error' && f.status !== 'skipped') } }
		})
	}

	function getRuntime(id: string): PairRuntime {
		return runtimes[id] ?? {
			status: 'idle', queue: [], isTranscribing: false, totalDone: 0, totalError: 0, totalSkipped: 0,
			timerEndsAt: null, timeRemainingSeconds: null,
		}
	}

	return {
		pairs, addPair, removePair, setDuration, setTimeout_minutes,
		startWatching, stopWatching, pauseWatching, resumeWatching,
		runNow, clearDone, getRuntime, formatSize,
	}
}
