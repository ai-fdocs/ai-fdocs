# Предложения по улучшению 3 модулей AI Fresh Docs

Ниже — практичные улучшения для трёх основных модулей продукта: Rust CLI, NPM CLI и VS Code Extension.

## 1) Rust CLI (`cargo-ai-fdocs`)

### Что улучшить

1. **Инкрементальный `sync` на уровне файлов**  
   Сейчас кэш строится по пакету/версии. Стоит добавить более тонкий слой: если в удалённом источнике изменился только один целевой файл (`README.md`/`CHANGELOG.md`), обновлять только его.

2. **Ограничение и backoff по источникам**  
   Добавить адаптивное управление скоростью запросов к GitHub (например, per-host token bucket + exponential backoff), чтобы снизить ошибки в CI при всплесках параллелизма.

3. **`check --format sarif` для CI и security-gates**  
   Помимо text/json, полезно отдавать SARIF, чтобы результаты freshness/check встраивались в GitHub Code Scanning и единые quality dashboards.

### Почему это приоритетно

- уменьшит время повторных синхронизаций в больших lock-файлах;
- снизит flaky-падения в CI из-за rate limiting;
- улучшит интеграцию с enterprise-пайплайнами.

---

## 2) NPM CLI (`ai-fdocs`)

### Что улучшить

1. **PnPM/Yarn lockfile parity**  
   Расширить `init/sync` на `pnpm-lock.yaml` и `yarn.lock` с явным режимом выбора lockfile при наличии нескольких менеджеров.

2. **Source health scoring для `npm_tarball` и `github`**  
   Вести локальную метрику надёжности источников (успешность, latency, freshness) и автоматически выбирать более стабильный источник на следующих запусках.

3. **Детализированный diff в `status`**  
   Добавить режим `status --verbose` с ответом: *какие именно файлы отсутствуют/устарели* и *какой источник использовался*.

### Почему это приоритетно

- расширит применимость в реальных Node-монорепах;
- улучшит стабильность при деградации одного из источников;
- сократит время диагностики проблем документации.

---

## 3) VS Code Extension

### Что улучшить

1. **Inline-диагностика в Problems panel**  
   Преобразовывать ошибки `sync/check` в Diagnostic entries по workspace-файлу (`ai-fdocs.toml`) с понятными quick-fix действиями.

2. **Batch actions из Tree View**  
   Добавить контекстные действия «Sync selected», «Open source URL», «Mark as ignored until next lockfile change» для групповой работы с зависимостями.

3. **Telemetry сравнения движков (`internal` vs `external-cli`)**  
   Сделать встроенный экран/команду health-report с агрегированной статистикой (время sync, % ошибок, типы отказов) для безопасного roll-out internal engine.

### Почему это приоритетно

- снизит friction для пользователей, которые не работают через терминал;
- ускорит triage и повторные sync-итерации прямо из UI;
- даст продуктовые данные для вывода internal engine в stable.

---

## Рекомендуемый порядок внедрения (по кварталам)

1. **Q1:** Rust incremental sync + NPM verbose status + VS Code diagnostics.  
2. **Q2:** NPM lockfile parity + Rust adaptive backoff + VS Code batch actions.  
3. **Q3:** SARIF export + source health scoring + engine health-report.

## KPI для проверки эффекта

- median `sync` duration (P50/P95);
- процент successful `check` в CI;
- mean time to diagnose stale/missing docs;
- доля пользователей VS Code, использующих не только `Sync All`, но и точечные действия по дереву.
