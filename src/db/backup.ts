import { BACKUP_TABLES, db } from './db'

export interface BackupFile {
  app: 'elvora'
  version: 1
  exportedAt: string
  tables: Record<string, unknown[]>
}

export async function exportBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {}
  for (const name of BACKUP_TABLES) tables[name] = await db.table(name).toArray()
  return { app: 'elvora', version: 1, exportedAt: new Date().toISOString(), tables }
}

export function isBackup(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<BackupFile>
  return v.app === 'elvora' && v.version === 1 && !!v.tables && typeof v.tables === 'object'
}

/** Replaces all backed-up data with the contents of the file. */
export async function importBackup(file: BackupFile): Promise<void> {
  const tables = BACKUP_TABLES.map((n) => db.table(n))
  await db.transaction('rw', tables, async () => {
    for (const name of BACKUP_TABLES) {
      const rows = file.tables[name]
      await db.table(name).clear()
      if (Array.isArray(rows) && rows.length) await db.table(name).bulkPut(rows)
    }
  })
}

export async function eraseEverything(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
}

export function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
