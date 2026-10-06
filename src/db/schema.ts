import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  smallint,
  pgEnum,
  timestamp,
  boolean,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Better Auth (email/senha)                                           */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Finanças                                                            */
/* ------------------------------------------------------------------ */

export const tableKind = pgEnum("table_kind", ["in", "out", "sub"]);
export const frequency = pgEnum("frequency", ["once", "monthly", "yearly", "installments"]);
export const entrySource = pgEnum("entry_source", ["manual", "ai_text", "ai_photo", "ai_audio", "import"]);

/** Um "household" = as finanças compartilhadas (você + esposa). */
export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inviteToken: text("invite_token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] }), uniqueIndex("member_user_unique").on(t.userId)],
);

/** Entradas, Saídas, Cartão de crédito, Assinaturas… */
export const finTables = pgTable(
  "fin_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: tableKind("kind").notNull(),
    color: text("color").notNull().default("#6B4BB0"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("fin_tables_household_idx").on(t.householdId)],
);

/** Linhas: Luz, Internet, Cartão de crédito… */
export const lines = pgTable(
  "lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => finTables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** true = valor calculado a partir de line_sources */
    isLinked: boolean("is_linked").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("lines_table_idx").on(t.tableId)],
);

/** Origens de uma linha vinculada: tabela inteira OU linha específica, com sinal. */
export const lineSources = pgTable(
  "line_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => lines.id, { onDelete: "cascade" }),
    refTableId: uuid("ref_table_id").references(() => finTables.id, { onDelete: "cascade" }),
    refLineId: uuid("ref_line_id").references(() => lines.id, { onDelete: "cascade" }),
    sign: smallint("sign").notNull().default(1),
  },
  (t) => [index("line_sources_line_idx").on(t.lineId)],
);

/** Regra de recorrência. As ocorrências ficam materializadas em entries. */
export const series = pgTable("series", {
  id: uuid("id").primaryKey().defaultRandom(),
  lineId: uuid("line_id")
    .notNull()
    .references(() => lines.id, { onDelete: "cascade" }),
  frequency: frequency("frequency").notNull(),
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
  startMonth: date("start_month").notNull(),
  /** null = sem data final */
  endMonth: date("end_month"),
  installments: integer("installments"),
  /** até onde as ocorrências já foram geradas */
  generatedThrough: date("generated_through").notNull(),
});

/** Cada ocorrência mensal e cada gasto avulso. Valor da célula = SUM(amount_cents). */
export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => lines.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
    month: date("month").notNull(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description"),
    occurredOn: date("occurred_on"),
    source: entrySource("source").notNull().default("manual"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("entries_line_month_idx").on(t.lineId, t.month), index("entries_series_idx").on(t.seriesId)],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultLimitCents: integer("default_limit_cents").notNull(),
    alertPct: smallint("alert_pct").notNull().default(80),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("budgets_household_idx").on(t.householdId)],
);

export const budgetSources = pgTable("budget_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  budgetId: uuid("budget_id")
    .notNull()
    .references(() => budgets.id, { onDelete: "cascade" }),
  refTableId: uuid("ref_table_id").references(() => finTables.id, { onDelete: "cascade" }),
  refLineId: uuid("ref_line_id").references(() => lines.id, { onDelete: "cascade" }),
  sign: smallint("sign").notNull().default(1),
});

/** Só os meses cujo limite é diferente do padrão. */
export const budgetLimits = pgTable(
  "budget_limits",
  {
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    limitCents: integer("limit_cents").notNull(),
  },
  (t) => [primaryKey({ columns: [t.budgetId, t.month] })],
);
