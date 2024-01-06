import { bfsGraph } from "@tbui17/graph-functions/src"
import { type RelationsDirectedGraph } from "./graphConstructor/createDependencyGraph"
import { type InferGraphNode } from "@tbui17/graph-functions"

export function getRelatedEntities(
	entity: string,
	graph: RelationsDirectedGraph
) {
	const res: InferGraphNode<RelationsDirectedGraph>[] = []
	bfsGraph({
		graph,
		nodes: entity,
		fn(ctx) {
			res.push(ctx.targetAttributes())
		},
	})

	return res.map(({ type, label }) => ({ type, label }))
}
