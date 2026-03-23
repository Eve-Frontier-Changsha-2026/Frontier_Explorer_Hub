import type Database from 'better-sqlite3';

export interface CursorState {
  cursorTx: string | null;
  cursorEvent: number | null;
}

export function getCursor(db: Database.Database): CursorState {
  const row = db
    .prepare('SELECT cursor_tx, cursor_event FROM event_cursor WHERE id = 1')
    .get() as { cursor_tx: string | null; cursor_event: number | null } | undefined;

  return {
    cursorTx: row?.cursor_tx ?? null,
    cursorEvent: row?.cursor_event ?? null,
  };
}

export function saveCursor(
  db: Database.Database,
  cursorTx: string,
  cursorEvent: number,
): void {
  db.prepare(
    'UPDATE event_cursor SET cursor_tx = ?, cursor_event = ?, updated_at = ? WHERE id = 1',
  ).run(cursorTx, cursorEvent, Date.now());
}

export function getCursorForPackage(db: Database.Database, packageKey: string): CursorState {
  const row = db
    .prepare('SELECT cursor_tx, cursor_event FROM event_cursors WHERE package_key = ?')
    .get(packageKey) as { cursor_tx: string | null; cursor_event: number | null } | undefined;
  return {
    cursorTx: row?.cursor_tx ?? null,
    cursorEvent: row?.cursor_event ?? null,
  };
}

export function saveCursorForPackage(
  db: Database.Database,
  packageKey: string,
  cursorTx: string,
  cursorEvent: number,
): void {
  db.prepare(
    `INSERT INTO event_cursors (package_key, cursor_tx, cursor_event, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(package_key) DO UPDATE SET cursor_tx = ?, cursor_event = ?, updated_at = ?`,
  ).run(packageKey, cursorTx, cursorEvent, Date.now(), cursorTx, cursorEvent, Date.now());
}
