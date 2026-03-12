use eyre::{bail, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyResult {
    pub source: String,
    pub local_path: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Resolve filename collision by appending (1), (2), etc.
fn resolve_collision(dest_folder: &Path, filename: &str) -> PathBuf {
    let dest = dest_folder.join(filename);
    if !dest.exists() {
        return dest;
    }
    let path = Path::new(filename);
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = path.extension().map(|e| e.to_string_lossy().to_string());
    let mut counter = 1;
    loop {
        let new_name = if let Some(ref ext) = ext {
            format!("{} ({}).{}", stem, counter, ext)
        } else {
            format!("{} ({})", stem, counter)
        };
        let new_dest = dest_folder.join(&new_name);
        if !new_dest.exists() {
            return new_dest;
        }
        counter += 1;
    }
}

/// Copy files using Windows native IFileOperation COM dialog.
/// This shows the familiar Windows copy dialog with progress, pause/resume, and collision handling.
#[tauri::command]
pub fn copy_files_native(sources: Vec<String>, destination: String) -> Result<Vec<CopyResult>, String> {
    copy_files_native_impl(sources, destination).map_err(|e| format!("{:#}", e))
}

fn copy_files_native_impl(sources: Vec<String>, destination: String) -> Result<Vec<CopyResult>> {
    let dest_path = PathBuf::from(&destination);
    if !dest_path.exists() {
        std::fs::create_dir_all(&dest_path)
            .map_err(|e| eyre::eyre!("Falha ao criar pasta destino: {}", e))?;
    }

    // IFileOperation must run on an STA thread
    let (tx, rx) = std::sync::mpsc::channel();
    let sources_clone = sources.clone();
    let dest_clone = destination.clone();

    std::thread::spawn(move || {
        let result = run_file_operation(&sources_clone, &dest_clone);
        let _ = tx.send(result);
    });

    match rx.recv() {
        Ok(result) => result,
        Err(_) => bail!("Thread de cópia falhou"),
    }
}

#[cfg(target_os = "windows")]
fn run_file_operation(sources: &[String], destination: &str) -> Result<Vec<CopyResult>> {
    use windows::core::*;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;


    let mut results = Vec::new();
    let dest_path = PathBuf::from(destination);

    unsafe {
        // Initialize COM on this thread (STA)
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok().map_err(|e| eyre::eyre!("CoInitializeEx falhou: {}", e))?;

        let file_op: IFileOperation = CoCreateInstance(&FileOperation, None, CLSCTX_ALL)
            .map_err(|e| eyre::eyre!("CoCreateInstance IFileOperation falhou: {}", e))?;

        // Set operation flags
        // FOF_NOCONFIRMMKDIR = don't ask to create directories
        // FOFX_ADDUNDORECORD = allow undo
        file_op.SetOperationFlags(
            FILEOPERATION_FLAGS(0x0200 | 0x01000000) // FOF_NOCONFIRMMKDIR | FOFX_ADDUNDORECORD
        )?;

        // Create destination shell item
        let dest_wide: Vec<u16> = destination.encode_utf16().chain(std::iter::once(0)).collect();
        let dest_item: IShellItem = SHCreateItemFromParsingName(
            PCWSTR(dest_wide.as_ptr()),
            None::<&windows::Win32::System::Com::IBindCtx>,
        )?;

        let mut copy_map: Vec<(String, PathBuf)> = Vec::new();

        for source in sources {
            let source_path = Path::new(source);
            let filename = source_path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "file".to_string());

            // Resolve collision for the destination filename
            let resolved_dest = resolve_collision(&dest_path, &filename);
            let resolved_name = resolved_dest.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or(filename);

            let source_wide: Vec<u16> = source.encode_utf16().chain(std::iter::once(0)).collect();
            let name_wide: Vec<u16> = resolved_name.encode_utf16().chain(std::iter::once(0)).collect();

            match SHCreateItemFromParsingName::<_, _, IShellItem>(
                PCWSTR(source_wide.as_ptr()),
                None::<&windows::Win32::System::Com::IBindCtx>,
            ) {
                Ok(source_item) => {
                    // CopyItem with new name to handle collisions
                    if let Err(e) = file_op.CopyItem(&source_item, &dest_item, PCWSTR(name_wide.as_ptr()), None::<&IFileOperationProgressSink>) {
                        results.push(CopyResult {
                            source: source.clone(),
                            local_path: String::new(),
                            success: false,
                            error: Some(format!("CopyItem falhou: {}", e)),
                        });
                        continue;
                    }
                    copy_map.push((source.clone(), resolved_dest));
                }
                Err(e) => {
                    results.push(CopyResult {
                        source: source.clone(),
                        local_path: String::new(),
                        success: false,
                        error: Some(format!("SHCreateItemFromParsingName falhou: {}", e)),
                    });
                }
            }
        }

        // Perform all operations - this shows the Windows copy dialog
        let perform_result = file_op.PerformOperations();

        // Check if user aborted
        let aborted = file_op.GetAnyOperationsAborted().unwrap_or(BOOL::from(false));

        if aborted.as_bool() {
            for (source, _) in &copy_map {
                results.push(CopyResult {
                    source: source.clone(),
                    local_path: String::new(),
                    success: false,
                    error: Some("Cópia cancelada pelo usuário".into()),
                });
            }
        } else if let Err(e) = perform_result {
            for (source, _) in &copy_map {
                results.push(CopyResult {
                    source: source.clone(),
                    local_path: String::new(),
                    success: false,
                    error: Some(format!("PerformOperations falhou: {}", e)),
                });
            }
        } else {
            // Verify each file was copied
            for (source, dest) in &copy_map {
                if dest.exists() {
                    results.push(CopyResult {
                        source: source.clone(),
                        local_path: dest.to_string_lossy().to_string(),
                        success: true,
                        error: None,
                    });
                } else {
                    results.push(CopyResult {
                        source: source.clone(),
                        local_path: String::new(),
                        success: false,
                        error: Some("Arquivo não encontrado após cópia".into()),
                    });
                }
            }
        }

        CoUninitialize();
    }

    Ok(results)
}

#[cfg(not(target_os = "windows"))]
fn run_file_operation(sources: &[String], destination: &str) -> Result<Vec<CopyResult>> {
    let mut results = Vec::new();
    let dest_path = PathBuf::from(destination);

    for source in sources {
        let source_path = Path::new(source);
        let filename = source_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string());
        let resolved_dest = resolve_collision(&dest_path, &filename);

        match std::fs::copy(source, &resolved_dest) {
            Ok(_) => results.push(CopyResult {
                source: source.clone(),
                local_path: resolved_dest.to_string_lossy().to_string(),
                success: true,
                error: None,
            }),
            Err(e) => results.push(CopyResult {
                source: source.clone(),
                local_path: String::new(),
                success: false,
                error: Some(format!("Falha na cópia: {}", e)),
            }),
        }
    }

    Ok(results)
}
