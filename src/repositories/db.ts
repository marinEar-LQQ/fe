import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AnalysisResult, Note, ReviewEvent, TaskVersion, Utterance } from '../contracts/types'

/**
 * IndexedDB 저장소 (작업·분석·검토·메모·음성 Blob)
 * - 대용량 음성은 localStorage 에 넣지 않는다.
 * - 스키마를 바꾸면 DB_VERSION 을 올리고 upgrade 에 migration 을 추가한다.
 */
export const DB_NAME = 'marinear'
export const DB_VERSION = 1

interface MarinEarDB extends DBSchema {
  meta: { key: string; value: { key: string; value: unknown } }
  taskVersions: { key: [string, number]; value: TaskVersion; indexes: { byTask: string } }
  utterances: { key: string; value: Utterance; indexes: { byTask: string } }
  results: { key: [string, number]; value: AnalysisResult; indexes: { byUtterance: string } }
  reviewEvents: { key: string; value: ReviewEvent; indexes: { byUtterance: string } }
  notes: { key: string; value: Note; indexes: { byTask: string } }
  audioBlobs: {
    key: [string, string]
    value: { utteranceId: string; variant: 'raw' | 'enhanced'; blob: Blob | null; mime: string; deleted: boolean }
  }
}

export type Db = IDBPDatabase<MarinEarDB>

let dbPromise: Promise<Db> | null = null

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = openDB<MarinEarDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('meta', { keyPath: 'key' })
          db.createObjectStore('taskVersions', { keyPath: ['taskId', 'version'] }).createIndex('byTask', 'taskId')
          db.createObjectStore('utterances', { keyPath: 'utteranceId' }).createIndex('byTask', 'taskId')
          db.createObjectStore('results', { keyPath: ['utteranceId', 'revision'] }).createIndex('byUtterance', 'utteranceId')
          db.createObjectStore('reviewEvents', { keyPath: 'eventId' }).createIndex('byUtterance', 'utteranceId')
          db.createObjectStore('notes', { keyPath: 'noteId' }).createIndex('byTask', 'taskId')
          db.createObjectStore('audioBlobs', { keyPath: ['utteranceId', 'variant'] })
        }
      },
    })
  }
  return dbPromise
}

/** 테스트용: 연결 초기화 */
export function resetDbConnection() {
  dbPromise = null
}

/* ───────── 메모 (프론트 직접 저장 · 엔진 계약 외) ───────── */
export async function listNotes(taskId: string): Promise<Note[]> {
  const db = await getDb()
  const notes = await db.getAllFromIndex('notes', 'byTask', taskId)
  return notes.sort((a, b) => a.at.localeCompare(b.at))
}

export async function saveNote(note: Note): Promise<void> {
  const db = await getDb()
  await db.put('notes', note)
}

export async function deleteNote(noteId: string): Promise<void> {
  const db = await getDb()
  await db.delete('notes', noteId)
}
