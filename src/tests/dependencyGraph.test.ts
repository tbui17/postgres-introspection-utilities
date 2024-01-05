import { describe, expect, it } from "vitest"
import { createDependencyGraph } from "../graphConstructor/createDependencyGraph"
import { type Relations } from "../models/relationsSchema"
import { type ViewDependencies } from "../models/viewDependenciesSchema"
import { faker } from "@faker-js/faker"
import { type TableColumnsView } from "../models/tableColumnsViewSchema"
import _ from "lodash"
import { getGraphEdgesOfType } from "@tbui17/graph-functions/src"
import { write } from "graphology-gexf"
import { writeFileSync } from "fs"

function createEdge<const T1 extends string, const T2 extends string>(
	source: T1,
	target: T2
) {
	return {
		constraint_name: `${source}_to_${target}` as const,
		column_name: "column1",
		foreign_column_name: "column1",
		foreign_table_name: source,
		table_name: target,
	} as const satisfies Relations
}
function createTableColumnsView() {
	const tableColumnsView: TableColumnsView[] = []
	_.times(3, (i) => {
		i = i + 1
		const table_name = `table${i}`
		_.times(3, (j) => {
			j += 1
			const column_name = `column${j}`
			tableColumnsView.push({
				table_name,
				column_name,
				data_type: faker.database.type(),
			})
		})
	})
	_.times(3, (i) => {
		i = i + 1
		const table_name = `view${i}`
		_.times(3, (j) => {
			j += 1
			const column_name = `column${j}`
			tableColumnsView.push({
				table_name,
				column_name,
				data_type: faker.database.type(),
			})
		})
	})
	return tableColumnsView
}

describe("createDependencyGraph", () => {
	const tableColumnsView = createTableColumnsView()

	const relations: Relations[] = [
		createEdge("table1", "table2"),
		createEdge("table1", "table3"),
	]
	const viewDependencies: ViewDependencies[] = [
		{
			dependent_view: "view1",
			source_tables: {
				table1: ["column1", "column2"],
				table2: ["column1"],
			},
		},
		{
			dependent_view: "view2",
			source_tables: {
				table2: ["column1", "column2"],
			},
		},
		{
			dependent_view: "view3",
			source_tables: {
				view1: ["column1", "column2"],
			},
		},
	]

	const graph = createDependencyGraph(
		tableColumnsView,
		relations,
		viewDependencies
	)

	const { tableRelations, viewRelations } = getGraphEdgesOfType(graph, {
		tableRelations: true,
		viewRelations: true,
	})

	it("should have 2 table relations and 4 view relations", () => {
		expect(tableRelations).toHaveLength(2)
		expect(viewRelations).toHaveLength(4)
		writeFileSync("graph.json", JSON.stringify(graph.export()))
	})

	it("should have table relation 1 -> 2 and 1 -> 3", () => {
		const table1Edge = tableRelations.find(
			(edge) =>
				edge.attributes.type === "tableRelations" &&
				edge.source === "table1" &&
				edge.target === "table2"
		)
		expect(table1Edge).toBeDefined()
		const table2Edge = tableRelations.find(
			(edge) =>
				edge.attributes.type === "tableRelations" &&
				edge.source === "table1" &&
				edge.target === "table3"
		)
		const gexf = write(graph)
		writeFileSync("testGraph.gexf", gexf, "utf8")
		expect(table2Edge).toBeDefined()
	})
	it("should have table-view relation table1 -> view1 and view-view relation 1 -> 3 ", () => {
		const table1ToView1 = viewRelations.find(
			(edge) => edge.source === "table1" && edge.target === "view1"
		)
		const view1ToView3 = viewRelations.find(
			(edge) => edge.source === "view1" && edge.target === "view3"
		)
		expect(table1ToView1).toBeDefined()
		expect(view1ToView3).toBeDefined()
	})
})
