# API Anahtarı Free-LLM Tarama Raporu

**Tarih:** 2026-09-24
**Hariç:** NIM (stabil değil — uygulamadan çıkarıldı), OmniRoute (atlandı)
**Yöntem:** her anahtar için canlı model listesi + tek tek istek yoklaması + gerçek besin JSON promptu testi (yumurta ~72 kcal doğruluk kontrolü)

> Tüm anahtar değerleri yalnızca Authorization header'ında kullanıldı; hiçbiri bu rapora girmez.

## Çalışan ücretsiz modeller

| Sağlayıcı | Key kaynağı | Çalışan free model | Latency | Not |
|---|---|---|---|---|
| Gemini | `.env` | `gemini-3.6-flash` | ~2-4 sn | **Önerilen** — hızlı, temiz JSON |
| Gemini | `.env` | `gemini-3-flash-preview` | ~2-4 sn | Temiz JSON |
| Gemini | `.env` | `gemini-3.5-flash-lite` | ~20-40 sn | Yavaş |
| Gemini | `.env` | `gemini-flash-lite-latest` | ~23 sn | Yavaş |
| Gemini | `.env` | `gemma-4-26b-a4b-it` | ~5-18 sn | JSON'a açıklama karışır |
| OpenCode Zen | `.env` | `space-bunny-free` | ~3.5 sn | Tek çalışan OpenCode modeli |
| OpenRouter | `.api_keys` | `openrouter/free` | ~0.8 sn | Sıfır maliyet |
| OpenRouter | `.api_keys` | `cohere/north-mini-code:free` | ~0.3 sn | **En hızlı + en doğru** |
| Ollama Cloud | `.api_keys` | `gemma4:31b` | ~1.0 sn | **En iyi JSON + hız dengesi** |
| Ollama Cloud | `.api_keys` | `gpt-oss:120b` | ~2.7 sn | Temiz JSON |
| Ollama Cloud | `.api_keys` | `gpt-oss:20b` | ~1.9 sn | JSON geçerli, isimler İngilizce |
| Ollama Cloud | `.api_keys` | `nemotron-3-ultra` | ~11 sn | Yavaş, doğru |
| Ollama Cloud | `.api_keys` | `nemotron-3-super` | ~5 sn | Doğru |
| Ollama Cloud | `.api_keys` | `nemotron-3-nano:30b` | ~0.9 sn | Doğru |
| Cloudflare AI GW | `.api_keys` | `@cf/google/gemma-2b-it-lora` | ~1.4 sn | Ücretsiz LoRA (deneysel) |
| Cloudflare AI GW | `.api_keys` | `@cf/mistral/mistral-7b-instruct-v0.2-lora` | ~5.9 sn | JSON + açıklama |

## Çalışmayan / dikkat gerektiren

| Sağlayıcı | Durum |
|---|---|
| DeepSeek | Bakiye **negatif (-0.01 USD)** → tüm modeller 402. Free yok |
| TeamORouter | `deepseek-flash-free`, `deepseek-v4-flash-free`, `glm-5.3-flash-free` listeleniyor ama hepsi 400 `insufficient_balance` (cüzdan boş) |
| FreeModel | `api.freemodel.dev` — 3 model de 401 "Insufficient balance". **Güvenilirlik şüpheli** (sahte/reseller paterni) |
| Ollama (yerel) | Sunucu çalışmıyor (port 11434 kapalı) |
| OpenRouter bazı `:free` | 429 (provider dolu), 404 (uç yok), 403 (agentic-host gerekli) |
| Cloudflare diğer | `gemma-4-26b-a4b-it` boş yanıt; `llama-3.2-3b` faturalı |
| OpenCode diğer 7 `-free` | 403 FreeTierError |
| OpenCode ücretli | `deepseek-v4-flash` 403, `-vision-exp` 402 (bakiye yetersiz) |

## Anahtar bazında notlar

- **`.env` (prod):** eski `GEMINI_MODEL=gemini-flash-latest` 503 veriyor (ölü); `OPENCODE_MODEL=deepseek-v4-flash-free` listede yok (emekliye ayrılmış).
- **Güncel seriden zincirde kullanılanlar:** `openrouter/free`, `space-bunny-free`, `gemma4:31b`, `gemini-3.6-flash`, Cloudflare LoRA (deneysel, son). Vision zinciri yalnız Gemini tier'larıdır.
- **Ollama Cloud "ücretsiz" = anahtar planına dahil** (Pro/Max); token-ölçümlü faturalama değil.

## Net sonuç

**Eklendi (kod + env):** OpenRouter (`openrouter/free`), OpenCode (`space-bunny-free`), Ollama Cloud (`gemma4:31b`), Gemini (`gemini-3.6-flash`), Cloudflare (deneysel). **NIM uygulamadan çıkarıldı.**

**Dışarıda:** DeepSeek (bakiye yok), TeamORouter (cüzdan boş), FreeModel (şüpheli), lokal Ollama (servis yok), OmniRoute (test edilmedi).