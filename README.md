# postgres-introspection-utilities

# Setup

- Create a 'pgIntrospection.config.mjs' file in the root directory and export a config object containing settings derived from pg.PoolConfig and neo4j.Config (optional, only required for neo4j features). Import the provided type for autocomplete. See default config example below.

```javascript
import { config as configenv } from "dotenv"
configenv()

/**
 * @type {import("@tbui17/neo4j-postgres-introspection-utilities").PgIntrospectionConfig}
 */
const config = {
	pgConfig: {
		connectionString: process.env.DATABASE_URL,
		idleTimeoutMillis: 1000,
	},
	neo4jConfig: {
		connectionDetails: {
			username: process.env.NEO4J_USERNAME,
			password: process.env.NEO4J_PASSWORD,
			url: process.env.NEO4J_URL,
			database: process.env.NEO4J_DATABASE,
		},
		whiteListSettings: {
			// change object to "ignore" string to run dangerously. Has risk of cypher injection. Cypher statements are generated dynamically from the "type" field of edges and nodes.
			whiteList: ["view", "table"],
			caseInsensitive: false,
		},
		neo4jOptions: {
			connectionLivenessCheckTimeout: 1000,
			maxConnectionLifetime: 1000,
		},
	},
}
export default config


```
# Workaround for ESM
- Create a script file such as "cli.ts" in the root directory and add the following.
```typescript
import { introspectionCli } from "@tbui17/postgres-introspection-utilities/src/introspectionCli"
introspectionCli()
```
- Run npm/yarn/pnpm tsx or install it globally and point it at the script file. You may add this to your package json scripts if you wish.

# Usage
```
Usage: introspectionCli [options] [command]

Options:
  -h, --help                      display help for command

Commands:
  showRelated <input>             Provide a table/view name. Generates a list of all tables/views related to the provided table/view.
  fullSql [options] <input>       Provide a table name. Generates a sql query joining all related tables and their neighbors recursively.
  shortSql [options] [input...]   Provide 2 or more table names. Generates the shortest sql query possible that joins all provided tables by finding intermediate tables that connect them.
  neighborSql [options] <input>   Generates a join query that gets all tables that have a direct relation to the provided table.
  dependencyGraph [fileLocation]  Generates a gexf file containing a dependency graph of the database's tables and views in the public schema. By default, the file is saved as dependencyGraph.gexf in the current directory.
  toCypherJson [fileLocation]     Generates json files containing cypher statements and graph data for importing the database's tables and views in the public schema into Neo4j. By default, the file is saved to cypherData.json
  schemaToNeo4j                   Inserts introspection data into Neo4j. Requires a config file with neo4jConfig.
  help [command]                  display help for command
```