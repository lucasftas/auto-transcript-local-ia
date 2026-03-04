import { Route, Routes } from 'react-router-dom'
import '~/globals.css'
import '~/lib/i18n'
import SetupPage from '~/pages/setup/Page'
import MonitorPage from './pages/monitor/Page'
import { ErrorModalProvider } from './providers/ErrorModal'
import { PreferenceProvider } from './providers/Preference'
import { ErrorBoundary } from 'react-error-boundary'
import { BoundaryFallback } from './components/BoundaryFallback'
import ErrorModalWithContext from './components/ErrorModalWithContext'
import { ToastProvider } from './providers/Toast'
import { Toaster } from '~/components/ui/sonner'
import { TooltipProvider } from '~/components/ui/tooltip'

export default function App() {
	return (
		<ErrorBoundary FallbackComponent={BoundaryFallback}>
			<ErrorModalProvider>
				<PreferenceProvider>
					<TooltipProvider>
						<ToastProvider>
							<ErrorModalWithContext />
							<Routes>
								<Route path="/" element={<MonitorPage />} />
								<Route path="/setup" element={<SetupPage />} />
							</Routes>
							<Toaster position="bottom-right" />
						</ToastProvider>
					</TooltipProvider>
				</PreferenceProvider>
			</ErrorModalProvider>
		</ErrorBoundary>
	)
}
