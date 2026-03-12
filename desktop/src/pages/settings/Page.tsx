import { ReactNode } from 'react'
import { viewModel } from './viewModel'
import { ModifyState } from '~/lib/utils'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { X, Folder, FolderOpen, Download, ExternalLink, Copy, Terminal, RotateCcw } from 'lucide-react'

interface SettingsPageProps {
	setVisible: ModifyState<boolean>
}

const C = {
	headerBg: '#1e1e1e',
	headerText: '#d8d8d8',
	appBg: '#eeeeee',
	sectionHeaderBg: '#2a2a2a',
	sectionHeaderText: '#ffffff',
	cardBg: '#ffffff',
	cardBorder: '#d4d4d4',
	text: '#1a1a1a',
	textDim: '#5a5a5a',
	textFaint: '#999999',
	blue: '#0070d1',
	green: '#1e7a3c',
	red: '#c83030',
} as const

function SectionHeader({ children }: { children: ReactNode }) {
	return (
		<div style={{
			background: C.sectionHeaderBg, color: C.sectionHeaderText,
			fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
			padding: '6px 12px', textTransform: 'uppercase', marginBottom: 0,
		}}>
			{children}
		</div>
	)
}

function Card({ children }: { children: ReactNode }) {
	return (
		<div style={{
			background: C.cardBg, border: `1px solid ${C.cardBorder}`,
			borderTop: 'none', marginBottom: 16, overflow: 'hidden',
		}}>
			{children}
		</div>
	)
}

function CardRow({ children, border = true }: { children: ReactNode; border?: boolean }) {
	return (
		<div style={{
			display: 'flex', alignItems: 'center', justifyContent: 'space-between',
			padding: '10px 14px', gap: 12,
			borderBottom: border ? `1px solid ${C.cardBorder}` : 'none',
			minHeight: 44,
		}}>
			{children}
		</div>
	)
}

function ActionBtn({ onClick, icon, label, danger = false }: { onClick: () => void; icon: ReactNode; label: string; danger?: boolean }) {
	return (
		<button onClick={onClick} style={{
			display: 'flex', alignItems: 'center', gap: 5,
			background: danger ? '#fff0f0' : '#f0f0f0',
			border: `1px solid ${danger ? '#e0b0b0' : C.cardBorder}`,
			borderRadius: 4, cursor: 'pointer',
			color: danger ? C.red : C.text,
			fontSize: 12, padding: '4px 10px',
		}}>
			{icon} {label}
		</button>
	)
}

export default function SettingsPage({ setVisible }: SettingsPageProps) {
	const vm = viewModel()

	return (
		<div style={{
			minHeight: '100%',
			background: C.appBg,
			fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
			fontSize: 13, color: C.text,
		}}>
			{/* Header bar */}
			<div style={{
				background: C.headerBg, color: C.headerText,
				height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
				padding: '0 14px', position: 'sticky', top: 0, zIndex: 10, userSelect: 'none',
			}}>
				<span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>
					Configurações — AutoScript
				</span>
				<button onMouseDown={() => setVisible(false)} style={{
					background: 'transparent', border: 'none', cursor: 'pointer',
					color: C.headerText, display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4,
				}}>
					<X size={16} />
				</button>
			</div>

			<div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 40px' }}>

				{/* MODELO DE TRANSCRIÇÃO */}
				<SectionHeader>Modelo de transcrição</SectionHeader>
				<Card>
					<CardRow>
						<Label style={{ color: C.text, fontWeight: 500, fontSize: 12 }}>Modelo ativo</Label>
						<div style={{ minWidth: 220 }}>
							<Select
								value={vm.preference.modelPath ?? undefined}
								onValueChange={(value) => vm.preference.setModelPath(value)}
								onOpenChange={(open) => { if (open) vm.loadModels() }}>
								<SelectTrigger style={{ height: 30, fontSize: 12, background: '#f8f8f8', border: `1px solid ${C.cardBorder}` }}>
									<SelectValue placeholder="Selecionar modelo..." />
								</SelectTrigger>
								<SelectContent>
									{vm.models.map((model, index) => (
										<SelectItem key={index} value={model.path}>{model.name}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</CardRow>

					{!vm.isMacOS && (
						<CardRow>
							<Label style={{ color: C.text, fontWeight: 500, fontSize: 12 }}>GPU</Label>
							<div style={{ minWidth: 220 }}>
								{vm.gpuDevices.length > 0 ? (
									<Select
										value={vm.preference.gpuDevice != null ? String(vm.preference.gpuDevice) : 'auto'}
										onValueChange={(value) => {
											vm.preference.setGpuDevice(value === 'auto' ? null : parseInt(value, 10))
										}}>
										<SelectTrigger style={{ height: 30, fontSize: 12, background: '#f8f8f8', border: `1px solid ${C.cardBorder}` }}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="auto">Auto</SelectItem>
											{vm.gpuDevices.map((device) => (
												<SelectItem key={device.index} value={String(device.index)}>{device.description}</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : (
									<Input
										type="number"
										value={vm.preference.gpuDevice ?? ''}
										onChange={(e) => {
											const val = e.target.value
											vm.preference.setGpuDevice(val === '' ? null : parseInt(val, 10))
										}}
										placeholder="Índice do dispositivo"
										style={{ height: 30, fontSize: 12 }}
									/>
								)}
							</div>
						</CardRow>
					)}

					<CardRow>
						<div style={{ display: 'flex', gap: 8, width: '100%' }}>
							<Input
								type="text"
								value={vm.downloadURL}
								onChange={(e) => vm.setDownloadURL(e.target.value)}
								placeholder="URL do modelo (HuggingFace .bin)..."
								onKeyDown={(e) => e.key === 'Enter' ? vm.downloadModel() : null}
								style={{ flex: 1, height: 30, fontSize: 12 }}
							/>
							<button onClick={vm.downloadModel} style={{
								height: 30, padding: '0 10px', background: C.blue, color: '#fff',
								border: 'none', borderRadius: 4, cursor: 'pointer',
								display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, flexShrink: 0,
							}}>
								<Download size={13} /> Baixar
							</button>
						</div>
					</CardRow>

					<CardRow border={false}>
						<button onClick={vm.openModelsUrl} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.blue, fontSize: 12, padding: 0 }}>
							<ExternalLink size={12} /> Repositório de modelos
						</button>
						<button onClick={vm.openModelPath} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.textDim, fontSize: 12, padding: 0 }}>
							<FolderOpen size={12} /> Pasta de modelos
						</button>
					</CardRow>
				</Card>

				{/* PASTAS PADRÃO */}
				<SectionHeader>Pastas padrão</SectionHeader>
				<Card>
					<div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.cardBorder}` }}>
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
							<span style={{ fontWeight: 500, fontSize: 12 }}>Pasta de origem (padrão)</span>
							<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
								{vm.preference.defaultSourceFolder && (
									<button onClick={vm.clearDefaultSourceFolder} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textFaint, fontSize: 11 }}>limpar</button>
								)}
								<button onClick={vm.changeDefaultSourceFolder} style={{
									display: 'flex', alignItems: 'center', gap: 4, background: '#f0f0f0',
									border: `1px solid ${C.cardBorder}`, borderRadius: 4, cursor: 'pointer',
									color: C.text, fontSize: 12, padding: '3px 8px',
								}}>
									<Folder size={12} /> Escolher
								</button>
							</div>
						</div>
						<div style={{ fontFamily: 'monospace', fontSize: 11, color: C.textFaint, minHeight: 18 }}>
							{vm.preference.defaultSourceFolder ?? 'Não definido — será solicitado ao adicionar monitor'}
						</div>
					</div>
					<div style={{ padding: '10px 14px' }}>
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
							<span style={{ fontWeight: 500, fontSize: 12 }}>Pasta de saída (padrão)</span>
							<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
								{vm.preference.defaultOutputFolder && (
									<button onClick={vm.clearDefaultOutputFolder} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textFaint, fontSize: 11 }}>limpar</button>
								)}
								<button onClick={vm.changeDefaultOutputFolder} style={{
									display: 'flex', alignItems: 'center', gap: 4, background: '#f0f0f0',
									border: `1px solid ${C.cardBorder}`, borderRadius: 4, cursor: 'pointer',
									color: C.text, fontSize: 12, padding: '3px 8px',
								}}>
									<Folder size={12} /> Escolher
								</button>
							</div>
						</div>
						<div style={{ fontFamily: 'monospace', fontSize: 11, color: C.textFaint, minHeight: 18 }}>
							{vm.preference.defaultOutputFolder ?? 'Não definido — ficará igual à pasta de origem'}
						</div>
					</div>
				</Card>

				{/* PASTA TEMPORÁRIA DE CÓPIA */}
				<SectionHeader>Cópia local (retry)</SectionHeader>
				<Card>
					<div style={{ padding: '10px 14px' }}>
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
							<span style={{ fontWeight: 500, fontSize: 12 }}>Pasta temporária de cópia</span>
							<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
								{vm.preference.tempCopyFolder && (
									<button onClick={vm.clearTempCopyFolder} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textFaint, fontSize: 11 }}>limpar</button>
								)}
								<button onClick={vm.changeTempCopyFolder} style={{
									display: 'flex', alignItems: 'center', gap: 4, background: '#f0f0f0',
									border: `1px solid ${C.cardBorder}`, borderRadius: 4, cursor: 'pointer',
									color: C.text, fontSize: 12, padding: '3px 8px',
								}}>
									<Folder size={12} /> Escolher
								</button>
							</div>
						</div>
						<div style={{ fontFamily: 'monospace', fontSize: 11, color: C.textFaint, minHeight: 18 }}>
							{vm.preference.tempCopyFolder ?? 'Não definido — necessário para "Copiar local & retry"'}
						</div>
						<div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>
							Arquivos com erro serão copiados para cá antes de transcrever novamente. Útil para arquivos do Google Drive/OneDrive.
						</div>
					</div>
				</Card>

				{/* PERFORMANCE */}
				<SectionHeader>Performance</SectionHeader>
				<Card>
					<CardRow>
						<div>
							<Label style={{ color: C.text, fontWeight: 500, fontSize: 12 }}>Beam search (qualidade)</Label>
							<div style={{ fontSize: 10, color: C.textFaint, marginTop: 2 }}>Mais beams = mais uso de GPU e melhor precisão</div>
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
							<input
								type="range" min={1} max={10} step={1}
								value={vm.preference.modelOptions.beam_size ?? 8}
								onChange={(e) => vm.preference.setModelOptions(prev => ({ ...prev, beam_size: parseInt(e.target.value) }))}
								style={{ flex: 1 }}
							/>
							<span style={{ fontSize: 12, color: C.text, minWidth: 18, textAlign: 'center', fontFamily: 'monospace' }}>
								{vm.preference.modelOptions.beam_size ?? 8}
							</span>
						</div>
					</CardRow>
					<CardRow>
						<div>
							<Label style={{ color: C.text, fontWeight: 500, fontSize: 12 }}>Threads de CPU</Label>
							<div style={{ fontSize: 10, color: C.textFaint, marginTop: 2 }}>Mais threads = alimenta a GPU mais rápido</div>
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
							<input
								type="range" min={1} max={16} step={1}
								value={vm.preference.modelOptions.n_threads ?? 8}
								onChange={(e) => vm.preference.setModelOptions(prev => ({ ...prev, n_threads: parseInt(e.target.value) }))}
								style={{ flex: 1 }}
							/>
							<span style={{ fontSize: 12, color: C.text, minWidth: 18, textAlign: 'center', fontFamily: 'monospace' }}>
								{vm.preference.modelOptions.n_threads ?? 8}
							</span>
						</div>
					</CardRow>
					<CardRow border={false}>
						<div>
							<Label style={{ color: C.text, fontWeight: 500, fontSize: 12 }}>Temperatura</Label>
							<div style={{ fontSize: 10, color: C.textFaint, marginTop: 2 }}>0.0 = determinístico (recomendado para transcrição)</div>
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
							<input
								type="range" min={0} max={1} step={0.1}
								value={vm.preference.modelOptions.temperature ?? 0}
								onChange={(e) => vm.preference.setModelOptions(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
								style={{ flex: 1 }}
							/>
							<span style={{ fontSize: 12, color: C.text, minWidth: 24, textAlign: 'center', fontFamily: 'monospace' }}>
								{(vm.preference.modelOptions.temperature ?? 0).toFixed(1)}
							</span>
						</div>
					</CardRow>
				</Card>

				{/* COMO USAR */}
				<SectionHeader>Como usar</SectionHeader>
				<Card>
					<div style={{ padding: '14px 16px' }}>
						{[
							['1. Adicionar monitor', 'Clique em "+ Adicionar Monitor" na tela principal. Escolha a pasta de vídeos e depois a pasta de saída (ou cancele para salvar ao lado do vídeo em /Transcrição).'],
							['2. Iniciar monitoramento', 'Clique em "Iniciar monitoramento" no card do monitor. O app ficará observando a pasta em tempo real.'],
							['3. Arquivos detectados automaticamente', 'Quando um vídeo (.mp4, .mov, .m4v) for copiado ou criado na pasta de origem, ele aparece na fila e a transcrição começa automaticamente.'],
							['4. Executar agora', 'Use "Escanear pasta agora" para processar todos os vídeos já existentes na pasta sem precisar esperar por novos.'],
							['5. Pausar e retomar', '"Pausar" interrompe a detecção de novos arquivos, mas não cancela o arquivo em andamento. "Retomar" volta a monitorar.'],
							['6. Resultado', 'Cada vídeo gera um .txt nomeado como [NomeDoVídeo]_[Tamanho].txt, contendo a transcrição completa em texto.'],
						].map(([title, desc], i) => (
							<div key={i} style={{ marginBottom: i < 5 ? 14 : 0 }}>
								<div style={{ fontWeight: 600, fontSize: 12, color: C.text, marginBottom: 3 }}>{title}</div>
								<div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>{desc}</div>
							</div>
						))}
					</div>
				</Card>

				{/* DIAGNÓSTICO */}
				<SectionHeader>Diagnóstico</SectionHeader>
				<Card>
					<CardRow>
						<span style={{ fontSize: 12, color: C.textDim }}>Copiar logs</span>
						<ActionBtn onClick={vm.copyLogs} icon={<Copy size={12} />} label="Copiar" />
					</CardRow>
					<CardRow>
						<span style={{ fontSize: 12, color: C.textDim }}>Pasta de logs</span>
						<ActionBtn onClick={vm.revealLogs} icon={<FolderOpen size={12} />} label="Abrir" />
					</CardRow>
					<CardRow>
						<span style={{ fontSize: 12, color: C.textDim }}>Pasta temporária</span>
						<ActionBtn onClick={vm.revealTemp} icon={<Terminal size={12} />} label="Abrir" />
					</CardRow>
					<CardRow border={false}>
						<span style={{ fontSize: 12, color: C.textDim }}>Redefinir configurações</span>
						<ActionBtn onClick={vm.askAndReset} icon={<RotateCcw size={12} />} label="Redefinir" danger />
					</CardRow>
					<div style={{ padding: '6px 14px 10px', borderTop: `1px solid ${C.cardBorder}`, color: C.textFaint, fontSize: 11, textAlign: 'right' }}>
						{vm.appVersion}
					</div>
				</Card>
			</div>
		</div>
	)
}
