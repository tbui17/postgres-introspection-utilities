import { readFileSync } from "fs"
import { sql, Kysely, PostgresDialect } from "kysely"
import _ from "lodash"
import pProps from "p-props"
import pg from "pg"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { tableColumnsViewSchema } from "./models/tableColumnsViewSchema"
import { relationsSchema } from "./models/relationsSchema"
import { viewDependenciesSchema } from "./models/viewDependenciesSchema"
const __dirname = dirname(fileURLToPath(import.meta.url))

const sqlQueries = _.mapValues(
	{
		relations: "",
		table_columns_view: "",
		view_dependencies: "",
	},
	(_v, k) => readFileSync(join(__dirname, `${k}.sql`), "utf8")
)

export class DbAccessService {
	queryStore = sqlQueries
	constructor(public db: Kysely<any>) {}

	static fromPgConfigs(config: pg.PoolConfig) {
		const db = new Kysely<any>({
			dialect: new PostgresDialect({
				pool: new pg.Pool(config),
			}),
		})
		return new this(db)
	}

	async getTableColumnsView() {
		return sql
			.raw(this.queryStore.table_columns_view)
			.execute(this.db)
			.then(({ rows }) => tableColumnsViewSchema.array().parse(rows))
	}

	async getRelations() {
		return sql
			.raw(this.queryStore.relations)
			.execute(this.db)
			.then(({ rows }) => relationsSchema.array().parse(rows))
	}

	async getViewDependencies() {
		return sql
			.raw(this.queryStore.view_dependencies)
			.execute(this.db)
			.then(({ rows }) => viewDependenciesSchema.array().parse(rows))
	}

	async getAll() {
		return await pProps({
			table_columns_view: this.getTableColumnsView(),
			relations: this.getRelations(),
			view_dependencies: this.getViewDependencies(),
		})
	}
}
