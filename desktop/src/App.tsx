import { Route, Routes, Navigate } from 'react-router-dom'
import '~/globals.css'
import '~/lib/i18n'
import SetupPage from '~/pages/setup/Page'
import MonitorPage from './pages/monitor/Page'
import { ErrorModalProvider } from './providers/ErrorModal'
import { PreferenceProvider, usePreferenceProvider } from './providers/Preference'
import { ErrorBoundary } from 'react-error-boundary'
import { BoundaryFallback } from './components/BoundaryFallback'
import ErrorModalWithContext from './components/ErrorModalWithContext'
import { ToastProvider } from './providers/Toast'
import { Toaster } from '~/components/ui/sonner'
import { TooltipProvider } from '~/components/ui/tooltip'

function AppRoutes() {
	const preference = usePreferenceProvider()
	const needsSetup = !preference.modelPath && !preference.skippedSetup

	return (
		<Routes>
			<Route path="/" element={needsSetup ? <Navigate to="/setup" replace /> : <MonitorPage />} />
			<Route path="/setup" element={<SetupPage />} />
		</Routes>
	)
}

export default function App() {
	return (
		<ErrorBoundary FallbackComponent={BoundaryFallback}>
			<ErrorModalProvider>
				<PreferenceProvider>
					<TooltipProvider>
						<ToastProvider>
							<ErrorModalWithContext />
							<AppRoutes />
							<Toaster position="bottom-right" />
						</ToastProvider>
					</TooltipProvider>
				</PreferenceProvider>
			</ErrorModalProvider>
		</ErrorBoundary>
	)
}
