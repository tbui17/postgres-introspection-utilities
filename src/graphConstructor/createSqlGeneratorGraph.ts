import _ from "lodash"

import { type Relations } from "../models/relationsSchema"
import Graph from "graphology"
import {
	type TableColumnsView,
	createDeduplicatedStore,
} from "../models/tableColumnsViewSchema"
import { type ViewDependencies } from "../models/viewDependenciesSchema"

export function createSqlGeneratorGraph(
	relations: Relations[],
	columns: TableColumnsView[]
) {
	const graph: SqlGeneratorGraph = new Graph()
	const columnsData = createDeduplicatedStore(columns)

	_.each(columnsData, (tableAttr, tableName) => {
		graph.mergeNode(tableName, {
			tableColumns: tableAttr,
		})
	})
	relations.forEach((entry) => {
		graph.addEdgeWithKey(
			entry.constraint_name,
			entry.table_name,
			entry.foreign_table_name,
			entry
		)
	})

	return graph
}
export type SqlGeneratorGraph = Graph<
	{ tableColumns: ReturnType<typeof createDeduplicatedStore>[string] },
	Relations
>

function validate(
	relations: Relations[],
	table_columns_view: TableColumnsView[],
	view_dependencies: ViewDependencies[]
) {
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
	_.chain(table_columns_view)
		.groupBy((s) => s.table_name)
		.each((v, k) => {
			const seen = new Set<string>()
			v.forEach((attr) => {
				if (seen.has(attr.column_name)) {
					throw new Error(
						`duplicate column name ${attr.column_name} found in table ${k}`
					)
				}
				seen.add(attr.column_name)
			})
		})
		.value()

	view_dependencies.forEach((v) => {
		_.each(v.source_tables, (columns) => {
			const seen = new Set<string>()
			columns.forEach((column) => {
				if (seen.has(column)) {
					throw new Error(
						`duplicate column name ${column} found in view ${v.dependent_view}`
					)
				}
				seen.add(column)
			})
		})
	})
}
