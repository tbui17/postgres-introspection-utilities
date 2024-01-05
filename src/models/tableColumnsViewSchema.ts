import _ from "lodash"
import { z } from "zod"

export const tableColumnsViewSchema = z.object({
	table_name: z.string(),
	column_name: z.string(),
	data_type: z.string(),
})

export function createDeduplicatedStore(tableColumnsView: TableColumnsView[]) {
	return _.chain(tableColumnsView)
		.groupBy((entry) => entry.table_name)
		.mapValues((s) => s.map((s) => _.omit(s, ["table_name"])))
		.value()
}

export type TableColumnsView = z.infer<typeof tableColumnsViewSchema>
