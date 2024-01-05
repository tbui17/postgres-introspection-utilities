# postgres-introspection-utilities

# Setup

- Create a 'pgIntrospection.config.mjs' file in the root directory and export a pg.PoolConfig object like the example below.

```javascript
import {config:dotenvConfig} from "dotenv"
dotenvConfig()

/**
 * @type {import("pg").PoolConfig}
 */
const config = {
	connectionString: process.env.DATABASE_URL,
	idleTimeoutMillis: 100,
}

export default config

```

- Use 'pg-introspection-cli' as the entry point to the CLI.

# Usage
```
Usage: cli [options] [command]

Options:
  -h, --help                     display help for command

Commands:
  fullSql [options] <input>      Provide a table name. Generates a sql query joining all related tables and their neighbors recursively.
  shortSql [options] [input...]  Provide 2 or more table names. Generates the shortest sql query possible that joins all provided tables by finding intermediate tables that connect them.
  dependencyGraph [input...]     Generates a gexf file containing a dependency graph of the database's tables and views in the public schema. By default, the file is saved as dependencyGraph.gexf in the current directory.
  help [command]                 display help for command
```

# Programmatic use

- The library uses the following as its core:
  - DbAccessService: Retrieves table and view metadata from the database. Modify the queryStore property to change the SQL queries used. Override the methods to change how SQL is executed.
  - createDependencyGraph: Creates a dependency graph of the database's tables and views in the public schema along with their relations.
  - createSqlGeneratorGraph: Creates a graph of the database's tables and views that is used in the SqlGenerator class.
  - SqlGenerator: Provides core functionality for traversing the graph and generating an intermediate SQL builder (Kysely) which can be compiled.