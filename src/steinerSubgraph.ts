import { toUndirected } from "graphology-operators"
import {
	bfsGraph,
	mapCallbackParametersToEdgeEntry,
} from "@tbui17/graph-functions/src"
import { allPairsEach } from "@tbui17/iteration-utilities"
import Graph from "graphology"
import { bidirectional } from "graphology-shortest-path"
import { type NodeEntry, type EdgeEntry } from "graphology-types"

type GraphChange = {
	node: string
	edges: EdgeEntry[]
}

/**
 * Assumes provided graph is an unweighted DAG.
 *
 * Retrieves smallest subgraph containing all specified nodes.
 */
export function steinerSubgraph(graph: Graph, nodes: string[]) {
	const undirectedGraph = toUndirected(graph)
	const subgraph = new Graph()
	const [f, ...rest] = nodes
	const keyNodeSet = new Set(nodes)
	const first = f!
	mergeKeyNodeComponent(nodes, undirectedGraph, subgraph)
	const notInKeyNodeSet = subgraph.filterNodes(
		(node) => !keyNodeSet.has(node)
	)
	dropExtraneousNodes(notInKeyNodeSet, subgraph, rest, first)
	return subgraph
}
function dropExtraneousNodes(
	notInKeyNodeSet: string[],
	subgraph: Graph,
	rest: string[],
	first: string
) {
	for (const node of notInKeyNodeSet) {
		const change: GraphChange = {
			node,
			edges: [...subgraph.edgeEntries(node)],
		}
		subgraph.dropNode(node)
		if (keyNodesAreConnected(subgraph, rest, first)) {
			continue
		}

		undo(subgraph, node, change)
	}
}

function keyNodesAreConnected(graph: Graph, rest: string[], first: string) {
	return rest.every((node) => canReach(graph, node, first))
}

function canReach(graph: Graph, node: string, target: string) {
	return bfsGraph({
		graph,
		nodes: node,
		fn(ctx) {
			if (ctx.target === target) {
				return true
			}
		},
	})
}

function undo(subgraph: Graph, node: string, change: GraphChange) {
	subgraph.addNode(node)
	for (const edge of change.edges) {
		subgraph.addEdgeWithKey(
			edge.edge,
			edge.source,
			edge.target,
			edge.attributes
		)
	}
}

function mergeKeyNodeComponent(
	nodeInput: string[],
	graph: Graph,
	subgraph: Graph
) {
	function dataPrep() {
		const seenNodes = new Set<string>()
		const seenEdges = new Set<string>()
		const nodes: NodeEntry[] = []
		const edges: EdgeEntry[] = []
		allPairsEach(nodeInput, (a, b) => {
			const path = bidirectional(graph, a, b)
			if (!path) {
				throw new Error("No joins possible")
			}

			allPairsEach(path, (a, b) => {
				if (!seenNodes.has(a)) {
					const attr = graph.getNodeAttributes(a)
					nodes.push({
						node: a,
						attributes: attr,
					})
					seenNodes.add(a)
				}
				if (!seenNodes.has(b)) {
					const attr = graph.getNodeAttributes(b)
					nodes.push({
						node: b,
						attributes: attr,
					})
					seenNodes.add(b)
				}

				graph.forEachEdge(a, b, (...args) => {
					const edge = mapCallbackParametersToEdgeEntry(args)
					if (!seenEdges.has(edge.edge)) {
						seenEdges.add(edge.edge)
						edges.push(edge)
					}
				})
			})
		})
		return { nodes, edges }
	}
	const { nodes, edges } = dataPrep()
	nodes.forEach((node) => {
		subgraph.addNode(node.node, node.attributes)
	})
	edges.forEach((edge) => {
		subgraph.addEdgeWithKey(
			edge.edge,
			edge.source,
			edge.target,
			edge.attributes
		)
	})
}
