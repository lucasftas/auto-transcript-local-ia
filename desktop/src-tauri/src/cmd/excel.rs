use eyre::{Context, ContextCompat, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedRow {
    pub row_number: usize,
    pub source_folder: String,
    pub output_mode: String,
    pub output_folder: String,
    pub label: String,
    pub timeout_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportError {
    pub row_number: usize,
    pub column: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: Vec<ImportedRow>,
    pub errors: Vec<ImportError>,
}

#[tauri::command]
pub fn generate_template_xlsx(output_path: String) -> Result<(), String> {
    generate_template_impl(&output_path).map_err(|e| format!("{:#}", e))
}

fn generate_template_impl(output_path: &str) -> Result<()> {
    use rust_xlsxwriter::*;

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("Monitores")?;

    // Header format
    let header_fmt = Format::new()
        .set_bold()
        .set_background_color(Color::RGB(0x2A2A2A))
        .set_font_color(Color::White)
        .set_font_size(11.0);

    // Headers
    let headers = [
        "pasta_origem",
        "modo_saida",
        "pasta_saida",
        "label",
        "timeout_minutos",
    ];
    for (col, header) in headers.iter().enumerate() {
        worksheet.write_string_with_format(0, col as u16, *header, &header_fmt)?;
    }

    // Example rows
    worksheet.write_string(1, 0, r"C:\Videos\Aulas")?;
    worksheet.write_string(1, 1, "subfolder")?;
    worksheet.write_string(1, 2, "")?;
    worksheet.write_string(1, 3, "Aulas")?;
    worksheet.write_number(1, 4, 30.0)?;

    worksheet.write_string(2, 0, r"D:\Gravações")?;
    worksheet.write_string(2, 1, "fixed")?;
    worksheet.write_string(2, 2, r"D:\Transcrições")?;
    worksheet.write_string(2, 3, "Gravações")?;
    worksheet.write_number(2, 4, 60.0)?;

    // Column widths
    worksheet.set_column_width(0, 40)?;
    worksheet.set_column_width(1, 14)?;
    worksheet.set_column_width(2, 40)?;
    worksheet.set_column_width(3, 20)?;
    worksheet.set_column_width(4, 18)?;

    workbook.save(output_path).context("Falha ao salvar template Excel")?;
    Ok(())
}

#[tauri::command]
pub fn import_monitors_xlsx(file_path: String) -> Result<ImportResult, String> {
    import_monitors_impl(&file_path).map_err(|e| format!("{:#}", e))
}

fn import_monitors_impl(file_path: &str) -> Result<ImportResult> {
    use calamine::{open_workbook, Reader, Xlsx, Data};

    let mut workbook: Xlsx<_> = open_workbook(file_path)
        .context("Falha ao abrir arquivo Excel")?;

    let sheet_name = workbook.sheet_names().first()
        .context("Nenhuma planilha encontrada")?.clone();

    let range = workbook.worksheet_range(&sheet_name)
        .context("Falha ao ler planilha")?;

    let mut imported = Vec::new();
    let mut errors = Vec::new();

    for (row_idx, row) in range.rows().enumerate() {
        // Skip header row
        if row_idx == 0 {
            continue;
        }
        let row_number = row_idx + 1;

        let get_cell_str = |col: usize| -> String {
            row.get(col)
                .map(|cell| match cell {
                    Data::String(s) => s.trim().to_string(),
                    Data::Float(f) => format!("{}", f),
                    Data::Int(i) => format!("{}", i),
                    _ => String::new(),
                })
                .unwrap_or_default()
        };

        // pasta_origem (column 0) - required
        let source_folder = get_cell_str(0);
        if source_folder.is_empty() {
            // Skip completely empty rows
            if (1..5).all(|i| get_cell_str(i).is_empty()) {
                continue;
            }
            errors.push(ImportError {
                row_number,
                column: "pasta_origem".into(),
                message: "Pasta de origem não pode ser vazia".into(),
            });
            continue;
        }

        let source_path = PathBuf::from(&source_folder);
        if !source_path.exists() {
            errors.push(ImportError {
                row_number,
                column: "pasta_origem".into(),
                message: format!("Pasta de origem não encontrada: {}", source_folder),
            });
            continue;
        }
        if !source_path.is_dir() {
            errors.push(ImportError {
                row_number,
                column: "pasta_origem".into(),
                message: format!("O caminho não é uma pasta: {}", source_folder),
            });
            continue;
        }

        // modo_saida (column 1)
        let output_mode_raw = get_cell_str(1);
        let output_mode = output_mode_raw.to_lowercase();
        if output_mode != "subfolder" && output_mode != "fixed" {
            errors.push(ImportError {
                row_number,
                column: "modo_saida".into(),
                message: format!(
                    "Modo de saída inválido: '{}'. Use 'subfolder' ou 'fixed'",
                    output_mode_raw
                ),
            });
            continue;
        }

        // pasta_saida (column 2)
        let output_folder = get_cell_str(2);
        if output_mode == "fixed" {
            if output_folder.is_empty() {
                errors.push(ImportError {
                    row_number,
                    column: "pasta_saida".into(),
                    message: "Pasta de saída é obrigatória quando modo_saida é 'fixed'".into(),
                });
                continue;
            }
            let output_path = PathBuf::from(&output_folder);
            if !output_path.exists() {
                errors.push(ImportError {
                    row_number,
                    column: "pasta_saida".into(),
                    message: format!("Pasta de saída não encontrada: {}", output_folder),
                });
                continue;
            }
        }

        // label (column 3) - optional
        let label = get_cell_str(3);
        let label = if label.is_empty() {
            source_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| format!("Monitor {}", row_number))
        } else {
            label
        };

        // timeout_minutos (column 4) - optional, default 30
        let timeout_str = get_cell_str(4);
        let timeout_minutes = if timeout_str.is_empty() {
            30
        } else {
            match timeout_str.parse::<f64>() {
                Ok(v) if v > 0.0 => v as u32,
                _ => {
                    errors.push(ImportError {
                        row_number,
                        column: "timeout_minutos".into(),
                        message: format!(
                            "Timeout inválido: '{}'. Deve ser um número positivo",
                            timeout_str
                        ),
                    });
                    continue;
                }
            }
        };

        imported.push(ImportedRow {
            row_number,
            source_folder: source_path.to_string_lossy().to_string(),
            output_mode,
            output_folder,
            label,
            timeout_minutes,
        });
    }

    Ok(ImportResult { imported, errors })
}
