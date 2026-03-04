import { resolveResource } from '@tauri-apps/api/path'
import * as fs from '@tauri-apps/plugin-fs'
import i18n, { LanguageDetectorAsyncModule } from 'i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next/initReactI18next'

const LanguageDetector: LanguageDetectorAsyncModule = {
	type: 'languageDetector',
	async: true,
	detect: (callback) => {
		callback('pt-BR')
	},
}

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.use(
		resourcesToBackend(async (language: string) => {
			if (language !== 'pt-BR') return
			const resourcePath = `./locales/${language}`
			const languageDirectory = await resolveResource(resourcePath)
			const files = await fs.readDir(languageDirectory)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const translations: any = {}
			await Promise.all(
				files.map(async (file) => {
					const filePath = `${languageDirectory}/${file.name}`
					const namespace = file.name.replace('.json', '')
					const content = await fs.readTextFile(filePath)
					translations[namespace] = JSON.parse(content)
				}),
			)
			return translations
		}),
	)
	.init({
		debug: false,
		fallbackLng: 'pt-BR',
		interpolation: {
			escapeValue: false,
		},
	})

export default i18n
