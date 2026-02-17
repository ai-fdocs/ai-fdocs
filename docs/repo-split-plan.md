# Repository Split Plan (cargo / npm / vscode)

Этот документ фиксирует план разделения текущего монорепозитория на отдельные репозитории
для `cargo-ai-fdocs`, `npm-ai-fdocs` и `vscode-ai-fdocs`, а также контракт совместимости между
изданиями на период миграции.

## 1) Этапы разделения

### Phase 0 — Freeze

Цель: зафиксировать API/CLI-контракт до технического split.

- Заморозить публичные команды и ключевые флаги: `init`, `sync`, `status`, `check`.
- Заморозить JSON-контракты (`status/check` и `sync --report-format json` там, где поддерживается).
- Зафиксировать exit-code semantics и продублировать их в README каждого репозитория.
- Ввести change-control: breaking изменения только через RFC/ADR + явная пометка в changelog.

**Критерий выхода:** есть единый зафиксированный compatibility baseline для всех трёх изданий.

### Phase 1 — Split

Цель: физически разделить кодовые базы без изменения пользовательского UX.

- Создать отдельные репозитории:
  - `cargo-ai-fdocs`
  - `npm-ai-fdocs`
  - `vscode-ai-fdocs`
- Перенести историю (желательно `git filter-repo`/subtree split) по подпапкам.
- Добавить в каждый новый репозиторий:
  - собственный `README.md` (каноничный для этого продукта),
  - `COMPATIBILITY.md`,
  - `MIGRATION.md` (ссылка на cross-repo migration hub).
- В исходном монорепозитории оставить только meta-слой (manifest/roadmap/links) либо перевести в архивный режим.

**Критерий выхода:** пользователи могут собрать/установить каждый продукт из его собственного репозитория.

### Phase 2 — Mirror

Цель: снизить риск и обеспечить обратную совместимость ссылок/пайплайнов.

- В монорепозитории (или meta-репо) поддерживать зеркальные ссылки на релизы новых репозиториев.
- Настроить CI mirror-проверки:
  - smoke tests для `cargo`, `npm`, `vscode` на совместимость контрактов;
  - проверка, что canonical docs доступны по новым URL.
- Для переходного периода публиковать release notes в двух местах (старом и новом).
- Держать thin wrappers/redirect scripts там, где пользователи ожидают старые entry points.

**Критерий выхода:** telemetry/feedback показывает, что большинство пользователей перешли на новые источники.

### Phase 3 — Cutover

Цель: сделать новые репозитории единственным source of truth.

- Перевести все официальные ссылки (README, docs, Marketplace, package metadata) на новые URL.
- Оставить в старом репозитории только:
  - notice о split,
  - таблицу новых каноничных ссылок,
  - ограниченную поддержку security notices.
- Завершить dual-publish и dual-changelog период.

**Критерий выхода:** старые URL не используются как каноничные в документации и релизном процессе.

---

## 2) Обязательные compatibility-контракты (`cargo` / `npm` / `vscode`)

> Примечание: VS Code extension выступает как orchestration/UI слой и обязуется поддерживать тот же
> пользовательский workflow команд через встроенные действия и терминальные команды.

### 2.1 Команды

| Capability | cargo | npm | vscode |
| --- | --- | --- | --- |
| Initialize config | `cargo ai-fdocs init` | `ai-fdocs init` | `AI-Docs: Initialize` (вызов CLI `init`) |
| Sync docs | `cargo ai-fdocs sync [--force]` | `ai-fdocs sync [--force]` | `AI-Docs: Sync All` / `AI-Docs: Force Sync` |
| Status report | `cargo ai-fdocs status [--format json]` | `ai-fdocs status [--format json]`* | UI refresh через `status --format json` |
| CI gate | `cargo ai-fdocs check [--format json]` | `ai-fdocs check [--format json]` | встроенный check через CLI + отображение результата |

\* Если в npm/extension встречается legacy `--json`, он считается alias и не должен ломать `--format json`.

### 2.2 JSON-форматы (минимально обязательные поля)

#### `status/check --format json`

Обязательная минимальная структура:

```json
{
  "summary": {
    "total": 0,
    "synced": 0,
    "missing": 0,
    "outdated": 0,
    "corrupted": 0
  },
  "statuses": [
    {
      "crate_name": "serde",
      "lock_version": "1.0.0",
      "docs_version": "1.0.0",
      "status": "Synced",
      "reason": "ok"
    }
  ]
}
```

Требования совместимости:

- Единый контракт check-репорта зафиксирован в `docs/check-report-contract.md`.
- Существующие поля не удаляются и не переименовываются в рамках одной major-ветки.
- Новые поля — только additive.
- Enum `status` — append-only в minor-релизах.

#### `sync --report-format json` (где поддерживается)

- JSON-only вывод (без примесей текстовых логов в stdout).
- Наличие агрегированного summary + per-package/per-crate результатов.
- Поле ошибок должно быть машинно-читаемым (код + сообщение).

### 2.3 Exit codes (норматив)

Минимальный общий baseline:

- `0`: команда завершена успешно; для `check` — drift/ошибок консистентности нет.
- `1`: для `check` найден хотя бы один несинхронизированный/ошибочный dependency.
- `>=2`: runtime/usage/internal ошибка (парсинг аргументов, IO, network, unexpected failure).

Требования:

- Семантика `check: 0/1` обязательна и одинаковая для cargo/npm.
- VS Code обязан трактовать `1` как «проверка не пройдена», а не как crash расширения.

---

## 3) Versioning policy после split

Цель: независимые репозитории, но предсказуемая межпродуктовая совместимость.

### 3.1 Базовые правила

- Каждый репозиторий версионируется независимо по SemVer.
- Вводится единая **Compatibility Major Line**:
  - пока контракты совместимы, `cargo`, `npm`, `vscode` остаются в одном major (например, `1.x`).
  - если один продукт делает breaking change в общих контрактах, он обязан поднять major и
    опубликовать migration note для остальных.

### 3.2 Синхронизация major/minor

- **Major**:
  - Рекомендуется синхронный bump major для всех трёх репозиториев, если ломается общий контракт
    команд/JSON/exit-codes.
  - Допускается асинхронный major для одного репозитория только если break локальный
    (не затрагивает общий контракт).
- **Minor**:
  - Свободный независимый bump для новых backward-compatible возможностей.
  - Добавление новых необязательных JSON-полей — minor.

### 3.3 Что считается breaking

Breaking change (требует major) при split-схеме:

- удаление/переименование команды `init|sync|status|check`;
- удаление/переименование стабильных JSON-полей контракта;
- изменение смысла exit code `check` (`0/1`);
- несовместимое изменение config/metadata schema без migration path;
- изменение поведения VS Code wrapper так, что он больше не совместим с canonical CLI контрактом.

---

## 4) Migration note для пользователей

После cutover каноничными считаются отдельные репозитории и их README.

### 4.1 Canonical URL / packages (post-split)

- **Rust CLI (`cargo-ai-fdocs`)**
  - Canonical repo: `https://github.com/<org>/cargo-ai-fdocs`
  - Canonical docs: `https://github.com/<org>/cargo-ai-fdocs#readme`
  - Install: `cargo install cargo-ai-fdocs`
- **NPM CLI (`npm-ai-fdocs`)**
  - Canonical repo: `https://github.com/<org>/npm-ai-fdocs`
  - Canonical package: `https://www.npmjs.com/package/ai-fdocs`
  - Install: `npm install -g ai-fdocs`
- **VS Code Extension (`vscode-ai-fdocs`)**
  - Canonical repo: `https://github.com/<org>/vscode-ai-fdocs`
  - Canonical marketplace page: `https://marketplace.visualstudio.com/items?itemName=<publisher>.ai-fdocs`

> На этапе подготовки split заменить `<org>` и `<publisher>` на реальные значения и
> продублировать их в root README и во всех MIGRATION.md.

### 4.2 Что меняется для пользователей

- Monorepo root README перестаёт быть каноничным источником по установке/usage для каждого продукта.
- Issue/PR маршрутизация становится per-repo:
  - баги cargo CLI — в `cargo-ai-fdocs`;
  - баги npm CLI — в `npm-ai-fdocs`;
  - UX/IDE issues — в `vscode-ai-fdocs`.
- CI/CD интеграции должны ссылаться на релизы и changelog соответствующего продукта.

### 4.3 Переходный период

- Минимум один minor-релиз держать redirect notices в старом репозитории.
- Старые ссылки в документации помечать как deprecated и сопровождать новыми canonical URL.
- В changelog каждого продукта добавить раздел `Migration from monorepo split`.
