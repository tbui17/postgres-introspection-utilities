import type { PoolConfig } from "pg"
import type { GraphToCypherMigrator } from "@tbui17/graphology-neo4j-migrator"

export interface PgIntrospectionConfig {
	pgConfig: PoolConfig
	neo4jConfig?: Neo4jConfig
}
export type Neo4jConfig = Omit<
	ConstructorParameters<typeof GraphToCypherMigrator>[0],
	"graph"
>
