import { beforeEach, describe, expect, it } from "vitest"
import { type Relations } from "../models/relationsSchema"
import { faker } from "@faker-js/faker"
import _ from "lodash"
import { SqlGenerator, resolveOrder } from ".."
import { Kysely, PostgresDialect, type SelectQueryBuilder } from "kysely"
import { createSqlGeneratorGraph } from "../graphConstructor/createSqlGeneratorGraph"
import pg from "pg"
import { allSimplePaths } from "graphology-simple-path"
import { type TableColumnsView } from "../models/tableColumnsViewSchema"

function createMockTableColumns(tableName: string): TableColumnsView[] {
	return _.times(10, (i) => {
		return {
			table_name: tableName,
			column_name: faker.database.column() + i,
			data_type: faker.database.type(),
		}
	})
}
/**
 Table1 --> Table2 --> Table3 --> Table4 --> Table5
    \                              ^
     \____________________________/
    
 Table6 --> Table7

 Table 8
**/
function createRelationsData(): Relations[] {
	const data: Omit<Relations, "table_columns" | "foreign_table_columns">[] = [
		{
			constraint_name: "table1_to_table2",
			table_name: "table1",
			column_name: "id",
			foreign_table_name: "table2",
			foreign_column_name: "id",
		},
		{
			constraint_name: "table1_to_table4",
			table_name: "table1",
			column_name: "id",
			foreign_table_name: "table4",
			foreign_column_name: "id",
		},

		{
			constraint_name: "table2_to_table3",
			table_name: "table2",
			column_name: "id",
			foreign_table_name: "table3",
			foreign_column_name: "id",
		},
		{
			constraint_name: "table3_to_table4",
			table_name: "table3",
			column_name: "id",
			foreign_table_name: "table4",
			foreign_column_name: "id",
		},

		{
			constraint_name: "table4_to_table5",
			table_name: "table4",
			column_name: "id",
			foreign_table_name: "table5",
			foreign_column_name: "id",
		},

		{
			constraint_name: "table6_to_table7",
			table_name: "table6",
			column_name: "id",
			foreign_table_name: "table7",
			foreign_column_name: "id",
		},
	]

	return data.map((entry): Relations => {
		return {
			...entry,
		}
	})
}
const db = new Kysely<any>({
	dialect: new PostgresDialect({
		pool: new pg.Pool({}),
	}),
})
const data = createRelationsData()
const tables = ["table1", "table2", "table3", "table4", "table5"]
const islandTables = ["table6", "table7"]
const soleTable = ["table8"]
const allTables = [...tables, ...islandTables, ...soleTable]
const tableData = allTables.flatMap(createMockTableColumns)

describe("SqlGenerator", () => {
	const graph = createSqlGeneratorGraph(data, tableData)

	const table1Edges = [...graph.outEdgeEntries("table1")]
	const generator = new SqlGenerator(db, graph)

	it("should have 8 nodes", () => {
		expect(graph.order).toBe(8)
	})

	it("should have 6 edges", () => {
		expect(graph.size).toBe(6)
	})

	it("1 should be able to traverse to 5 by two routes", () => {
		const paths = allSimplePaths(graph, "table1", "table5")
		expect(paths).toEqual(
			expect.arrayContaining([
				["table1", "table2", "table3", "table4", "table5"],
				["table1", "table4", "table5"],
			])
		)
	})

	describe("generateJoinQuery", () => {
		const qb = generator.generateJoinQuery("table1")
		const sql = qb.compile().sql

		it("core functionality", () => {
			const res = generator.generateJoinQueryHelper("table1")
			expect(tables.includes(res.node)).toBe(true)
		})

		it("table1 should have 2 out edges in graph", () => {
			expect(table1Edges).toHaveLength(2)
		})

		it("sql string should contain tables 1-5 excluding 6-7, 8", () => {
			tables.forEach((table) => {
				expect(sql).toContain(table)
			})
			islandTables.forEach((table) => {
				expect(sql).not.toContain(table)
			})
		})

		it("should have 4 joins", () => {
			// table 1-5 are connected; table 1 does not count since it is used in select statement
			expect(qb.toOperationNode().joins?.length).toBe(4)
		})

		it("basic functionality test", () => {
			expect(sql).toBe(
				`select * from "table1" inner join "table2" on "table1"."id" = "table2"."id" inner join "table4" on "table1"."id" = "table4"."id" inner join "table3" on "table2"."id" = "table3"."id" inner join "table5" on "table4"."id" = "table5"."id"`
			)
		})
	})

	describe("generateShortestJoinQuery", () => {
		it("core functionality steiner subgraph", () => {
			const graph = createSqlGeneratorGraph(data, tableData)
			const inp = ["table1", "table3", "table5"]

			const res = new SqlGenerator(
				db,
				graph
			).generateShortestJoinQueryHelper(inp, graph)

			if (res.type === "twoNode") {
				throw new Error("should not be two node")
			}
			expect(res.graph.nodes()).toEqual(
				expect.arrayContaining(["table1", "table3", "table4", "table5"])
			)
		})

		it("core functionality bidirectional shortest", () => {
			const graph = createSqlGeneratorGraph(data, tableData)
			const inp = ["table1", "table5"]

			const res = new SqlGenerator(
				db,
				graph
			).generateShortestJoinQueryHelper(inp, graph)

			if (res.type === "multiNode") {
				throw new Error("should not be multiNode")
			}
			const expected = [
				{
					constraint_name: "table1_to_table4",
					table_name: "table1",
					column_name: "id",
					foreign_table_name: "table4",
					foreign_column_name: "id",
				},
				{
					constraint_name: "table4_to_table5",
					table_name: "table4",
					column_name: "id",
					foreign_table_name: "table5",
					foreign_column_name: "id",
				},
			]
			expect(res.resolved).toEqual(expect.arrayContaining(expected))
		})

		it("should include tables 1, 4, 5 in sql", () => {
			const qb = generator.generateShortestJoinQuery(["table1", "table5"])
			const sql = qb.compile().sql
			expect(sql).toContain("table1")
			expect(sql).toContain("table4")
			expect(sql).toContain("table5")
		})

		it("basic functionality test", () => {
			const qb = generator.generateShortestJoinQuery(["table1", "table5"])
			const sql = qb.compile().sql
			expect(sql).toBe(
				`select * from "table1" inner join "table4" on "table1"."id" = "table4"."id" inner join "table5" on "table4"."id" = "table5"."id"`
			)
		})
	})

	describe("getStats", () => {
		it("should produce json tree of joins", () => {
			const qb = generator.generateJoinQuery("table1")
			const res = generator.getStats(qb)

			const expected = {
				table1: { table2: { table3: "" }, table4: { table5: "" } },
			}
			expect(res.joins).toEqual(expected)
		})

		tables.forEach((table) => {
			const qb = generator.generateJoinQuery(table)
			const res = generator.getStats(qb)
			it(
				"given table 1-5 should yield all 5 tables" + ` input:${table}`,
				() => {
					expect(res.tables).toHaveLength(5)
					expect(res.tables).toEqual(expect.arrayContaining(tables))
				}
			)
		})
	})
})

it("should realign edge attributes such that the foreign name and attributes belong to the opposing node when the edge's source node does not match the noed provided in the args", () => {
	const res = resolveOrder("table1", {
		source: "table2",
		attributes: {
			column_name: "id2",
			constraint_name: expect.any(String),
			foreign_column_name: "id",
			foreign_table_name: "table",
			table_name: "table2",
		},
	})
	expect(res).toEqual({
		column_name: "id",
		constraint_name: expect.any(String),
		foreign_column_name: "id2",
		foreign_table_name: "table2",
		table_name: "table",
	})
})
