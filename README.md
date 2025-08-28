# 🌟 Eval Analyzer

一個基於 **Vanilla JavaScript** 的靜態網站工具，用來分析 **[Twinkle Eval](https://github.com/ai-twinkle/Eval)** 格式的評估檔案（`.json` / `.jsonl`）。  

## 📌 功能特色

<p align="center">
  <img src="https://github.com/ai-twinkle/llm-lab/blob/main/courses/2025-0827-llm-eval-with-twinkle/assets/gpt-oss-120b-mmlu-eval-report.png?raw=1" width="100%"/><br/>
  <em>圖：gpt-oss-120b 在 MMLU 部分子集上的表現成績預覽</em>
</p>

- 支援上傳多個 **Twinkle Eval 檔案**（`json` / `jsonl`）。
- 自動解析評估結果，抽取：
  - `dataset`
  - `category`
  - `file`
  - `accuracy_mean`
  - `source_label`（模型名稱 + timestamp）
- 提供整體平均值的計算，缺漏時自動補足。
- 視覺化：
  - 各類別的柱狀圖（依模型分組對照）。
  - 可選擇排序方式（平均由高→低、平均由低→高、字母排序）。
  - 支援分頁顯示（自訂每頁顯示類別數量）。
  - 指標可切換為原始值或 0–100 比例。
- 支援 **CSV 匯出**（下載分頁結果）。
- **純靜態網站**，無需安裝任何依賴套件。
- **響應式設計**，支援手機和平板瀏覽。

## 🚀 使用方式

### 1. 開啟網站
直接在瀏覽器中開啟 `index.html` 檔案，或將檔案放在 Web 伺服器上使用。

若要在本地端測試，可以使用任何 HTTP 伺服器：

```bash
# 使用 Python
python -m http.server 8000

# 使用 Node.js
npx serve .

# 使用 PHP
php -S localhost:8000
```

### 2. 操作流程
1. 在左側 Sidebar 上傳一個或多個 **Twinkle Eval 檔案**。
2. 選擇要查看的資料集。
3. 設定排序方式、分頁大小、顯示比例（0–1 或 0–100）。
4. 查看圖表與資料表，並可下載 CSV。

## 📂 檔案格式要求
每份 json / jsonl 檔案需符合 Twinkle Eval 格式，至少包含以下欄位：

```json
{
  "timestamp": "2025-08-20T10:00:00",
  "config": {
    "model": { "name": "my-model" }
  },
  "dataset_results": {
    "datasets/my_dataset": {
      "average_accuracy": 0.85,
      "results": [
        {
          "file": "category1.json",
          "accuracy_mean": 0.9
        },
        {
          "file": "category2.json",
          "accuracy_mean": 0.8
        }
      ]
    }
  }
}
```
或者可以到 Twinkle AI [Eval logs](https://huggingface.co/collections/twinkle-ai/eval-logs-6811a657da5ce4cbd75dbf50) collections 下載範例。

## 📊 輸出範例

- **圖表**：顯示各模型在不同類別的 accuracy_mean 比較。
- **表格**：Pivot Table，行為類別，列為模型，值為 accuracy。
- **下載**：每頁結果可匯出成 CSV。

## 🔧 技術實作

- **前端技術**：Vanilla JavaScript + HTML5 + CSS3
- **圖表庫**：Chart.js
- **檔案處理**：FileReader API
- **資料處理**：原生 JavaScript（無需 pandas 或 numpy）
- **部署**：純靜態檔案，可部署至任何 Web 伺服器或 CDN

## 📄 License
MIT