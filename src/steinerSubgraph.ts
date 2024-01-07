import { toUndirected } from "graphology-operators"
import { mapCallbackParametersToEdgeEntry } from "@tbui17/graph-functions/src"
import { allPairsEach } from "@tbui17/iteration-utilities"
import Graph from "graphology"
import { bidirectional } from "graphology-shortest-path"
import { type NodeEntry, type EdgeEntry } from "graphology-types"

/**
 * Assumes provided graph is an unweighted DAG.
 *
 * Retrieves smallest subgraph containing all specified nodes.
 */
export function steinerSubgraph(graph: Graph, nodes: string[]) {
	const undirectedGraph = toUndirected(graph)
	const subgraph = new Graph()
	mergeKeyNodeComponentIntoSubgraph(nodes, undirectedGraph, subgraph)
	return subgraph
}

class ItemMap<T> {
	private map = new Map<string, T>()

	constructor(public selector: (item: T) => string) {}

	get data() {
		return Array.from(this.map.values())
	}

	add(item: T) {
		const res = this.selector(item)
		if (this.map.has(res)) {
			return this
		}
		this.map.set(res, item)

		return this
	}
	addDelayed(key: string, fn: () => T) {
		if (this.map.has(key)) {
			return this
		}
		this.add(fn())
		return this
	}

	has(item: T) {
		return this.map.has(this.selector(item))
	}

	hasKey(key: string) {
		return this.map.has(key)
	}
}

function mergeKeyNodeComponentIntoSubgraph(
	keyNodes: string[],
	graph: Graph,
	subgraph: Graph
) {
	const { nodes, edges } = prepareSubgraphData(graph, keyNodes)
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

class SteinerSubgraphError extends Error {
	constructor(nodeA: string, nodeB: string, nodeInput: string[]) {
		const msg = {
			message: `Provided nodes are not connected.`,
			nodeA,
			nodeB,
			nodeInput,
		}
		const message = JSON.stringify(msg)
		super(message)
		this.name = "SteinerSubgraphError"
	}
}

function prepareSubgraphData(graph: Graph, nodeInput: string[]) {
	const nodeCollection = new ItemMap<NodeEntry>((node) => node.node)
	const edgeCollection = new ItemMap<EdgeEntry>((edge) => edge.edge)
	const nodeCollectionAdder = (node: string) => {
		nodeCollection.add({
			node,
			attributes: graph.getNodeAttributes(node),
		})
	}
	const shortestPathAdder = (path: string[]) => {
		allPairsEach(path, (nodeA2, nodeB2) => {
			nodeCollectionAdder(nodeA2)
			nodeCollectionAdder(nodeB2)
			graph.forEachEdge(nodeA2, nodeB2, (...args) => {
				const edge = mapCallbackParametersToEdgeEntry(args)
				edgeCollection.add(edge)
			})
		})
	}

	allPairsEach(nodeInput, (nodeA, nodeB) => {
		const path = bidirectional(graph, nodeA, nodeB)
		if (!path) {
			throw new SteinerSubgraphError(nodeA, nodeB, nodeInput)
		}
		shortestPathAdder(path)
	})
	return {
		nodes: nodeCollection.data,
		edges: edgeCollection.data,
	}
}
