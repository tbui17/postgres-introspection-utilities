import _ from "lodash"

import { type Relations } from "../models/relationsSchema"
import Graph from "graphology"
import {
	type TableColumnsView,
	createDeduplicatedStore,
} from "../models/tableColumnsViewSchema"

export function createSqlGeneratorGraph(
	relations: Relations[],
	columns: TableColumnsView[]
) {
	validate(relations)
	const graph: SqlGeneratorGraph = new Graph()
	const columnsData = createDeduplicatedStore(columns)

	_.chain(relations)

		.each((entry) => {
			graph.mergeNode(entry.table_name, {
				tableColumns: columnsData[entry.table_name],
			})
			graph.mergeNode(entry.foreign_table_name, {
				tableColumns: columnsData[entry.foreign_table_name],
			})
		})
		.each((entry) => {
			graph.addEdgeWithKey(
				entry.constraint_name,
				entry.table_name,
				entry.foreign_table_name,
				entry
			)
		})
		.value()
	return graph
}
export type SqlGeneratorGraph = Graph<
	{ tableColumns: ReturnType<typeof createDeduplicatedStore>[string] },
	Relations
>

function validate(relations: Relations[]) {
	const seen = new Set<string>()

	for (const entry of relations) {
		if (seen.has(entry.constraint_name)) {
			throw new Error(
				`duplicate constraint name ${
					entry.constraint_name
				} found. ${JSON.stringify(entry, null, 4)}`
			)
		}
		seen.add(entry.constraint_name)
	}
}
