/// <reference path="../pb_data/types.d.ts" />

// Issue #88: enforce a single canonical weekday encoding for recurrenceDays.
//
// Canonical encoding is JavaScript's Date.getDay(): 0=Sunday, 1=Monday, ...,
// 6=Saturday. Historically Sunday was double-encoded as both 0 and 7. This
// one-off data migration normalizes existing records:
//   - 7 (legacy Sunday) -> 0
//   - drops out-of-range values
//   - removes duplicates and sorts ascending
migrate(
  (app) => {
    // The JSVM exposes `json` fields as raw bytes (types.JSONRaw), e.g. the
    // stored value `[7]` is returned as the byte array [91, 55, 93]. Decode
    // those bytes back into the actual JSON value before working with it.
    const decodeJsonField = (value) => {
      if (value == null) return null
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        } catch (e) {
          return null
        }
      }
      if (typeof value === 'object' && typeof value.length === 'number') {
        let text = ''
        for (let i = 0; i < value.length; i++) {
          text += String.fromCharCode(value[i])
        }
        try {
          return JSON.parse(text)
        } catch (e) {
          return null
        }
      }
      return value
    }

    let records
    try {
      records = app.findAllRecords('tasks')
    } catch (e) {
      console.log('normalize_recurrence_days: could not load tasks:', e)
      return
    }

    for (const record of records) {
      // Guard every record individually: a single problematic row must never
      // abort the whole migration (which would block PocketBase from starting
      // in production). Worst case a row is left untouched and logged.
      try {
        const days = decodeJsonField(record.get('recurrenceDays'))
        if (!Array.isArray(days) || days.length === 0) continue

        const seen = {}
        const normalized = []
        let changed = false
        for (const value of days) {
          let day = Number(value)
          if (day === 7) {
            day = 0
            changed = true
          }
          if (!Number.isInteger(day) || day < 0 || day > 6) {
            changed = true
            continue
          }
          if (seen[day]) {
            changed = true
            continue
          }
          seen[day] = true
          normalized.push(day)
        }
        normalized.sort((a, b) => a - b)

        if (changed) {
          record.set('recurrenceDays', normalized)
          app.save(record)
        }
      } catch (e) {
        console.log('normalize_recurrence_days: skipped record ' + record.id + ': ' + e)
      }
    }
  },
  (app) => {
    // Normalization is lossy (we cannot tell which 0s used to be 7s),
    // so there is nothing to roll back.
  },
)
