import session from 'express-session';
import type { AppDb } from './types.js';

export default class SqliteSessionStore extends session.Store {
  private db: AppDb;

  constructor(db: AppDb) {
    super();
    this.db = db;
  }

  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void): void {
    try {
      const row = this.db
        .prepare('SELECT sess, expires FROM sessions_store WHERE sid = ?')
        .get<{ sess: string; expires: number | null }>(sid);
      if (!row) return callback(null, null);
      if (row.expires && row.expires <= Date.now()) {
        this.destroy(sid, () => callback(null, null));
        return;
      }
      callback(null, JSON.parse(row.sess) as session.SessionData);
    } catch (error) {
      callback(error);
    }
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    try {
      const expires = resolveExpires(sess);
      this.db
        .prepare(
          `INSERT INTO sessions_store (sid, sess, expires)
           VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`
        )
        .run(sid, JSON.stringify(sess), expires);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      this.db.prepare('DELETE FROM sessions_store WHERE sid = ?').run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid: string, sess: session.SessionData, callback?: () => void): void {
    const expires = resolveExpires(sess);
    this.db.prepare('UPDATE sessions_store SET expires = ? WHERE sid = ?').run(expires, sid);
    callback?.();
  }
}

function resolveExpires(sess: session.SessionData): number | null {
  if (sess.cookie?.expires) return new Date(sess.cookie.expires).getTime();
  if (typeof sess.cookie?.maxAge === 'number') return Date.now() + sess.cookie.maxAge;
  return null;
}
