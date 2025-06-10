import { pgTable, text, integer, timestamp, jsonb, boolean, serial } from "drizzle-orm/pg-core"

// Tabela para ebooks salvos na biblioteca
export const ebooks = pgTable("ebooks", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").unique().notNull(), // ID único gerado pela aplicação
  title: text("title").notNull(),
  description: text("description").notNull(),
  contentMode: text("content_mode").notNull(),
  status: text("status").notNull(), // queued, processing, completed, failed, partial
  totalPages: integer("total_pages").notNull(),
  completedPages: integer("completed_pages").default(0).notNull(),
  failedPages: integer("failed_pages").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// Tabela para páginas individuais dos ebooks
export const ebookPages = pgTable("ebook_pages", {
  id: serial("id").primaryKey(),
  ebookUuid: text("ebook_uuid").references(() => ebooks.uuid).notNull(),
  pageIndex: integer("page_index").notNull(),
  pageTitle: text("page_title").notNull(),
  content: text("content").default("").notNull(),
  status: text("status").default("pending").notNull(), // pending, completed, failed
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// Tabela para histórico de gerações
export const generationHistory = pgTable("generation_history", {
  id: serial("id").primaryKey(),
  ebookUuid: text("ebook_uuid").references(() => ebooks.uuid).notNull(),
  action: text("action").notNull(), // create, generate_page, complete, fail
  details: jsonb("details"), // dados adicionais em JSON
  timestamp: timestamp("timestamp").defaultNow().notNull(),
})

// Tabela para configurações do usuário (futuro)
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").unique(), // Para quando implementar auth
  defaultContentMode: text("default_content_mode").default("MEDIUM"),
  defaultPageCount: integer("default_page_count").default(15),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// Tipos TypeScript inferidos do esquema
export type Ebook = typeof ebooks.$inferSelect
export type NewEbook = typeof ebooks.$inferInsert
export type EbookPage = typeof ebookPages.$inferSelect
export type NewEbookPage = typeof ebookPages.$inferInsert
export type GenerationHistory = typeof generationHistory.$inferSelect
export type NewGenerationHistory = typeof generationHistory.$inferInsert
export type UserSettings = typeof userSettings.$inferSelect
export type NewUserSettings = typeof userSettings.$inferInsert
