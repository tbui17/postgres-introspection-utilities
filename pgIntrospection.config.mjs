import { config as configenv } from "dotenv"
configenv()

/**
 * @type {import("pg").PoolConfig}
 */
const config = {
	connectionString: process.env.DATABASE_URL,
	idleTimeoutMillis: 100,
}

export default config
