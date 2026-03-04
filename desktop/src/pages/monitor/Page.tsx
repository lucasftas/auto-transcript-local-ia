import { useState } from 'react'
import { useMonitorViewModel, WatchPair, PairRuntime, FileStatus } from './viewModel'
import { Plus, Play, Pause, Square, FolderOpen, ChevronRight, Trash2, RotateCcw, CheckCircle2, AlertCircle, Clock, Loader2, Settings2 } from 'lucide-react'
import SettingsModal from '~/components/SettingsModal'

// ─── Design tokens (AME-light) ────────────────────────────────────────────────
const C = {
	appBg: '#eeeeee',
	headerBg: '#1e1e1e',
	headerText: '#d8d8d8',
	cardBg: '#ffffff',
	cardBorder: '#d4d4d4',
	cardHeaderBg: '#f4f4f4',
	cardHeaderBorder: '#d8d8d8',
	text: '#1a1a1a',
	textDim: '#5a5a5a',
	textFaint: '#999999',
	blue: '#0070d1',
	green: '#1e7a3c',
	amber: '#c98000',
	red: '#c83030',
	gray: '#888888',
} as const

// ─── Badge de status ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: PairRuntime['status'] }) {
	const cfg = {
		watching: { color: C.blue, label: 'PROCESSANDO' },
		paused: { color: C.amber, label: 'PAUSADO' },
		idle: { color: C.gray, label: 'AGUARDANDO' },
	}[status]

	return (
		<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
			<span style={{
				width: 7, height: 7, borderRadius: '50%', background: cfg.color, flexShrink: 0,
				animation: status === 'watching' ? 'pulseDot 2s ease-in-out infinite' : 'none',
			}} />
			<span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', color: cfg.color }}>
				{cfg.label}
			</span>
		</span>
	)
}

// ─── Linha de arquivo ─────────────────────────────────────────────────────────
function FileRow({ file }: { file: { path: string; name: string; status: FileStatus; progress?: number; outputPath?: string; errorMessage?: string } }) {
	const iconMap: Record<FileStatus, React.ReactNode> = {
		queued: <Clock size={12} color={C.gray} />,
		transcribing: <Loader2 size={12} color={C.blue} style={{ animation: 'spin 1s linear infinite' }} />,
		done: <CheckCircle2 size={12} color={C.green} />,
		error: <AlertCircle size={12} color={C.red} />,
	}
	const colorMap: Record<FileStatus, string> = {
		queued: C.textDim,
		transcribing: C.text,
		done: C.textDim,
		error: C.red,
	}

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${C.cardBorder}` }}>
			<span style={{ flexShrink: 0 }}>{iconMap[file.status]}</span>
			<span style={{ flex: 1, fontSize: 11, color: colorMap[file.status], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }} title={file.path}>
				{file.name}
			</span>
			{file.status === 'transcribing' && typeof file.progress === 'number' && (
				<div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
					<div style={{ width: 70, height: 3, borderRadius: 2, background: '#e0e0e0', overflow: 'hidden' }}>
						<div style={{ height: '100%', width: `${file.progress}%`, background: C.blue, borderRadius: 2, transition: 'width 0.3s ease' }} />
					</div>
					<span style={{ fontSize: 10, color: C.blue, minWidth: 28 }}>{file.progress}%</span>
				</div>
			)}
			{file.status === 'done' && file.outputPath && (
				<span style={{ fontSize: 10, color: C.green, flexShrink: 0, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.outputPath}>
					→ {file.outputPath.split(/[/\\]/).pop()}
				</span>
			)}
			{file.status === 'error' && (
				<span style={{ fontSize: 10, color: C.red, flexShrink: 0, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.errorMessage}>
					{file.errorMessage?.slice(0, 36)}…
				</span>
			)}
		</div>
	)
}

// ─── Botão ícone compacto ─────────────────────────────────────────────────────
function IconBtn({ onClick, icon, title, disabled = false }: {
	onClick: () => void; icon: React.ReactNode; title: string; disabled?: boolean
}) {
	return (
		<button onClick={onClick} disabled={disabled} title={title} style={{
			width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			borderRadius: 4, border: `1px solid ${C.cardBorder}`,
			background: disabled ? '#f8f8f8' : '#f0f0f0',
			cursor: disabled ? 'not-allowed' : 'pointer',
			color: disabled ? C.textFaint : C.textDim,
			transition: 'background 0.1s',
		}}
			onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = '#e4e4e4' }}
			onMouseLeave={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = '#f0f0f0' }}
		>
			{icon}
		</button>
	)
}

// ─── Card de monitor ──────────────────────────────────────────────────────────
function MonitorCard({ pair, runtime, onStart, onStop, onPause, onResume, onRunNow, onRemove, onClearDone }: {
	pair: WatchPair; runtime: PairRuntime
	onStart: () => void; onStop: () => void; onPause: () => void; onResume: () => void
	onRunNow: () => void; onRemove: () => void; onClearDone: () => void
}) {
	const hasDoneOrError = runtime.queue.some((f) => f.status === 'done' || f.status === 'error')
	const queuedCount = runtime.queue.filter((f) => f.status === 'queued').length
	const transcribingCount = runtime.queue.filter((f) => f.status === 'transcribing').length
	const isActive = runtime.status !== 'idle'

	return (
		<div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, marginBottom: 12, overflow: 'hidden' }}>

			{/* Card header */}
			<div style={{
				background: C.cardHeaderBg, borderBottom: `1px solid ${C.cardHeaderBorder}`,
				padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<StatusBadge status={runtime.status} />
					<span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{pair.label}</span>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
					{runtime.status === 'idle' && (
						<IconBtn onClick={onStart} icon={<Play size={12} />} title="Iniciar monitoramento" />
					)}
					{runtime.status === 'watching' && (
						<IconBtn onClick={onPause} icon={<Pause size={12} />} title="Pausar" />
					)}
					{runtime.status === 'paused' && (
						<IconBtn onClick={onResume} icon={<Play size={12} />} title="Retomar" />
					)}
					{isActive && (
						<IconBtn onClick={onStop} icon={<Square size={12} />} title="Parar monitoramento" />
					)}
					<IconBtn onClick={onRunNow} icon={<RotateCcw size={12} />} title="Executar agora" disabled={runtime.isTranscribing} />
					{hasDoneOrError && (
						<IconBtn onClick={onClearDone} icon={<Trash2 size={12} />} title="Limpar concluídos" />
					)}
					<IconBtn onClick={onRemove} icon={<Trash2 size={12} />} title="Remover monitor" />
				</div>
			</div>

			{/* Pastas */}
			<div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.cardBorder}` }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
					<FolderOpen size={11} color={C.blue} />
					<span style={{ fontSize: 11, color: C.textDim, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
						{pair.sourceFolder}
					</span>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
					<ChevronRight size={11} color={C.gray} />
					<FolderOpen size={11} color={C.green} />
					<span style={{ fontSize: 11, color: C.textDim, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
						{pair.outputFolder}
					</span>
				</div>
			</div>

			{/* Estatísticas */}
			{(transcribingCount > 0 || queuedCount > 0 || runtime.totalDone > 0 || runtime.totalError > 0) && (
				<div style={{ display: 'flex', gap: 14, padding: '5px 12px', borderBottom: `1px solid ${C.cardBorder}`, flexWrap: 'wrap' }}>
					{transcribingCount > 0 && <span style={{ fontSize: 10, color: C.blue }}>⟳ {transcribingCount} transcrevendo</span>}
					{queuedCount > 0 && <span style={{ fontSize: 10, color: C.textDim }}>⏳ {queuedCount} na fila</span>}
					{runtime.totalDone > 0 && <span style={{ fontSize: 10, color: C.green }}>✓ {runtime.totalDone} concluído{runtime.totalDone > 1 ? 's' : ''}</span>}
					{runtime.totalError > 0 && <span style={{ fontSize: 10, color: C.red }}>✕ {runtime.totalError} erro{runtime.totalError > 1 ? 's' : ''}</span>}
				</div>
			)}

			{/* Fila de arquivos */}
			{runtime.queue.length > 0 && (
				<div style={{ maxHeight: 180, overflowY: 'auto', padding: '4px 12px' }}>
					{runtime.queue.map((file, i) => (
						<FileRow key={`${file.path}-${i}`} file={file} />
					))}
				</div>
			)}
		</div>
	)
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function MonitorPage() {
	const vm = useMonitorViewModel()
	const [settingsVisible, setSettingsVisible] = useState(false)

	return (
		<div style={{
			minHeight: '100vh', background: C.appBg,
			fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
			color: C.text,
		}}>
			<style>{`
				@keyframes pulseDot {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.4; }
				}
				@keyframes spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
				::-webkit-scrollbar { width: 4px; }
				::-webkit-scrollbar-track { background: transparent; }
				::-webkit-scrollbar-thumb { background: #c8c8c8; border-radius: 4px; }
			`}</style>

			{settingsVisible && <SettingsModal visible={settingsVisible} setVisible={setSettingsVisible} />}

			{/* Header bar */}
			<div style={{
				background: C.headerBg, color: C.headerText,
				height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
				padding: '0 14px', userSelect: 'none', position: 'sticky', top: 0, zIndex: 100,
			}}>
				<span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>AutoScript</span>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<button onClick={() => setSettingsVisible(true)} title="Configurações" style={{
						width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
						borderRadius: 4, border: '1px solid #3a3a3a', background: 'transparent',
						color: C.headerText, cursor: 'pointer',
					}}>
						<Settings2 size={14} />
					</button>
					<button onClick={vm.addPair} style={{
						display: 'inline-flex', alignItems: 'center', gap: 5,
						padding: '5px 12px', borderRadius: 4,
						border: `1px solid ${C.blue}`, background: C.blue,
						color: '#ffffff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
					}}>
						<Plus size={13} /> Adicionar Monitor
					</button>
				</div>
			</div>

			{/* Body */}
			<div style={{ padding: '16px 20px' }}>
				{vm.pairs.length === 0 && (
					<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 12 }}>
						<div style={{ width: 48, height: 48, borderRadius: 8, border: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.cardBg }}>
							<FolderOpen size={20} color={C.gray} />
						</div>
						<div style={{ textAlign: 'center' }}>
							<p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.textDim }}>Nenhum monitor configurado</p>
							<p style={{ margin: '4px 0 0', fontSize: 12, color: C.textFaint }}>
								Clique em "Adicionar Monitor" para configurar uma pasta de origem e saída
							</p>
						</div>
					</div>
				)}

				{vm.pairs.map((pair) => {
					const runtime = vm.getRuntime(pair.id)
					return (
						<MonitorCard
							key={pair.id}
							pair={pair}
							runtime={runtime}
							onStart={() => vm.startWatching(pair.id)}
							onStop={() => vm.stopWatching(pair.id)}
							onPause={() => vm.pauseWatching(pair.id)}
							onResume={() => vm.resumeWatching(pair.id)}
							onRunNow={() => vm.runNow(pair.id)}
							onRemove={() => vm.removePair(pair.id)}
							onClearDone={() => vm.clearDone(pair.id)}
						/>
					)
				})}
			</div>
		</div>
	)
}
