declare module 'connect-sqlite3' {
  import { Store } from 'express-session';
  interface Options { dir?: string; db?: string; table?: string }
  export default function connectSqlite3(session: unknown): new (options?: Options) => Store;
}
