import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { basename, extname, join } from '@tauri-apps/api/path'
import { useEffect, useRef, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { asText } from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/Preference'
import { toast } from 'sonner'

export type WatchStatus = 'idle' | 'watching' | 'paused'
export type FileStatus = 'queued' | 'transcribing' | 'done' | 'error'

export interface MonitoredFile {
	path: string
	name: string
	status: FileStatus
	progress?: number
	outputPath?: string
	errorMessage?: string
}

export interface WatchPair {
	id: string
	sourceFolder: string
	outputFolder: string
	label: string
	durationMinutes: number | null // null = contínuo
}

// Runtime state kept in memory (not persisted)
export interface PairRuntime {
	status: WatchStatus
	queue: MonitoredFile[]
	isTranscribing: boolean
	totalDone: number
	totalError: number
	timerEndsAt: number | null // timestamp ms
	timeRemainingSeconds: number | null
}

function generateId() {
	return Math.random().toString(36).slice(2, 10)
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
						timerEndsAt: null,
						timeRemainingSeconds: null,
					}
				}
			}
			return next
		})
	}, [pairs.map((p) => p.id).join(',')])

	// Timer tick — updates countdown and auto-stops expired watchers
	useEffect(() => {
		const interval = setInterval(() => {
			const now = Date.now()
			setRuntimes((prev) => {
				const next = { ...prev }
				let changed = false
				for (const id of Object.keys(next)) {
					const rt = next[id]
					if (rt.status !== 'watching' || rt.timerEndsAt === null) continue
					const remaining = Math.max(0, Math.ceil((rt.timerEndsAt - now) / 1000))
					if (remaining !== rt.timeRemainingSeconds) {
						next[id] = { ...rt, timeRemainingSeconds: remaining }
						changed = true
					}
					if (remaining === 0) {
						// Auto-stop
						invoke('stop_watch_folder', { watchId: id }).catch(() => {})
						next[id] = { ...next[id], status: 'idle', timerEndsAt: null, timeRemainingSeconds: null }
						changed = true
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

	// Listen for mp3_detected events from Rust
	useEffect(() => {
		let unlisten: (() => void) | null = null
		listen<{ watch_id: string; path: string }>('mp3_detected', async (event) => {
			const { watch_id, path } = event.payload
			const name = await basename(path)
			enqueueFile(watch_id, { path, name, status: 'queued' })
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

		setRuntimes((prev) => {
			const cur = prev[pairId]
			const updatedQueue = [...cur.queue]
			updatedQueue[nextFileIdx] = { ...file, status: 'transcribing', progress: 0 }
			return { ...prev, [pairId]: { ...cur, isTranscribing: true, queue: updatedQueue } }
		})

		try {
			await invoke('load_model', { modelPath: preference.modelPath, gpuDevice: preference.gpuDevice })

			const options = { path: file.path, ...preference.modelOptions, lang: 'pt' }

			const res: { segments: Array<{ start: number; stop: number; text: string }> } = await invoke('transcribe', { options })

			const ext = await extname(file.path)
			const base = (await basename(file.path)).slice(0, -(ext.length + 1))
			const outputPath = await join(pair.outputFolder, `${base}.txt`)

			try { await fs.mkdir(pair.outputFolder, { recursive: true }) } catch {}

			await fs.writeTextFile(outputPath, asText(res.segments, ''))

			setRuntimes((prev) => {
				const cur = prev[pairId]
				const updatedQueue = cur.queue.map((f) =>
					f.path === file.path ? { ...f, status: 'done' as FileStatus, progress: 100, outputPath } : f
				)
				return { ...prev, [pairId]: { ...cur, isTranscribing: false, totalDone: cur.totalDone + 1, queue: updatedQueue } }
			})
		} catch (error) {
			const errorMsg = String(error)
			setRuntimes((prev) => {
				const cur = prev[pairId]
				const updatedQueue = cur.queue.map((f) =>
					f.path === file.path ? { ...f, status: 'error' as FileStatus, errorMessage: errorMsg } : f
				)
				return { ...prev, [pairId]: { ...cur, isTranscribing: false, totalError: cur.totalError + 1, queue: updatedQueue } }
			})
		}

		setTimeout(() => processQueue(pairId), 200)
	}

	async function addPair() {
		const sourceFolder = await openDialog({ directory: true, multiple: false, title: 'Selecione a pasta de origem (MP3s)' })
		if (!sourceFolder) return

		const outputFolder = await openDialog({ directory: true, multiple: false, title: 'Selecione a pasta de saída (TXTs)' })
		if (!outputFolder) return

		const id = generateId()
		const label = `Monitor ${pairs.length + 1}`
		const newPair: WatchPair = {
			id,
			sourceFolder: sourceFolder as string,
			outputFolder: outputFolder as string,
			label,
			durationMinutes: null,
		}

		setPairs((prev) => [...prev, newPair])
		setRuntimes((prev) => ({
			...prev,
			[id]: { status: 'idle', queue: [], isTranscribing: false, totalDone: 0, totalError: 0, timerEndsAt: null, timeRemainingSeconds: null },
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
			const files: string[] = await invoke('scan_folder_mp3s', { folder: pair.sourceFolder })
			if (files.length === 0) {
				toast.info('Nenhum arquivo MP3 encontrado na pasta de origem.')
				return
			}
			for (const path of files) {
				const name = await basename(path)
				enqueueFile(id, { path, name, status: 'queued' })
			}
			toast.success(`${files.length} arquivo(s) adicionado(s) à fila.`)
		} catch (e) {
			toast.error(`Erro ao escanear pasta: ${e}`)
		}
	}

	function clearDone(id: string) {
		setRuntimes((prev) => {
			const cur = prev[id]
			if (!cur) return prev
			return { ...prev, [id]: { ...cur, queue: cur.queue.filter((f) => f.status !== 'done' && f.status !== 'error') } }
		})
	}

	function getRuntime(id: string): PairRuntime {
		return runtimes[id] ?? {
			status: 'idle', queue: [], isTranscribing: false, totalDone: 0, totalError: 0,
			timerEndsAt: null, timeRemainingSeconds: null,
		}
	}

	return { pairs, addPair, removePair, setDuration, startWatching, stopWatching, pauseWatching, resumeWatching, runNow, clearDone, getRuntime }
}
