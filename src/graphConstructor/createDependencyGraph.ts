import _ from "lodash"
import Graph from "graphology"

import {
	createDeduplicatedStore,
	type TableColumnsView,
} from "../models/tableColumnsViewSchema"
import { type Relations } from "../models/relationsSchema"
import { type ViewDependencies } from "../models/viewDependenciesSchema"

interface BaseNode<TType extends string = string> {
	type: TType
	label: string
}

interface TableColumnsViewNode extends BaseNode {
	type: "table" | "view"
	columns: {
		column_name: string
		data_type: string
	}[]
}

interface TableRelationsEdge extends BaseNode {
	type: "tableRelations"
	table_name: string
	column_name: string
	constraint_name: string
	foreign_table_name: string
	foreign_column_name: string
}

interface ViewRelationsEdge extends BaseNode {
	type: "viewRelations"
	view: string
	table: string
	columns: string[]
}

export type RelationsDirectedGraph = Graph<
	TableColumnsViewNode,
	TableRelationsEdge | ViewRelationsEdge
>

export class RelationsGraphLoader {
	constructor(public graph: RelationsDirectedGraph) {}

	loadTableColumnsView(table_columns_view: TableColumnsView[]) {
		_.chain(table_columns_view)
			.thru((s) => createDeduplicatedStore(s))
			.each((v, k) => {
				const nodeAttributes: TableColumnsViewNode = {
					type: "table",
					label: k,
					columns: v,
				}
				this.graph.mergeNode(k, nodeAttributes)
			})
			.value()
		return this
	}

	loadViewDependencies(view_dependencies: ViewDependencies[]) {
		view_dependencies.forEach((entry) => {
			_.each(entry.source_tables, (columns, table) => {
				this.graph.addDirectedEdge(table, entry.dependent_view, {
					type: "viewRelations",
					label: `${table} -> ${entry.dependent_view}`,
					view: entry.dependent_view,
					columns,
					table,
				})
			})
		})

		return this
	}

	loadRelations(relations: Relations[]) {
		relations.forEach((entry) => {
			const edgeAttributes: TableRelationsEdge = {
				type: "tableRelations",
				...entry,
				label: entry.constraint_name,
			}
			this.graph.addDirectedEdgeWithKey(
				entry.constraint_name,
				entry.foreign_table_name,
				entry.table_name,
				edgeAttributes
			)
		})
		return this
	}

	updateViewTypes(view_dependencies: ViewDependencies[]) {
		view_dependencies.forEach(({ dependent_view }) => {
			this.graph.updateNodeAttribute(dependent_view, "type", () => "view")
		})
		return this
	}
}

export function createDependencyGraph(
	table_columns_view: TableColumnsView[],
	relations: Relations[],
	view_dependencies: ViewDependencies[]
) {
	const graph: RelationsDirectedGraph = new Graph()
	new RelationsGraphLoader(graph)
		.loadTableColumnsView(table_columns_view)
		.loadViewDependencies(view_dependencies)
		.loadRelations(relations)
		.updateViewTypes(view_dependencies)

	return graph
}
