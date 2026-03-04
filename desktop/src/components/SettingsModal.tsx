import { useEffect } from 'react'
import { ModifyState } from '~/lib/utils'
import SettingsPage from '~/pages/settings/Page'

interface SettingsModalProps {
	visible: boolean
	setVisible: ModifyState<boolean>
}

export default function SettingsModal({ visible, setVisible }: SettingsModalProps) {
	useEffect(() => {
		if (!visible) return

		const prevBodyOverflow = document.body.style.overflow
		const prevHtmlOverflow = document.documentElement.style.overflow
		document.body.style.overflow = 'hidden'
		document.documentElement.style.overflow = 'hidden'

		return () => {
			document.body.style.overflow = prevBodyOverflow
			document.documentElement.style.overflow = prevHtmlOverflow
		}
	}, [visible])

	if (!visible) return null

	return (
		<div style={{ position: 'fixed', inset: 0, zIndex: 500, overflowY: 'auto' }}>
			<SettingsPage setVisible={setVisible} />
		</div>
	)
}
