/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module '*.astro' {
  const Component: import('astro').AstroComponentFactory
  export default Component
}

declare namespace App {
  interface Locals {
    db: import('./db.ts').Db
    user: import('./auth/jwt.ts').UserPayload | null
  }
}
