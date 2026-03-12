import { invoke } from '@tauri-apps/api/core'
import { ask, open } from '@tauri-apps/plugin-dialog'
import * as shell from '@tauri-apps/plugin-shell'
import { platform } from '@tauri-apps/plugin-os'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as config from '~/lib/config'
import { NamedPath, ls, resetApp } from '~/lib/utils'
import { usePreferenceProvider } from '~/providers/Preference'
import { UnlistenFn, listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'
import { load } from '@tauri-apps/plugin-store'
import { useStoreValue } from '~/lib/useStoreValue'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { getPrettyVersion } from '~/lib/logs'

export interface GpuDevice {
	index: number
	name: string
	description: string
	type: string
}

async function openModelPath() {
	const dst = await invoke<string>('get_models_folder')
	invoke('open_path', { path: dst })
}

async function openModelsUrl() {
	shell.open(config.modelsDocURL)
}

async function revealLogs() {
	await invoke<string>('show_log_path')
}

async function revealTemp() {
	await invoke<string>('show_temp_path')
}

async function copyLogs() {
	const logs = await invoke<string>('get_logs')
	const templated = `<details>\n<summary>logs</summary>\n\n\`\`\`console\n${logs}\n\`\`\`\n</details>\n`
	clipboard.writeText(templated)
}

export function viewModel() {
	const [isLogToFileSet, setLogToFile] = useStoreValue<boolean>('prefs_log_to_file')
	const [models, setModels] = useState<NamedPath[]>([])
	const [appVersion, setAppVersion] = useState('')
	const preference = usePreferenceProvider()
	const { t } = useTranslation()
	const listenersRef = useRef<UnlistenFn[]>([])
	const [downloadURL, setDownloadURL] = useState('')
	const [gpuDevices, setGpuDevices] = useState<GpuDevice[]>([])
	const isMacOS = platform() === 'macos'
	const navigate = useNavigate()

	async function askAndReset() {
		const yes = await ask(t('common.reset-ask-dialog'), { kind: 'info' })
		if (yes) {
			resetApp()
		}
	}

	async function downloadModel() {
		if (!downloadURL) return
		navigate('/setup', { state: { downloadURL } })
	}

	async function loadMeta() {
		try {
			const prettyVersion = await getPrettyVersion()
			setAppVersion(prettyVersion)
		} catch (e) {
			console.error(e)
		}
	}

	async function loadModels() {
		const modelsFolder = await invoke<string>('get_models_folder')
		const entries = await ls(modelsFolder)
		setModels(entries.filter((e) => e.name?.endsWith('.bin')))
	}

	async function getDefaultModel() {
		if (!preference.modelPath) {
			const modelsFolder = await invoke<string>('get_models_folder')
			const files = (await ls(modelsFolder)).filter((f) => f.name.endsWith('.bin'))
			if (files.length > 0) {
				preference.setModelPath(files[0].path as string)
			}
		}
	}

	async function changeModelsFolder() {
		const path = await open({ directory: true, multiple: false })
		if (path) {
			const store = await load(config.storeFilename)
			await store.set('models_folder', path)
			await store.save()
			await loadModels()
			await getDefaultModel()
		}
	}

	async function changeDefaultSourceFolder() {
		const path = await open({ directory: true, multiple: false })
		if (path) preference.setDefaultSourceFolder(path)
	}

	async function clearDefaultSourceFolder() {
		preference.setDefaultSourceFolder(null)
	}

	async function changeDefaultOutputFolder() {
		const path = await open({ directory: true, multiple: false })
		if (path) preference.setDefaultOutputFolder(path)
	}

	async function clearDefaultOutputFolder() {
		preference.setDefaultOutputFolder(null)
	}

	async function changeTempCopyFolder() {
		const path = await open({ directory: true, multiple: false })
		if (path) preference.setTempCopyFolder(path)
	}

	function clearTempCopyFolder() {
		preference.setTempCopyFolder(null)
	}

	async function onWindowFocus() {
		listenersRef.current.push(await listen('tauri://focus', loadModels))
	}

	async function loadGpuDevices() {
		try {
			const devices = await invoke<GpuDevice[]>('get_gpu_devices')
			setGpuDevices(devices)
		} catch (error) {
			console.error(error)
			setGpuDevices([])
		}
	}

	useEffect(() => {
		loadMeta()
		loadModels()
		getDefaultModel()
		loadGpuDevices()
		onWindowFocus()
		return () => {
			listenersRef.current.forEach((unlisten) => unlisten())
		}
	}, [])

	return {
		copyLogs,
		isLogToFileSet,
		setLogToFile,
		downloadModel,
		downloadURL,
		setDownloadURL,
		preference,
		askAndReset,
		openModelPath,
		openModelsUrl,
		revealLogs,
		revealTemp,
		models,
		appVersion,
		loadModels,
		changeModelsFolder,
		gpuDevices,
		isMacOS,
		changeDefaultSourceFolder,
		clearDefaultSourceFolder,
		changeDefaultOutputFolder,
		clearDefaultOutputFolder,
		changeTempCopyFolder,
		clearTempCopyFolder,
	}
}
