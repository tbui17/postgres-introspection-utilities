import SuperJSON from "superjson"
import { Command, Option } from "commander"
import {
	DbAccessService,
	SqlGenerator,
	type PgIntrospectionConfig,
	toCypherData,
	getRelatedEntities,
} from "."
import { createSqlGeneratorGraph } from "./graphConstructor/createSqlGeneratorGraph"
import _ from "lodash"
import fs, { writeFileSync } from "fs"
import path from "path"
import { pathToFileURL } from "url"
import { createDependencyGraph } from "./graphConstructor/createDependencyGraph"
import { write } from "graphology-gexf"
import pProps from "p-props"
import { type SelectQueryBuilder } from "kysely"
import { GraphToCypherMigrator } from "@tbui17/graphology-neo4j-migrator"

function toStdout(input: unknown, space: number | undefined = undefined) {
	const result = enhancedStringify(input, space)
	process.stdout.write(result)
}
function enhancedStringify(
	input: unknown,
	space: number | undefined = undefined
) {
	if (typeof input === "string") {
		return input
	}
	if (typeof input === "bigint") {
		return input.toString()
	}
	if (input instanceof Date) {
		return input.toISOString()
	}
	return JSON.stringify(SuperJSON.serialize(input).json, null, space)
}

async function getConfigs() {
	const file = pathToFileURL(
		path.resolve(process.cwd(), "pgIntrospection.config.mjs")
	)

	if (fs.existsSync(file)) {
		// @ts-expect-error - dynamic import
		const { default: config } = await import(file)
		return config as PgIntrospectionConfig
	}

	// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
	throw new Error(`no config file found at ${file}`)
}
const sqlCompiler = (
	opts: Record<string, unknown>,
	generator: SqlGenerator,
	qb: SelectQueryBuilder<any, any, any>
) => {
	if (opts.stats) {
		return _.flow(
			() => generator.getStats(qb),
			(stats) => JSON.stringify(stats, null, 4),
			(statStr) => `/**\n${statStr}\n**/\n\n`,
			(str) => str + qb.compile().sql
		)()
	}
	return qb.compile().sql
}

const statOpt = new Option("-st --stats", "show stats")

export async function introspectionCli() {
	const program = new Command()
	const config = await getConfigs()
	const dbAccessService = DbAccessService.fromPgConfigs(config.pgConfig)

	const showRelated = program.command("showRelated <input>")
	showRelated
		.description(
			"Provide a table/view name. Generates a list of all tables/views related to the provided table/view."
		)
		.action(async (input: string) => {
			const data = await dbAccessService.getAll()
			const graph = createDependencyGraph(
				data.table_columns_view,
				data.relations,
				data.view_dependencies
			)
			const res = getRelatedEntities(input, graph)

			toStdout(res)
		})

	const fullSql = program.command("fullSql <input>")
	fullSql
		.description(
			"Provide a table name. Generates a sql query joining all related tables and their neighbors recursively."
		)
		.addOption(statOpt)
		.action(async (input: string) => {
			const { relations, tableColumnsView } = await pProps({
				relations: dbAccessService.getRelations(),
				tableColumnsView: dbAccessService.getTableColumnsView(),
			})
			const generator = new SqlGenerator(
				dbAccessService.db,
				createSqlGeneratorGraph(relations, tableColumnsView)
			)
			const qb = generator.generateJoinQuery(input)
			const res = sqlCompiler(fullSql.opts(), generator, qb)
			toStdout(res)
		})

	const shortSql = program.command("shortSql [input...]")
	shortSql
		.description(
			"Provide 2 or more table names. Generates the shortest sql query possible that joins all provided tables by finding intermediate tables that connect them. Command performance decreases significantly with the amount of tables provided."
		)
		.addOption(statOpt)
		.action(async (input: string[]) => {
			const { relations, tableColumnsView } = await pProps({
				relations: dbAccessService.getRelations(),
				tableColumnsView: dbAccessService.getTableColumnsView(),
			})
			const generator = new SqlGenerator(
				dbAccessService.db,
				createSqlGeneratorGraph(relations, tableColumnsView)
			)

			const qb = generator.generateShortestJoinQuery(input)

			const res = sqlCompiler(shortSql.opts(), generator, qb)

			toStdout(res)
		})
	const neighborSql = program
		.command("neighborSql <input>")
		.description(
			"Generates a join query that gets all tables that have a direct relation to the provided table."
		)
		.addOption(statOpt)
		.action(async (input: string) => {
			const { relations, tableColumnsView } = await pProps({
				relations: dbAccessService.getRelations(),
				tableColumnsView: dbAccessService.getTableColumnsView(),
			})
			const generator = new SqlGenerator(
				dbAccessService.db,
				createSqlGeneratorGraph(relations, tableColumnsView)
			)
			const qb = generator.generateNeighborQuery(input)
			const res = sqlCompiler(neighborSql.opts(), generator, qb)
			toStdout(res)
		})
	const dependencyGraph = program.command("dependencyGraph [fileLocation]")
	dependencyGraph
		.description(
			"Generates a gexf file containing a dependency graph of the database's tables and views in the public schema. By default, the file is saved as dependencyGraph.gexf in the current directory."
		)
		.action(async ([fileLocation = "dependencyGraph.gexf"]) => {
			const data = await dbAccessService.getAll()
			const graph = createDependencyGraph(
				data.table_columns_view,
				data.relations,
				data.view_dependencies
			)
			const gexf = write(graph)
			writeFileSync(fileLocation, gexf, "utf8")
			console.log(`Successfully saved graph to ${fileLocation}`)
		})
	const toCypherJson = program.command("toCypherJson [fileLocation]")
	const toCypherJsonDefaultFileName = "cypherData.json"
	toCypherJson
		.description(
			`Generates json files containing cypher statements and graph data for importing the database's tables and views in the public schema into Neo4j. By default, the file is saved to ${toCypherJsonDefaultFileName}`
		)
		.action(async (fileLocation = toCypherJsonDefaultFileName) => {
			const { countData, cypherData } = toCypherData(
				await dbAccessService.getAll()
			)
			const msg = {
				message: `Successfully saved cypher data to ${fileLocation}`,
				countData,
			}
			console.log(JSON.stringify(msg, null, 2))
			writeFileSync(fileLocation, JSON.stringify(cypherData), "utf8")
		})

	const schemaToNeo4j = program.command("schemaToNeo4j")
	schemaToNeo4j
		.description(
			`Inserts introspection data into Neo4j. Requires a config file with neo4jConfig.`
		)
		.action(async () => {
			const data = await dbAccessService.getAll()
			const graph = createDependencyGraph(
				data.table_columns_view,
				data.relations,
				data.view_dependencies
			)
			if (!config.neo4jConfig) {
				throw new Error("No neo4j config provided")
			}

			const migrator = new GraphToCypherMigrator({
				graph,
				...config.neo4jConfig,
			})
			const results = await migrator.run()
			console.log(results)
		})

	program.parse()
}

