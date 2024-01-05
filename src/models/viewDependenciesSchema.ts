import { z } from "zod"

const columnsSchema = z.string().array()

export const viewDependenciesSchema = z.object({
	dependent_view: z.string(),
	source_tables: z.record(columnsSchema),
})

export type ViewDependencies = z.infer<typeof viewDependenciesSchema>
