import { RelationsDirectedGraph } from "./graphConstructor/createDependencyGraph"
import {
	DeduplicateJoinsPlugin,
	type SelectQueryBuilder,
	type Kysely,
} from "kysely"
import { ratio } from "fuzzball"
import { SwapBuilder } from "@tbui17/utils"
import Graph from "graphology"

import { allSimplePaths } from "graphology-simple-path"
import { isSubset } from "mnemonist/set"
import { toUndirected } from "graphology-operators"

import _ from "lodash"
import { bfsGraph, type InferGraphEdgeEntry } from "@tbui17/graph-functions/src"

import {
	reduceToMultiObject,
	slidingWindowMap,
} from "@tbui17/iteration-utilities"
import { type SqlGeneratorGraph } from "./graphConstructor/createSqlGeneratorGraph"
import { hasCycle } from "graphology-dag"
import { inferType } from "graphology-utils"
import { type JsonValue } from "type-fest"

export class SqlGenerator {
	constructor(
		private db: Kysely<any>,
		private graph: SqlGeneratorGraph
	) {}

	generateShortestJoinQuery(input: string[]) {
		if (input.length < 2) {
			throw new Error(
				"There must be at least 2 nodes in the provided array."
			)
		}

		const pipeline = _.flow(
			() => getShortestPath(this.graph, input),
			(nodes) => {
				const res = slidingWindowMap(nodes, ([node1, node2]) => {
					return _.flow(
						() => this.graph.edgeEntries(node1, node2),
						(entries) => Array.from(entries)[0],
						(entry) => resolveOrder(node1!, entry!)
					)()
				})
				return [res, res[0]!.table_name] as const
			},
			(args) => this.createJoinsFromResolvedEntry(...args)
		)
		return pipeline()
	}

	generateNeighborQuery(input: string) {
		const graph = this.graph

		return _.flow(
			() => graph.findNode((node) => node === input),
			(node) => {
				validate(graph, input, node)
				return node
			},
			(node) => {
				const resolved: ReturnType<typeof resolveOrder>[] = []
				for (const entry of graph.edgeEntries(node)) {
					resolved.push(resolveOrder(node, entry))
				}
				return [resolved, node] as const
			},
			(args) => this.createJoinsFromResolvedEntry(...args)
		)()
	}

	generateJoinQuery(input: string) {
		const graph = this.graph

		return _.flow(
			() => graph.findNode((node) => node === input),
			(node) => {
				validate(graph, input, node)
				return node
			},
			(node) => {
				const resolved: ReturnType<typeof resolveOrder>[] = []
				bfsGraph({
					graph,
					nodes: node,
					fn(ctx) {
						ctx.forEachEdgeEntry((entry) => {
							resolved.push(resolveOrder(ctx.source, entry))
						})
					},
				})
				return [resolved, node] as const
			},
			(args) => this.createJoinsFromResolvedEntry(...args)
		)()
	}

	private createJoinsFromResolvedEntry = (
		resolved: ReturnType<typeof resolveOrder>[],
		entity: string
	) => {
		return resolved.reduce(
			(
				qb,
				{
					foreign_table_name,
					column_name,
					table_name,
					foreign_column_name,
				}
			) => {
				return qb.innerJoin(
					foreign_table_name,
					`${table_name}.${column_name}`,
					`${foreign_table_name}.${foreign_column_name}`
				)
			},
			this.newQuery(entity)
		)
	}

	getStats(qb: SelectQueryBuilder<any, any, any>) {
		const tableNames = getTableNames(qb)
		const isCycle = hasCycle(this.graph)
		return getStats(tableNames, isCycle)
	}

	private newQuery(table: string) {
		return this.db
			.withPlugin(new DeduplicateJoinsPlugin())
			.selectFrom(table)
			.selectAll()
	}
}

function validate(
	graph: Graph,
	tableName: string,
	node: string | undefined
): asserts node is NonNullable<typeof node> {
	if (node) {
		return
	}
	const nodes = graph.filterNodes((s) => ratio(s, tableName) > 70)
	let message = `table ${tableName} not found`
	if (nodes.length > 0) {
		message += ` did you mean any of the following ${nodes.join(", ")}?`
	}
	throw new Error(message)
}

function resolveOrder(
	node: string,
	{ source, attributes }: InferGraphEdgeEntry<SqlGeneratorGraph>
) {
	return source === node
		? attributes
		: new SwapBuilder(attributes)
				.swap("table_name", "foreign_table_name")
				.swap("column_name", "foreign_column_name")
				.build()
}

function toJsonTree(graph: Graph) {
	const { isCycle, graphType } = {
		isCycle: hasCycle(graph),
		graphType: inferType(graph),
	}

	if (isCycle || graphType !== "directed") {
		const msg = {
			message: "graph must be a dag",
			isCycle,
			graphType,
		}
		throw new Error(JSON.stringify(msg, null, 4))
	}
	const top = graph.filterNodes((s) => {
		return graph.inboundDegree(s) === 0
	})

	const root: Record<string, JsonValue> = {}
	let min = 0

	bfsGraph({
		graph,
		nodes: top,
		fn(ctx) {
			// setting path should be ok if iterating from top to bottom and subsequent paths are always equal or longer in length
			if (ctx.path.length < min) {
				throw new Error("path length is less than min")
			}
			min = ctx.path.length
			_.set(root, ctx.path, "")
		},
		opts: {
			ignoreTraversalToOtherInputNodes: true,
			neighborStrategy: "forEachNeighbor",
		},
	})

	return root
}

function getTableNames(qb: SelectQueryBuilder<any, any, any>) {
	return (qb.compile().query as Query).joins!.map((query) => {
		const leftTable =
			query?.on?.on?.leftOperand?.table?.table?.identifier?.name
		const rightTable =
			query?.on?.on?.rightOperand?.table?.table?.identifier?.name
		if (leftTable === undefined || rightTable === undefined) {
			throw new Error("table name not found")
		}

		const res: [leftTable: string, rightTable: string] = [
			leftTable,
			rightTable,
		]
		return res
	})
}

function getStats(
	tableNames: [leftTable: string, rightTable: string][],
	isCycle: boolean
) {
	const joinDataProcessor = isCycle
		? () => {
				return reduceToMultiObject(tableNames, (curr) => curr)
			}
		: () => {
				return _.chain(
					new Graph({
						type: "directed",
						multi: false,
						allowSelfLoops: false,
					})
				)
					.tap((dag) => {
						for (const [leftTable, rightTable] of tableNames) {
							dag.mergeDirectedEdge(leftTable, rightTable)
						}
					})
					.thru((dag) => toJsonTree(dag))
					.value()
			}
	const tableDataProcessor = () => {
		return _.chain(tableNames)
			.reduce(
				(acc, [leftTable, rightTable]) =>
					acc.add(leftTable).add(rightTable),
				new Set<string>()
			)
			.thru((res) => Array.from(res))
			.thru((tables) => {
				return {
					tables,
					tableCount: tables.length,
				}
			})
			.value()
	}

	return {
		date: new Date().toLocaleString(),
		...tableDataProcessor(),
		joins: joinDataProcessor(),
	}
}

export function getShortestPath(graph: Graph, input: string[]) {
	const inputSet = new Set(input)
	return _.chain(graph)
		.thru((graph) => toUndirected(graph))
		.thru((graph) => allSimplePaths(graph, input[0]!, input[1]!))
		.map((path) => new Set(path))
		.filter((set) => isSubset(inputSet, set))
		.minBy((set) => set.size)
		.tap((set) => {
			if (!set) {
				throw new Error("No possible joins found.")
			}
		})
		.thru((set) => Array.from(set))
		.value()
}

type Query = {
	kind?: string | undefined
	from?:
		| {
				kind?: string | undefined
				froms?:
					| {
							kind?: "TableNode" | undefined
							table?:
								| {
										kind?:
											| "SchemableIdentifierNode"
											| undefined
										schema?: null | undefined
										identifier?:
											| {
													kind?:
														| "IdentifierNode"
														| undefined
													name?: string | undefined
											  }
											| undefined
								  }
								| undefined
					  }[]
					| undefined
		  }
		| undefined
	selections?:
		| {
				kind?: string | undefined
				selection?:
					| {
							kind?: string | undefined
					  }
					| undefined
		  }[]
		| undefined
	distinctOn?: null | undefined
	joins?:
		| {
				kind?: "JoinNode" | undefined
				joinType?: "InnerJoin" | undefined
				table?:
					| {
							kind?: "TableNode" | undefined
							table?:
								| {
										kind?:
											| "SchemableIdentifierNode"
											| undefined
										schema?: null | undefined
										identifier?:
											| {
													kind?:
														| "IdentifierNode"
														| undefined
													name?: string | undefined
											  }
											| undefined
								  }
								| undefined
					  }
					| undefined
				on?:
					| {
							kind?: "OnNode" | undefined
							on?:
								| {
										kind?: "BinaryOperationNode" | undefined
										leftOperand?:
											| {
													kind?:
														| "ReferenceNode"
														| undefined
													column?:
														| {
																kind?:
																	| "ColumnNode"
																	| undefined
																column?:
																	| {
																			kind?:
																				| "IdentifierNode"
																				| undefined
																			name?:
																				| string
																				| undefined
																	  }
																	| undefined
														  }
														| undefined
													table?:
														| {
																kind?:
																	| "TableNode"
																	| undefined
																table?:
																	| {
																			kind?:
																				| "SchemableIdentifierNode"
																				| undefined
																			schema?:
																				| null
																				| undefined
																			identifier?:
																				| {
																						kind?:
																							| "IdentifierNode"
																							| undefined
																						name?:
																							| string
																							| undefined
																				  }
																				| undefined
																	  }
																	| undefined
														  }
														| undefined
											  }
											| undefined
										operator?:
											| {
													kind?:
														| "OperatorNode"
														| undefined
													operator?: "=" | undefined
											  }
											| undefined
										rightOperand?:
											| {
													kind?:
														| "ReferenceNode"
														| undefined
													column?:
														| {
																kind?:
																	| "ColumnNode"
																	| undefined
																column?:
																	| {
																			kind?:
																				| "IdentifierNode"
																				| undefined
																			name?:
																				| string
																				| undefined
																	  }
																	| undefined
														  }
														| undefined
													table?:
														| {
																kind?:
																	| "TableNode"
																	| undefined
																table?:
																	| {
																			kind?:
																				| "SchemableIdentifierNode"
																				| undefined
																			schema?:
																				| null
																				| undefined
																			identifier?:
																				| {
																						kind?:
																							| "IdentifierNode"
																							| undefined
																						name?:
																							| string
																							| undefined
																				  }
																				| undefined
																	  }
																	| undefined
														  }
														| undefined
											  }
											| undefined
								  }
								| undefined
					  }
					| undefined
		  }[]
		| undefined
	groupBy?: null | undefined
	orderBy?: null | undefined
	where?: null | undefined
	frontModifiers?: null | undefined
	endModifiers?: null | undefined
	limit?: null | undefined
	offset?: null | undefined
	with?: null | undefined
	having?: null | undefined
	explain?: null | undefined
	setOperations?: null | undefined
}
