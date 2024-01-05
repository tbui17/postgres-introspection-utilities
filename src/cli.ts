#!/usr/bin/env node
import SuperJSON from "superjson"
import { Command } from "commander"
import { DbAccessService, SqlGenerator } from "."
import { createSqlGeneratorGraph } from "./graphConstructor/createSqlGeneratorGraph"
import _ from "lodash"
import fs, { writeFileSync } from "fs"
import path from "path"
import { pathToFileURL } from "url"
import { createDependencyGraph } from "./graphConstructor/createDependencyGraph"
import { write } from "graphology-gexf"
import pProps from "p-props"
import { type SelectQueryBuilder, sql } from "kysely"

function toStdout(input: unknown) {
	const result = enhancedStringify(input)
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
		return config
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

export async function runCli() {
	const p = new Command()
	const config = await getConfigs()
	const dbAccessService = DbAccessService.fromPgConfigs(config)
	const fullSql = p.command("fullSql <input>")
	fullSql
		.description(
			"Provide a table name. Generates a sql query joining all related tables and their neighbors recursively."
		)
		.option("-st, --stats", "show stats")
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

	const shortSql = p.command("shortSql [input...]")
	shortSql
		.description(
			"Provide 2 or more table names. Generates the shortest sql query possible that joins all provided tables by finding intermediate tables that connect them."
		)
		.option("-st, --stats", "show stats")
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
	const dependencyGraph = p.command("dependencyGraph [fileLocation]")
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
			fs.writeFileSync("graph.json", JSON.stringify(graph.export()))
			const gexf = write(graph)
			writeFileSync(fileLocation, gexf, "utf8")
			console.log(`Successfully saved graph to ${fileLocation}`)
		})

	p.parse()
}
