import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const explorationArtifacts = sqliteTable("exploration_artifacts", {
  id: text("id").primaryKey(),
  studyId: text("study_id").notNull(),
  datasetHash: text("dataset_hash").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});
