import { z } from "zod"

export const relationsSchema = z.object({
	constraint_name: z.string(),
	table_name: z.string(),
	column_name: z.string(),
	foreign_table_name: z.string(),
	foreign_column_name: z.string(),
})

export type Relations = z.infer<typeof relationsSchema>
