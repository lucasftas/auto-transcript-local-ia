import { ReactNode, createContext, useContext } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { ModifyState } from '~/lib/utils'

export interface ModelOptions {
	lang: string
	verbose: boolean
	n_threads?: number
	init_prompt?: string
	temperature?: number
	translate?: boolean
	max_text_ctx?: number
	word_timestamps?: boolean
	max_sentence_len?: number
	sampling_strategy: 'greedy' | 'beam search'
	best_of?: number
	beam_size?: number
}

export interface Preference {
	modelPath: string | null
	setModelPath: ModifyState<string | null>
	modelOptions: ModelOptions
	setModelOptions: ModifyState<ModelOptions>
	gpuDevice: number | null
	setGpuDevice: ModifyState<number | null>
	skippedSetup: boolean
	setSkippedSetup: ModifyState<boolean>
	defaultSourceFolder: string | null
	setDefaultSourceFolder: ModifyState<string | null>
	defaultOutputFolder: string | null
	setDefaultOutputFolder: ModifyState<string | null>
	resetOptions: () => void
}

const PreferenceContext = createContext<Preference | null>(null)

export function usePreferenceProvider() {
	return useContext(PreferenceContext) as Preference
}

const defaultModelOptions: ModelOptions = {
	init_prompt: '',
	verbose: false,
	lang: 'pt',
	n_threads: 4,
	temperature: 0.4,
	max_text_ctx: undefined,
	word_timestamps: false,
	max_sentence_len: 1,
	sampling_strategy: 'beam search',
	best_of: 5,
	beam_size: 5,
}

export function PreferenceProvider({ children }: { children: ReactNode }) {
	const [modelPath, setModelPath] = useLocalStorage<string | null>('prefs_model_path', null)
	const [modelOptions, setModelOptions] = useLocalStorage<ModelOptions>('prefs_modal_args', defaultModelOptions)
	const [gpuDevice, setGpuDevice] = useLocalStorage<number | null>('prefs_gpu_device', null)
	const [skippedSetup, setSkippedSetup] = useLocalStorage<boolean>('prefs_skipped_setup', false)
	const [defaultSourceFolder, setDefaultSourceFolder] = useLocalStorage<string | null>('prefs_default_source_folder', null)
	const [defaultOutputFolder, setDefaultOutputFolder] = useLocalStorage<string | null>('prefs_default_output_folder', null)

	function resetOptions() {
		setModelOptions(defaultModelOptions)
	}

	const preference: Preference = {
		modelPath,
		setModelPath,
		modelOptions,
		setModelOptions,
		gpuDevice,
		setGpuDevice,
		skippedSetup,
		setSkippedSetup,
		defaultSourceFolder,
		setDefaultSourceFolder,
		defaultOutputFolder,
		setDefaultOutputFolder,
		resetOptions,
	}

	return <PreferenceContext.Provider value={preference}>{children}</PreferenceContext.Provider>
}
