import { retrieveGraphData } from "@tbui17/graphology-neo4j-migrator"
import _ from "lodash"
import { createDependencyGraph } from "./graphConstructor/createDependencyGraph"
import { type DbAccessService } from "."

export function toCypherData(
	data: Awaited<ReturnType<DbAccessService["getAll"]>>
) {
	const graph = createDependencyGraph(
		data.table_columns_view,
		data.relations,
		data.view_dependencies
	)
	const graphData = retrieveGraphData(graph)

	const nodeData = createJsonData(graphData.nodes.data)
	const edgeData = createJsonData(graphData.edges.data)

	const cypherData: CypherData = {
		edges: edgeData,
		nodes: nodeData,
		indexStatements: graphData.indexStatements,
	}

	const nodeCount = getDataCount(graphData.nodes.data)
	const edgeCount = getDataCount(graphData.edges.data)

	const countData = {
		nodeCount,
		edgeCount,
	}

	return {
		countData,
		cypherData,
	}
}

export interface CypherData {
	nodes: ReturnType<typeof createJsonData>
	edges: ReturnType<typeof createJsonData>
	indexStatements: string[]
}
function getDataCount(
	data:
		| ReturnType<typeof retrieveGraphData>["nodes"]["data"]
		| ReturnType<typeof retrieveGraphData>["edges"]["data"]
) {
	return _.chain(data)
		.map((s) => s.data.length)
		.reduce((acc, curr) => acc + curr, 0)
		.value()
}

function createJsonData(
	data:
		| ReturnType<typeof retrieveGraphData>["nodes"]["data"]
		| ReturnType<typeof retrieveGraphData>["edges"]["data"]
) {
	return _.mapValues(data, (v) => {
		return {
			params: v.builder.getBindParam().get(),
			statement: v.builder.getStatement(),
		}
	})
}
